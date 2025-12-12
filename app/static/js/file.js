import {
    renderFigure,
} from './canvas.js';
import { generateEditedImage } from './editModal.js';
import { switchFigure, updateAuxiliaryUI, updateLayoutButtonSelection } from './figure.js';
import {
    getCurrentState,
    initializeHistoryButtons,
    saveState,
    updateHistoryButtons
} from './history.js';
import { state } from './state.js';
import * as ui from './ui.js';
import uploadProgress from './uploadProgress.js';

// --- FILE HANDLING LOGIC ---

// Helper functions for Smart Layout loading dialog
export function showSmartLayoutLoadingDialog() {
    if (ui.smartLayoutLoadingModal) {
        ui.smartLayoutLoadingModal.classList.remove('hidden');
    }
}

export function hideSmartLayoutLoadingDialog() {
    if (ui.smartLayoutLoadingModal) {
        ui.smartLayoutLoadingModal.classList.add('hidden');
    }
}

// -- TIFF utilities: detect common incompatibilities and generate friendly errors --
function isBigTiff(buffer) {
    try {
        if (!buffer || buffer.byteLength < 4) return false;
        const b = new Uint8Array(buffer.slice(0, 8));
        // BigTIFF signatures: II 2B 00 ... or MM 00 2B ...
        const little = b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2B && b[3] === 0x00;
        const big = b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2B;
        return little || big;
    } catch (_) { return false; }
}

function friendlyTiffErrorMessage(fileName, err, buffer) {
    if (isBigTiff(buffer)) {
        return `The file '${fileName}' appears to be a BigTIFF (64-bit) file, which cannot be opened in the browser. Please re-save as a classic TIFF (uncompressed or LZW) or convert to PNG.`;
    }
    const message = (err && err.message ? String(err.message) : String(err || '')) || '';
    const lower = message.toLowerCase();
    if (lower.includes('compression')) {
        return `The TIFF '${fileName}' uses a compression method that isn't supported by the in-browser decoder. Re-save as uncompressed or LZW-compressed TIFF, or convert to PNG.`;
    }
    if ((lower.includes('bits') || lower.includes('bit')) && lower.includes('sample')) {
        return `The TIFF '${fileName}' may use a bit depth not supported by the browser decoder (e.g., 16/32-bit). Please convert to 8-bit per channel or PNG.`;
    }
    if (lower.includes('planar') || lower.includes('tiled')) {
        return `The TIFF '${fileName}' uses a layout not supported by the in-browser decoder (tiled/planar). Please re-save as stripped RGB TIFF or convert to PNG.`;
    }
    if (lower.includes('jpeg') || lower.includes('jpeg2000') || lower.includes('jp2')) {
        return `The TIFF '${fileName}' is JPEG/JPEG2000 compressed, which isn't supported here. Re-save as LZW/uncompressed TIFF or PNG.`;
    }
    if (lower.includes('not a tiff') || lower.includes('invalid') || lower.includes('corrupt')) {
        return `The file '${fileName}' couldn't be recognized as a valid TIFF. It might be corrupted or mislabeled.`;
    }
    if (lower.includes('memory')) {
        return `The TIFF '${fileName}' is too large to decode in the browser. Try downscaling or converting to PNG.`;
    }
    return `Could not open '${fileName}'. It may use unsupported TIFF features (BigTIFF, compression, 16/32-bit) or be corrupted. Try converting to PNG or classic LZW TIFF.`;
}

export async function handleFiles(files) {
    const filesArray = Array.from(files || []);
    const supportedExts = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.svg'];
    const supportedMimes = new Set(['image/png', 'image/jpeg', 'image/tiff', 'image/svg+xml']);
    const isSupported = (file) => {
        const name = (file && file.name ? String(file.name) : '').toLowerCase();
        const type = (file && file.type ? String(file.type) : '').toLowerCase();
        const extOk = supportedExts.some(ext => name.endsWith(ext));
        const typeOk = supportedMimes.has(type);
        return extOk || typeOk;
    };
    const imageFiles = filesArray.filter(isSupported);
    const rejectedFiles = filesArray.filter(f => !isSupported(f));

    if (rejectedFiles.length > 0) {
        const unsupportedList = rejectedFiles.map(f => `- ${f.name || 'Unknown file'}`).join('\n');
        alert(
            `Unsupported file type selected:\n${unsupportedList}\n\n` +
            `Supported types: PNG (.png), JPEG (.jpg, .jpeg), TIFF (.tif, .tiff), SVG (.svg).\n\n` +
            `Please convert to a supported format and try again.`
        );
    }
    if (imageFiles.length === 0) return;
    if (state.activeFigureIndex === -1) {
        alert("Please add a figure first before uploading panels.");
        return;
    }

    const activeFigure = state.project.figures[state.activeFigureIndex];
    if(activeFigure.panels.length > 0 && !confirm("This will replace all existing panels for the current figure. Continue?")) {
        return;
    }
    const previousPanels = activeFigure.panels.slice();

    // Show upload progress modal
    const totalBytes = imageFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    // Create a shared AbortController to allow cancel
    const abortController = new AbortController();
    let cancelled = false;
    let cancelledReason = null;
    let currentReader = null;
    uploadProgress.show(imageFiles.length, totalBytes, { abortController, onCancel: (reason) => { 
        cancelled = true; 
        cancelledReason = reason || 'cancel';
        if (currentReader && typeof currentReader.abort === 'function') {
            try { currentReader.abort(); } catch (_) {}
        }
    } });

    const builtPanels = [];

    for (let index = 0; index < imageFiles.length; index++) {
        const file = imageFiles[index];
        const panel = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            currentReader = reader;
            const processDataUrl = (dataUrl, fileType) => {
                const img = new Image();
                img.onload = () => {
                    resolve({
                        id: 'panel_' + Date.now() + "_" + index,
                        image: img,
                        originalWidth: img.width, originalHeight: img.height,
                        x: 0, y: 0, displayWidth: 0, displayHeight: 0,
                        order: index, label: String.fromCharCode(65 + index),
                        originalSrc: dataUrl, originalFileType: fileType,
                        pristineSrc: dataUrl,
                        edits: {
                            crop: null, brightness: 100, contrast: 100, greyscale: 0, rotation: 0,
                            annotations: [],
                            layoutSpan: { colspan: 1, rowspan: 1 }
                        },
                        // Custom layout properties
                        customX: index * 220,
                        customY: index * 220,
                        customWidth: 200,
                        customHeight: 200
                    });
                };
                img.onerror = () => reject(`Could not load image data for ${file.name}.`);
                img.src = dataUrl;
            };

            // Start progress for this file
            uploadProgress.startFile(index + 1, file.name, file.size || 0);

            if (file.name.toLowerCase().endsWith('.tiff') || file.name.toLowerCase().endsWith('.tif')) {
                // Heuristic: large TIFFs are routed directly to backend to avoid tiff.js memory errors
                const preferBackend = (typeof file.size === 'number') && file.size > (12 * 1024 * 1024);
                if (preferBackend) {
                    (async () => {
                        try {
                            const form = new FormData();
                            form.append('image', file, file.name);
                            const base = (window.APP_BASE || '').replace(/\/$/, '');
                            uploadProgress.updateProcessing('Non-decodable file detected.');
                            const resp = await fetch(`${base}/api/convert-tiff`, { method: 'POST', body: form, signal: abortController.signal });
                            const json = await resp.json();
                            if (!resp.ok || !json || !json.ok) {
                                throw new Error(json && json.error ? json.error : 'server_error');
                            }
                            uploadProgress.updateProcessing('Converting to PNG on server (this does not affect export quality)...');
                            const dataUrl = `data:image/png;base64,${json.base64}`;
                            processDataUrl(dataUrl, 'image/png');
                        } catch (backendErr) {
                            if (abortController.signal.aborted) return reject('Upload cancelled');
                            reject(friendlyTiffErrorMessage(file.name, backendErr));
                        }
                    })();
                    return; // Skip client-side path entirely
                }

                // Track read progress where supported
                reader.readAsArrayBuffer(file);
                reader.onload = (e) => {
                    try {
                        const buf = e.target.result;
                        if (isBigTiff(buf)) {
                            return reject(friendlyTiffErrorMessage(file.name, null, buf));
                        }
                        const tiff = new Tiff({ buffer: buf });
                        processDataUrl(tiff.toCanvas().toDataURL(), 'image/png');
                    } catch (err) {
                        // Backend fallback: send TIFF to server for conversion
                        (async () => {
                            try {
                                const form = new FormData();
                                form.append('image', file, file.name);
                                const base = (window.APP_BASE || '').replace(/\/$/, '');
                                uploadProgress.updateProcessing('Non-decodable file detected.');
                                const resp = await fetch(`${base}/api/convert-tiff`, { method: 'POST', body: form, signal: abortController.signal });
                                const json = await resp.json();
                                if (!resp.ok || !json || !json.ok) {
                                    throw new Error(json && json.error ? json.error : 'server_error');
                                }
                                uploadProgress.updateProcessing('Converting to PNG on server (this does not affect export quality)...');
                                const dataUrl = `data:image/png;base64,${json.base64}`;
                                processDataUrl(dataUrl, 'image/png');
                            } catch (_) {
                                if (abortController.signal.aborted) return reject('Upload cancelled');
                                reject(friendlyTiffErrorMessage(file.name, err, e && e.target ? e.target.result : undefined));
                            }
                        })();
                    }
                };
                reader.onabort = () => reject('Upload cancelled');
                reader.onprogress = (ev) => {
                    if (ev && ev.lengthComputable) {
                        uploadProgress.updateUploadProgress(ev.loaded, ev.total);
                    }
                };
            } else if (file.name.toLowerCase().endsWith('.svg')) {
                reader.readAsText(file);
                reader.onprogress = (ev) => {
                    if (ev && ev.lengthComputable) {
                        uploadProgress.updateUploadProgress(ev.loaded, ev.total);
                    }
                };
                reader.onload = (e) => {
                    if (e.target.result) {
                        // FIX: Convert SVG to a base64 data URL instead of a blob URL
                        const svgDataUrl = `data:image/svg+xml;base64,${btoa(e.target.result)}`;
                        processDataUrl(svgDataUrl, 'image/svg+xml');
                    } else {
                        reject(`Could not read SVG file ${file.name}: Empty result`);
                    }
                };
                reader.onabort = () => reject('Upload cancelled');
            } else {
                reader.readAsDataURL(file);
                reader.onprogress = (ev) => {
                    if (ev && ev.lengthComputable) {
                        uploadProgress.updateUploadProgress(ev.loaded, ev.total);
                    }
                };
                reader.onload = (e) => {
                    if (e.target.result) {
                        processDataUrl(e.target.result, file.type || 'image/png');
                    } else {
                        reject(`Could not read file ${file.name}: Empty result`);
                    }
                };
                reader.onabort = () => reject('Upload cancelled');
            }
            reader.onerror = (err) => {
                console.error(`File reading error for ${file.name}:`, err);
                reject(`Could not read file ${file.name}: File reading failed`);
            };
        });
        builtPanels.push(panel);
        if (cancelled || abortController.signal.aborted) {
            break;
        }
    }
    catchPerFile: {
        // Wrap per-file processing to gracefully handle cancellation
        try { /* no-op label for clarity */ } catch (_) {}
    }

    try {
        if (cancelled || abortController.signal.aborted) {
            // Restore previous panels, close modal; do not alter layout/state
            activeFigure.panels = previousPanels;
            uploadProgress.hide();
            return;
        }
        activeFigure.panels = builtPanels;
        uploadProgress.completeAll();

        // Check if Smart Layout is active for initial uploads
        if (activeFigure.settings.layout === 'auto') {
            // Show loading dialog for Smart Layout
            showSmartLayoutLoadingDialog();

            // Update auxiliary UI first
            updateAuxiliaryUI();

            // Add delay for Smart Layout computation
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Update state and render
            renderFigure();

            // --- FIX: Ensure container is sized correctly after loading panels ---
            if (state.containerSizeMode === 'auto') {
                window.setContainerSize('auto');
            }

            // Hide loading dialog
            hideSmartLayoutLoadingDialog();

            // Initialize history with the first state (panels just loaded)
            state.historyStack = [getCurrentState()];
            state.redoStack = [];
            updateHistoryButtons();
        } else {
            // For non-Smart Layout, proceed normally
            updateAuxiliaryUI();
            renderFigure();

            // Initialize history with the first state (panels just loaded)
            state.historyStack = [getCurrentState()];
            state.redoStack = [];
            updateHistoryButtons();
        }
    } catch (error) {
        console.error("Error processing files:", error);
        hideSmartLayoutLoadingDialog(); // Ensure dialog is hidden on error
        if (cancelled || abortController.signal.aborted || String(error).includes('Upload cancelled')) {
            // Treat as user-cancelled: restore previous state and ensure modal is closed
            activeFigure.panels = previousPanels;
            uploadProgress.hide();
            return;
        }
        uploadProgress.error(String(error));
        alert("Error: " + error);
    }
}

export function loadProject(projectState) {
    if (!projectState || !projectState.figures) {
        alert("Invalid project file.");
        return;
    }
    state.project = { figures: [] };
    state.activeFigureIndex = projectState.activeFigureIndex;

    const figurePromises = projectState.figures.map(savedFigure => {
        return new Promise(resolveFigure => {
            const panelPromises = savedFigure.panels.map(savedPanel => {
                return new Promise(async (resolvePanel) => {
                    // FIX: Ensure generateEditedImage correctly bakes annotations when loading
                    const editedResult = await generateEditedImage(savedPanel.pristineSrc, savedPanel.edits); //
                    
                    // FIX: Handle both canvas elements and data URLs from generateEditedImage
                    let editedSrc;
                    if (editedResult instanceof HTMLCanvasElement) {
                        // Convert canvas to data URL for display purposes
                        editedSrc = editedResult.toDataURL('image/png');
                    } else if (typeof editedResult === 'string') {
                        // Legacy support for data URLs
                        editedSrc = editedResult;
                    } else {
                        throw new Error('Unexpected result type from generateEditedImage');
                    }
                    
                    const img = new Image();
                    img.onload = () => resolvePanel({
                        ...savedPanel,
                        image: img,
                        originalWidth: img.width, // Set to edited image dimensions
                        originalHeight: img.height, //
                        originalSrc: editedSrc, // originalSrc now refers to the edited image data URL
                        id: 'panel_' + Date.now() + Math.random(), // Ensure unique ID on load
                    });
                    img.src = editedSrc;
                });
            });
            Promise.all(panelPromises).then(rebuiltPanels => {
                resolveFigure({ ...savedFigure, panels: rebuiltPanels });
            });
        });
    });

    Promise.all(figurePromises).then(rebuiltFigures => {
        state.project.figures = rebuiltFigures;
        initializeHistoryButtons();
        switchFigure(state.activeFigureIndex, false);
        // Only save state if we actually have panels loaded
        if (rebuiltFigures.some(fig => fig.panels && fig.panels.length > 0) && !state.isRestoringState) {
            saveState();
        }
    });
}

// --- DEMO LOADING ---

export async function loadDemoPanels(demoNumber) {
    const demoMappings = {
        1: [
            'Demo1_panel1.tiff',
            'Demo1_panel2.tiff',
            'Demo1_panel3.tiff',
            'Demo1_panel4.tiff'
        ],
        2: [
            'Demo2_panel1.svg',
            'Demo2_panel2.svg',
            'Demo2_panel3.svg',
            'Demo2_panel4.svg'
        ],
        3: [
            'Demo3_Panel1.png',
            'Demo3_Panel2.png',
            'Demo3_Panel3.png',
            'Demo3_Panel4.png',
            'Demo3_Panel5.png',
            'Demo3_Panel6.png',
            'Demo3_Panel7.png'
        ]
    };

    if (!demoMappings[demoNumber]) return;

    const base = (window.STATIC_BASE || '').replace(/\/$/, '');
    const imagePaths = demoMappings[demoNumber].map(f => `${base}/demo/${f}`);
    console.log('Loading demo', demoNumber, 'with paths:', imagePaths);

    if (state.activeFigureIndex === -1) {
        alert("Please add a figure first before loading a demo.");
        return;
    }

    // Show loading dialog immediately
    showSmartLayoutLoadingDialog();

    // Initial delay for loading panels
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Clear existing panels
    const activeFigure = state.project.figures[state.activeFigureIndex];
    if (activeFigure) {
        activeFigure.effectiveLayout = null;
        activeFigure.settings.layout = 'auto';
        activeFigure.panels = [];
    }

    try {
        // Process each demo image
        const panelPromises = imagePaths.map((imagePath, index) => {
            return new Promise((resolve, reject) => {
                // Check if it's a TIFF file
                const isTiff = imagePath.toLowerCase().endsWith('.tiff') || imagePath.toLowerCase().endsWith('.tif');

                if (isTiff) {
                    // Handle TIFF files using fetch and tiff.js
                    fetch(imagePath)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Failed to fetch TIFF file: ${response.status}`);
                            }
                            return response.arrayBuffer();
                        })
                        .then(buffer => {
                            try {
                                if (isBigTiff(buffer)) {
                                    throw new Error(friendlyTiffErrorMessage(imagePath, null, buffer));
                                }
                                const tiff = new Tiff({ buffer: buffer });
                                const canvas = tiff.toCanvas();
                                const dataUrl = canvas.toDataURL('image/png');

                                const img = new Image();
                                img.onload = () => {
                                    const panel = {
                                        id: 'panel_' + Date.now() + "_" + index,
                                        image: img,
                                        originalWidth: img.width,
                                        originalHeight: img.height,
                                        x: 0,
                                        y: 0,
                                        displayWidth: 0,
                                        displayHeight: 0,
                                        order: index,
                                        label: String.fromCharCode(65 + index),
                                        originalSrc: dataUrl,
                                        pristineSrc: dataUrl,
                                        originalFileType: 'image/png',
                                        edits: {
                                            crop: null,
                                            brightness: 100,
                                            contrast: 100,
                                            greyscale: 0,
                                            rotation: 0,
                                            annotations: [],
                                            layoutSpan: { colspan: 1, rowspan: 1 }
                                        },
                                        customX: index * 220,
                                        customY: index * 220,
                                        customWidth: 200,
                                        customHeight: 200
                                    };
                                    resolve(panel);
                                };
                                img.onerror = () => reject(`Failed to load converted TIFF image: ${imagePath}`);
                                img.src = dataUrl;
                            } catch (tiffError) {
                                const msg = tiffError && tiffError.message && tiffError.message.startsWith('The file')
                                    ? tiffError.message
                                    : friendlyTiffErrorMessage(imagePath, tiffError, buffer);
                                reject(msg);
                            }
                        })
                        .catch(fetchError => {
                            reject(`Failed to fetch TIFF file ${imagePath}: ${fetchError.message}`);
                        });
                } else {
                    // Handle regular image files
                    const img = new Image();

                    img.onload = () => {
                        // Determine file type from extension
                        let fileType = 'image/png';
                        if (imagePath.toLowerCase().endsWith('.jpg') || imagePath.toLowerCase().endsWith('.jpeg')) {
                            fileType = 'image/jpeg';
                        } else if (imagePath.toLowerCase().endsWith('.png')) {
                            fileType = 'image/png';
                        } else if (imagePath.toLowerCase().endsWith('.svg')) {
                            fileType = 'image/svg+xml';
                        }

                        const panel = {
                            id: 'panel_' + Date.now() + "_" + index,
                            image: img,
                            originalWidth: img.width,
                            originalHeight: img.height,
                            x: 0,
                            y: 0,
                            displayWidth: 0,
                            displayHeight: 0,
                            order: index,
                            label: String.fromCharCode(65 + index),
                            originalSrc: imagePath,
                            pristineSrc: imagePath,
                            originalFileType: fileType,
                            edits: {
                                crop: null,
                                brightness: 100,
                                contrast: 100,
                                greyscale: 0,
                                rotation: 0,
                                annotations: [],
                                layoutSpan: { colspan: 1, rowspan: 1 }
                            },
                            customX: index * 220,
                            customY: index * 220,
                            customWidth: 200,
                            customHeight: 200
                        };
                        resolve(panel);
                    };

                    img.onerror = () => {
                        reject(`Could not load demo image: ${imagePath}`);
                    };

                    img.src = imagePath;
                }
            });
        });

        // Wait for all panels to load
        const loadedPanels = await Promise.all(panelPromises);

        // Add panels to active figure
        activeFigure.panels = loadedPanels;

        // Set layout to auto (Smart Layout)
        activeFigure.settings.layout = 'auto';
        updateLayoutButtonSelection('auto');

        // Initialize buttons as disabled before any changes
        initializeHistoryButtons();

        // Update auxiliary UI first
        updateAuxiliaryUI();

        // Additional delay before Smart Layout computation
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Render first
        renderFigure();

                    // --- FIX: Ensure container is sized correctly after loading demo panels ---
            if (state.containerSizeMode === 'auto') {
                window.setContainerSize('auto');
            }

        // Hide loading dialog after everything is complete
        hideSmartLayoutLoadingDialog();

        // Initialize history with the first state (panels just loaded)
        state.historyStack = [getCurrentState()];
        state.redoStack = [];
        updateHistoryButtons();

        console.log(`Demo ${demoNumber} panels loaded successfully`);
        console.log('📊 History stack after loading demo:', {
            historyLength: state.historyStack.length,
            redoLength: state.redoStack.length,
            undoButtonDisabled: ui.undoBtn.disabled
        });

    } catch (error) {
        console.error(`Error loading demo ${demoNumber} panels:`, error);
        hideSmartLayoutLoadingDialog(); // Ensure dialog is hidden on error
        alert(`Error loading demo ${demoNumber} panels. Some images may not be available.`);
        throw error; // Re-throw to trigger button error state
    }
}
