// --- API FUNCTIONS ---
import { drawFigureOnCanvas } from './canvas.js';
import { generateEditedImage } from './editModal.js';
import exportProgress from './exportProgress.js';
import { closeFeedbackModal } from './feedback.js';
import { populateJournalSelector } from './figure.js';
import {
    layoutCustom,
    layoutSpanningGrid,
    layoutVerticalStack
} from './layouts.js';
import { state } from './state.js';
import {
    feedbackSubmitBtn,
    feedbackText,
    getExportDpiCustom,
    getExportDpiSelect
} from './ui.js';

// --- EXPORT FUNCTIONALITY ---
export function setLoadingState(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        if (!button.querySelector('.spinner')) { // Check if spinner already exists
            const spinnerSpan = document.createElement('span');
            spinnerSpan.className = 'spinner';
            button.appendChild(spinnerSpan);
        }
    } else {
        button.disabled = false;
        const spinner = button.querySelector('.spinner');
        if (spinner) spinner.remove();
    }
}

async function generateHighResCanvas() {
    if (state.activeFigureIndex === -1) return null;
    const activeFigure = state.project.figures[state.activeFigureIndex];
    const settings = activeFigure.settings;
    const highResCanvas = document.createElement('canvas');
    const highResCtx = highResCanvas.getContext('2d');

    const exportDpiSelect = getExportDpiSelect();
    const exportDpiCustom = getExportDpiCustom();
    
    if (!exportDpiSelect || !exportDpiCustom) {
        console.warn('Export DPI elements not found');
        return null;
    }

    let targetDpi = parseInt(exportDpiSelect.value);
    if (exportDpiSelect.value === 'custom') {
        targetDpi = parseInt(exportDpiCustom.value) || 300;
        // Validate custom DPI input
        if (targetDpi > 1200) {
            alert('Maximum DPI allowed is 1200. Please enter a lower value.');
            return null;
        }
        if (targetDpi < 50) {
            alert('Minimum DPI allowed is 50. Please enter a higher value.');
            return null;
        }
    }
    const scaleFactor = targetDpi / 96;

    // FIX: Ensure exportPanels have full edits for high-res rendering
    // This is crucial for annotations and cropping to be included in final export.
    const exportPanels = activeFigure.panels.map(panel => ({
        ...panel,
        edits: { ...panel.edits }, // Deep copy edits
        image: panel.image // Keep reference to the currently loaded image object
    }));

    // Process panels in batches to avoid memory issues with high DPI exports
    // Reduce batch size for very high DPI to prevent memory issues
    let batchSize = 3; // Default batch size
    if (scaleFactor >= 8) { // 768+ DPI
        batchSize = 1; // Process one at a time
    } else if (scaleFactor >= 6) { // 576+ DPI
        batchSize = 2; // Process two at a time
    }
    
    const fullyPreparedPanels = [];
    
    for (let i = 0; i < exportPanels.length; i += batchSize) {
        const batch = exportPanels.slice(i, i + batchSize);
        
        // Update progress for high DPI exports
        if (scaleFactor > 4) {
            const progress = Math.round((i / exportPanels.length) * 100);
            console.log(`Processing panels: ${progress}% complete`);
            
            // Update progress modal
            const currentPanel = Math.min(i + batchSize, exportPanels.length);
            exportProgress.updatePanelProgress(currentPanel, exportPanels.length);
            
            // Check for cancellation
            if (exportProgress.checkCancelled()) {
                throw new Error('Export cancelled by user');
            }
        }
    
    // Debug: Log panel information
    console.log(`Batch ${Math.floor(i/batchSize) + 1}: Processing ${batch.length} panels`);
    batch.forEach(panel => {
        console.log(`Panel ${panel.label}: original=${panel.originalWidth}x${panel.originalHeight}`);
    });
        
        const batchPromises = batch.map(panel => {
            console.log(`Processing panel ${panel.label}: pristineSrc=${panel.pristineSrc ? 'exists' : 'missing'}`);
            
            return generateEditedImage(panel.pristineSrc, panel.edits, scaleFactor).then(editedResult => {
                // editedResult may now be a data URL (string) or legacy canvas (object)
                const makeImageBitmapFromDataUrl = (dataUrl) => new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = dataUrl;
                });

                const handleImageSource = (source) => {
                    return createImageBitmap(source).then(imageBitmap => {
                        panel.image = imageBitmap;
                        if (!panel.trueOriginalWidth) {
                            panel.trueOriginalWidth = panel.originalWidth;
                            panel.trueOriginalHeight = panel.originalHeight;
                        }
                        return panel;
                    }).catch(error => {
                        console.warn('ImageBitmap creation failed, using fallback:', error);
                        // Fallback: keep the HTMLImageElement or canvas
                        panel.image = source;
                        if (!panel.trueOriginalWidth) {
                            panel.trueOriginalWidth = panel.originalWidth;
                            panel.trueOriginalHeight = panel.originalHeight;
                        }
                        return panel;
                    });
                };

                if (typeof editedResult === 'string') {
                    return makeImageBitmapFromDataUrl(editedResult).then(img => handleImageSource(img));
                } else if (editedResult instanceof HTMLCanvasElement) {
                    // FIX: Check if this canvas has annotations and preserve it as a canvas
                    // Converting to ImageBitmap loses the annotation drawing context
                    const hasAnnotations = panel.edits && panel.edits.annotations && panel.edits.annotations.length > 0;
                    if (hasAnnotations) {
                        console.log(`🔧 Preserving canvas for panel ${panel.label} to maintain annotations`);
                        panel.image = editedResult; // Keep as canvas to preserve annotations
                        if (!panel.trueOriginalWidth) {
                            panel.trueOriginalWidth = panel.originalWidth;
                            panel.trueOriginalHeight = panel.originalHeight;
                        }
                        return panel;
                    } else {
                        // No annotations, safe to convert to ImageBitmap for performance
                        return handleImageSource(editedResult);
                    }
                } else {
                    console.warn('Unexpected editedResult type from generateEditedImage:', editedResult);
                    return Promise.resolve(panel);
                }
            });
        });
        
        const batchResults = await Promise.all(batchPromises);
        console.log(`Batch ${Math.floor(i/batchSize) + 1} completed. Results:`, batchResults.map(p => ({
            label: p.label,
            imageType: p.image ? (p.image instanceof ImageBitmap ? 'ImageBitmap' : 'Canvas') : 'missing',
            imageDimensions: p.image ? `${p.image.width}x${p.image.height}` : 'N/A'
        })));
        fullyPreparedPanels.push(...batchResults);
        
        // Add a small delay between batches to allow garbage collection
        if (i + batchSize < exportPanels.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    const scaledSpacing = parseInt(settings.spacing) * scaleFactor;
    const scaledLabelSpacing = parseInt(settings.labelSpacing || 0) * scaleFactor;
    const scaledFontSize = parseInt(settings.labelFontSize) * state.PT_TO_PX * scaleFactor;
    const font = `${settings.labelFontWeight} ${scaledFontSize}px ${settings.labelFontFamily}`;
    highResCtx.font = font;
    const textMetrics = highResCtx.measureText('A');
    const scaledLabelHeight = (textMetrics.fontBoundingBoxAscent || scaledFontSize) * 1.2;
    const scaledLabelWidth = textMetrics.width * 2;
    const layoutOptions = { spacing: scaledSpacing, labelPosition: settings.labelPosition, labelWidth: scaledLabelWidth, labelHeight: scaledLabelHeight, maintainAspectRatio: settings.maintainAspectRatio };

    let effectiveLayout = settings.layout;
    let numCols = 1;

    // Preserve the smart layout selection made for the main canvas
    if (effectiveLayout === 'auto') {
        effectiveLayout = activeFigure.effectiveLayout || 'stack';
    }

    if (effectiveLayout === 'grid2x2') numCols = 2;
    if (effectiveLayout === 'grid3x3') numCols = 3;
    if (effectiveLayout === 'grid4xn') numCols = 4;
    if (effectiveLayout === 'grid5xn') numCols = 5;
    if (effectiveLayout === 'grid6xn') numCols = 6;

    // Safety check: ensure allJournalRules is loaded
    if (!state.allJournalRules) {
        console.warn('Journal rules not loaded, using default values');
        return null;
    }
    
    const rules = state.allJournalRules[settings.journal] || state.allJournalRules['Default'];

    // Calculate canvas width with improved logic for visual consistency
    let baseCanvasWidthMM = settings.targetWidth !== null ? settings.targetWidth : rules.doubleColumnWidth_mm;

    // Apply minimum width constraint and scaling for narrow journals
    if (settings.targetWidth === null) { // Only apply to journal-preset widths, not custom widths
        if (baseCanvasWidthMM < state.MIN_CANVAS_WIDTH_MM) {
            // For very narrow journals like Science, scale up for better visual experience
            baseCanvasWidthMM = Math.max(state.MIN_CANVAS_WIDTH_MM, baseCanvasWidthMM * state.JOURNAL_SCALE_FACTOR);
        }
    }

    // Note: Panel dimensions are now handled correctly in the batch processing above
    // The layout functions will use the preserved original dimensions for calculations

    let layoutDimensions;
    switch (effectiveLayout) {
        case 'stack': layoutDimensions = layoutVerticalStack(fullyPreparedPanels, layoutOptions); break;
        case 'grid2x2':
            layoutOptions.baseCanvasWidth = Math.min(10000, baseCanvasWidthMM * state.PIXELS_PER_MM * scaleFactor);
            layoutDimensions = layoutSpanningGrid(fullyPreparedPanels, 2, layoutOptions);
            break;
        case 'grid3x3':
            layoutOptions.baseCanvasWidth = Math.min(10000, baseCanvasWidthMM * state.PIXELS_PER_MM * scaleFactor);
            layoutDimensions = layoutSpanningGrid(fullyPreparedPanels, 3, layoutOptions);
            break;
        case 'grid4xn':
            layoutOptions.baseCanvasWidth = Math.min(10000, baseCanvasWidthMM * state.PIXELS_PER_MM * scaleFactor);
            layoutDimensions = layoutSpanningGrid(fullyPreparedPanels, 4, layoutOptions);
            break;
        case 'grid5xn':
            layoutOptions.baseCanvasWidth = Math.min(10000, baseCanvasWidthMM * state.PIXELS_PER_MM * scaleFactor);
            console.log(`grid5xn: baseCanvasWidthMM=${baseCanvasWidthMM}, scaleFactor=${scaleFactor}, baseCanvasWidth=${layoutOptions.baseCanvasWidth}`);
            layoutDimensions = layoutSpanningGrid(fullyPreparedPanels, 5, layoutOptions);
            break;
        case 'grid6xn':
            layoutOptions.baseCanvasWidth = Math.min(10000, baseCanvasWidthMM * state.PIXELS_PER_MM * scaleFactor);
            console.log(`grid6xn: baseCanvasWidthMM=${baseCanvasWidthMM}, scaleFactor=${scaleFactor}, baseCanvasWidth=${layoutOptions.baseCanvasWidth}`);
            layoutDimensions = layoutSpanningGrid(fullyPreparedPanels, 6, layoutOptions);
            break;
        case 'custom':
            // Scale custom layout properties for high-res export
            fullyPreparedPanels.forEach(panel => {
                panel.customX *= scaleFactor;
                panel.customY *= scaleFactor;
                panel.customWidth *= scaleFactor;
                panel.customHeight *= scaleFactor;
            });
            layoutDimensions = layoutCustom(fullyPreparedPanels, layoutOptions);
            break;
        default: layoutDimensions = layoutVerticalStack(fullyPreparedPanels, layoutOptions); break;
    }

    // Use the full calculated dimensions for proper DPI scaling
    // The intermediate panel generation prevents memory issues while maintaining quality
    highResCanvas.width = layoutDimensions.width;
    highResCanvas.height = layoutDimensions.height;
    
    console.log(`High-res canvas dimensions: ${highResCanvas.width}x${highResCanvas.height} (scale factor: ${scaleFactor})`);

    // Set white background for the canvas to ensure proper rendering
    highResCtx.fillStyle = '#FFFFFF';
    highResCtx.fillRect(0, 0, highResCanvas.width, highResCanvas.height);

    const drawOptions = { 
        ...settings, 
        labelFontSize: parseInt(settings.labelFontSize) * scaleFactor, 
        labelSpacing: scaledLabelSpacing, 
        zoom: 1,
        isExport: true // Mark as export to prevent grid overlay
    };
    // FIX: Skip resizing since it destroys annotations - use high-resolution canvases directly
    // The generateEditedImage function already creates canvases at the correct scale with annotations
    console.log('🔧 Skipping resizing to preserve annotations - using high-resolution canvases directly');
    
    // Debug: Log final panel positions and dimensions
    console.log(`Layout type: ${effectiveLayout}, Scale factor: ${scaleFactor}`);
    fullyPreparedPanels.forEach(panel => {
        const imageType = panel.image ? 
            (panel.image instanceof ImageBitmap ? 'ImageBitmap' : 
             panel.image instanceof HTMLCanvasElement ? 'Canvas' : 
             typeof panel.image) : 'missing';
        const imageDimensions = panel.image ? `${panel.image.width}x${panel.image.height}` : 'N/A';
        console.log(`Panel ${panel.label}: imageX=${panel.imageX}, imageY=${panel.imageY}, displayWidth=${panel.displayWidth}, displayHeight=${panel.displayHeight}, image=${imageType}(${imageDimensions})`);
    });
    
    // FIX: drawFigureOnCanvas should now draw the `image` property of the prepared panels,
    // which already contain the baked-in edits including annotations.
    // So, no need to call drawPanelAnnotationsOnMainCanvas here.
    drawFigureOnCanvas(highResCtx, highResCanvas, layoutDimensions, fullyPreparedPanels, drawOptions); // Use fullyPreparedPanels
    
    // Debug: Check if annotations are visible on the final export canvas
    console.log('🔍 Checking final export canvas for annotations...');
    try {
        // Sample a small area of the final canvas to check for content
        const sampleSize = Math.min(100, highResCanvas.width, highResCanvas.height);
        const finalCanvasImageData = highResCtx.getImageData(0, 0, sampleSize, sampleSize);
        const finalCanvasHasContent = finalCanvasImageData.data.some(pixel => pixel !== 0);
        console.log(`🔍 Final export canvas sample (${sampleSize}x${sampleSize}) has content: ${finalCanvasHasContent}`);
        
        // Also check if we can see any non-white pixels (which would indicate annotations)
        const hasNonWhitePixels = finalCanvasImageData.data.some((pixel, index) => {
            if (index % 4 === 0) { // Check every 4th pixel (R component)
                const r = pixel;
                const g = finalCanvasImageData.data[index + 1];
                const b = finalCanvasImageData.data[index + 2];
                // Check if pixel is not white (allowing for some tolerance)
                return !(r > 250 && g > 250 && b > 250);
            }
            return false;
        });
        console.log(`🔍 Final export canvas has non-white pixels (potential annotations): ${hasNonWhitePixels}`);
    } catch (error) {
        console.log(`🔍 Could not check final export canvas content: ${error.message}`);
    }
    
    // Debug: Check each panel's image before drawing
    console.log('🔍 Panel images before drawing to final export canvas:');
    fullyPreparedPanels.forEach(panel => {
        if (panel.image) {
            console.log(`Panel ${panel.label}: image type=${panel.image.constructor.name}, width=${panel.image.width}, height=${panel.image.height}`);
            
            // Check if the panel image has content (sample a small area to avoid memory issues)
            if (panel.image instanceof HTMLCanvasElement) {
                const panelCtx = panel.image.getContext('2d');
                // Sample a small area instead of the entire canvas
                const sampleSize = Math.min(50, panel.image.width, panel.image.height);
                try {
                    const panelImageData = panelCtx.getImageData(0, 0, sampleSize, sampleSize);
                    const panelHasContent = panelImageData.data.some(pixel => pixel !== 0);
                    console.log(`Panel ${panel.label}: canvas sample (${sampleSize}x${sampleSize}) has content: ${panelHasContent}`);
                    
                    // Check for non-white pixels (potential annotations) in the high-resolution canvas
                    const hasNonWhitePixels = panelImageData.data.some((pixel, index) => {
                        if (index % 4 === 0) { // Check every 4th pixel (R component)
                            const r = pixel;
                            const g = panelImageData.data[index + 1];
                            const b = panelImageData.data[index + 2];
                            // Check if pixel is not white (allowing for some tolerance)
                            return !(r > 250 && g > 250 && b > 250);
                        }
                        return false;
                    });
                    console.log(`Panel ${panel.label}: high-res canvas has non-white pixels (annotations): ${hasNonWhitePixels}`);
                } catch (error) {
                    console.log(`Panel ${panel.label}: Could not check canvas content: ${error.message}`);
                }
            } else if (panel.image instanceof ImageBitmap) {
                // ImageBitmap objects can't be easily checked for content without drawing them
                console.log(`Panel ${panel.label}: ImageBitmap (${panel.image.width}x${panel.image.height}) - content check not available`);
            }
        } else {
            console.log(`Panel ${panel.label}: no image`);
        }
    });
    
    return highResCanvas;
}

export async function exportHighResClientSide(format, button) {
    if (state.activeFigureIndex === -1 || state.project.figures[state.activeFigureIndex].panels.length === 0) { alert("Please upload panels first."); return; }
    
    // Check for potential memory issues with high DPI and many panels
    const activeFigure = state.project.figures[state.activeFigureIndex];
    const numPanels = activeFigure.panels.length;
    
    const exportDpiSelect = getExportDpiSelect();
    const exportDpiCustom = getExportDpiCustom();
    
    if (!exportDpiSelect || !exportDpiCustom) {
        console.warn('Export DPI elements not found');
        return false;
    }
    
    let targetDpi = parseInt(exportDpiSelect.value);
    if (exportDpiSelect.value === 'custom') {
        targetDpi = parseInt(exportDpiCustom.value) || 300;
        // Validate custom DPI input
        if (targetDpi > 1200) {
            alert('Maximum DPI allowed is 1200. Please enter a lower value.');
            return false;
        }
        if (targetDpi < 50) {
            alert('Minimum DPI allowed is 50. Please enter a higher value.');
            return false;
        }
    }
    
    // For high DPI exports with many panels, use backend export instead
    if (targetDpi >= 600 && numPanels >= 5) {
        console.log(`🔍 Export: Using backend export for high DPI (${targetDpi}) with many panels (${numPanels})`);
        return await exportWithBackend(format, button);
    }
    
    if (targetDpi >= 600 && numPanels >= 5) {
        const proceed = confirm(`Warning: Exporting ${numPanels} panels at ${targetDpi} DPI may take longer and use significant memory. Continue?`);
        if (!proceed) {
            return;
        }
    }
    
    setLoadingState(button, true);
    
    // Show progress modal for high DPI exports
    if (targetDpi >= 600) {
        exportProgress.show(format, targetDpi, numPanels);
    }
    
    try {
        const highResCanvas = await generateHighResCanvas();
        console.log(`🔍 Export: Canvas dimensions: ${highResCanvas.width}x${highResCanvas.height}`);
        
        // Update progress to generating canvas stage
        if (targetDpi >= 600) {
            exportProgress.updateStage('Generating canvas...', 'Creating final high-resolution image');
        }
        
        // Generate the correct format directly from the canvas
        let mimeType, quality;
        if (format === 'jpeg') {
            mimeType = 'image/jpeg';
            quality = 0.95;
        } else if (format === 'png') {
            mimeType = 'image/png';
            quality = 1.0;
        } else {
            mimeType = 'image/png';
            quality = 1.0;
        }
        
        const dataUrl = highResCanvas.toDataURL(mimeType, quality);
        console.log(`🔍 Export: Generated ${format.toUpperCase()} data URL, length: ${dataUrl.length}`);
        
        // Update progress to final stage
        if (targetDpi >= 600) {
            exportProgress.updateStage('Preparing download...', 'Creating download link');
        }
        
        const link = document.createElement('a');
        link.download = `figure.${format}`;
        link.href = dataUrl;
        link.click();
        console.log(`🔍 Export: Download link clicked`);
        
        // Complete progress
        if (targetDpi >= 600) {
            exportProgress.complete();
        }
        
        return true; // Indicate successful export
    } catch (error) {
        console.error(`${format.toUpperCase()} Export Error:`, error);
        
        if (targetDpi >= 600) {
            exportProgress.error(error.message);
        } else {
            alert(`Failed to export high-resolution ${format.toUpperCase()}.`);
        }
        
        return false; // Indicate failed export
    } finally {
        setLoadingState(button, false);
        // Force garbage collection for high DPI exports
        if (targetDpi >= 600) {
            setTimeout(() => {
                if (window.gc) {
                    window.gc();
                }
            }, 1000);
        }
    }
}

export async function exportWithBackend(format, button) {
    if (state.activeFigureIndex === -1 || state.project.figures[state.activeFigureIndex].panels.length === 0) { alert("Please upload panels first."); return; }
    
    // Check for potential memory issues with high DPI and many panels
    const activeFigure = state.project.figures[state.activeFigureIndex];
    const numPanels = activeFigure.panels.length;
    
    const exportDpiSelect = getExportDpiSelect();
    const exportDpiCustom = getExportDpiCustom();
    
    if (!exportDpiSelect || !exportDpiCustom) {
        console.warn('Export DPI elements not found');
        return false;
    }
    
    let targetDpi = parseInt(exportDpiSelect.value);
    if (exportDpiSelect.value === 'custom') {
        targetDpi = parseInt(exportDpiCustom.value) || 300;
        // Validate custom DPI input
        if (targetDpi > 1200) {
            alert('Maximum DPI allowed is 1200. Please enter a lower value.');
            return false;
        }
        if (targetDpi < 50) {
            alert('Minimum DPI allowed is 50. Please enter a higher value.');
            return false;
        }
    }
    
    if (targetDpi >= 600 && numPanels >= 5) {
        const proceed = confirm(`Warning: Exporting ${numPanels} panels at ${targetDpi} DPI may take longer and use significant memory. Continue?`);
        if (!proceed) {
            return;
        }
    }
    
    setLoadingState(button, true);
    
    // Show progress modal for high DPI exports
    if (targetDpi >= 600) {
        exportProgress.show(format, targetDpi, numPanels);
    }
    
    try {
        const highResCanvas = await generateHighResCanvas();
        console.log(`🔍 Backend Export: Canvas dimensions: ${highResCanvas.width}x${highResCanvas.height}`);
        
        // Update progress to generating canvas stage
        if (targetDpi >= 600) {
            exportProgress.updateStage('Generating canvas...', 'Creating final high-resolution image');
        }
        
        // Generate the correct format directly from the canvas
        // Replace dataURL JSON upload with binary multipart upload
        // Generate source raster (PNG for most, JPEG when requested) for backend conversion
        let sourceMime, quality;
        if (format === 'jpeg') { sourceMime = 'image/jpeg'; quality = 0.88; } else { sourceMime = 'image/png'; quality = 0.95; }
        const blob = await new Promise((resolve, reject) => {
            try {
                highResCanvas.toBlob(b => {
                    if (!b) return reject(new Error('Canvas toBlob failed'));
                    resolve(b);
                }, sourceMime, quality);
            } catch (e) { reject(e); }
        });
        console.log(`🔍 Backend Export: Blob created type=${blob.type} size=${blob.size} bytes (format=${format})`);
        if (targetDpi >= 600) {
            exportProgress.updateStage('Uploading to server...', 'Sending image data');
        }
        const fd = new FormData();
        fd.append('image', blob, `figure_source.${format === 'jpeg' ? 'jpg' : 'png'}`);
        fd.append('dpi', String(targetDpi));
        fd.append('format', format);
        fd.append('journal', state.project.figures[state.activeFigureIndex].settings.journal);
        if (format === 'jpeg') fd.append('quality', String(Math.round(quality * 100)));
        const base = (window.APP_BASE || '').replace(/\/$/, '');
        // Force JSON mode for all formats to avoid proxy/WAF 500s on binary attachments
        let useJsonMode = true; // previously only pdf/tiff; now always true
        let endpoint = `${base}/api/export-${format}${useJsonMode ? '?mode=json' : ''}`;
        console.log(`Export request -> ${endpoint} (dpi=${targetDpi}, panels=${numPanels}, jsonMode=${useJsonMode})`);
        let startedAt = performance.now(); // was const, needs reassignment on retry
        let response = await fetch(endpoint, { method: 'POST', body: fd });
        let elapsed = (performance.now() - startedAt).toFixed(0);
        if (!response.ok && !useJsonMode) {
            console.warn(`Retrying with JSON mode after status=${response.status}`);
            endpoint = `${base}/api/export-${format}?mode=json`;
            startedAt = performance.now();
            response = await fetch(endpoint, { method: 'POST', body: fd });
            elapsed = (performance.now() - startedAt).toFixed(0);
            useJsonMode = true;
        }
        if (!response.ok) {
            const ct = response.headers.get('content-type') || '';
            let serverMsg = '';
            try {
                if (ct.includes('application/json')) {
                    const jd = await response.json();
                    serverMsg = jd.error + (jd.details ? `: ${jd.details}` : '');
                } else {
                    serverMsg = (await response.text()).slice(0, 300);
                }
            } catch (parseErr) {
                serverMsg = `parse_error: ${parseErr}`;
            }
            console.error(`Export backend error (multipart) status=${response.status} time=${elapsed}ms msg=${serverMsg}`);
            throw new Error(serverMsg || `HTTP ${response.status}`);
        }
        console.log(`Export backend success status=${response.status} time=${elapsed}ms jsonMode=${useJsonMode}`);
        if (useJsonMode) {
            const ct = response.headers.get('content-type') || '';
            let data;
            if (ct.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON response'); }
            }
            if (!data || !data.base64) throw new Error('Missing base64 in JSON response');
            const bstr = atob(data.base64);
            const bytes = new Uint8Array(bstr.length);
            for (let i=0;i<bstr.length;i++) bytes[i] = bstr.charCodeAt(i);
            const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', tiff: 'image/tiff', pdf: 'application/pdf' };
            const blobResult = new Blob([bytes], { type: mimeMap[format] || 'application/octet-stream' });
            if (targetDpi >= 600) exportProgress.updateStage('Preparing download...', 'Creating download link');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blobResult);
            link.download = `figure.${format}`;
            link.click();
            URL.revokeObjectURL(link.href);
            if (targetDpi >= 600) exportProgress.complete();
            return true;
        }
        const blobResult = await response.blob();
        console.log(`🔍 Backend Export: Received blob, size: ${blobResult.size} bytes`);
        
        // Update progress to final stage
        if (targetDpi >= 600) {
            exportProgress.updateStage('Preparing download...', 'Creating download link');
        }
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blobResult);
        link.download = `figure.${format}`;
        link.click();
        URL.revokeObjectURL(link.href);
        if (targetDpi >= 600) {
            exportProgress.complete();
        }
        return true;
    } catch (error) {
        console.error(`Export Error (${format}):`, error);
        
        if (targetDpi >= 600) {
            exportProgress.error(error.message);
        } else {
            alert(`Failed to export ${format.toUpperCase()}: ${error.message}`);
        }
        
        return false; // Indicate failed export
    } finally {
        setLoadingState(button, false);
        // Force garbage collection for high DPI exports
        if (targetDpi >= 600) {
            setTimeout(() => {
                if (window.gc) {
                    window.gc();
                }
            }, 1000);
        }
    }
}

export async function loadJournalRules() {
    try {
        const base = (window.APP_BASE || '').replace(/\/$/, '');
        const url = `${base}/api/journal-rules`;
        const t0 = performance.now();
        const response = await fetch(url, { headers: { 'Accept': 'application/json' }});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.allJournalRules = await response.json();
        console.log(`Journal rules loaded ok in ${(performance.now()-t0).toFixed(0)}ms`);
        populateJournalSelector();
    } catch (error) {
        console.error("Error loading journal rules:", error);
        // Fallback: try loading static JSON directly if available
        try {
            const staticRulesResp = await fetch(`${window.STATIC_BASE}/journal_rules.json`);
            if (staticRulesResp.ok) {
                state.allJournalRules = await staticRulesResp.json();
                populateJournalSelector();
                return;
            }
        } catch (_) {}
        state.allJournalRules = { 
            Default: { 
                singleColumnWidth_mm: 90, 
                doubleColumnWidth_mm: 180,
                maxHeight_mm: 240,
                dpi_halftone: 300, 
                font_min_pt: 7 
            } 
        };
        populateJournalSelector();
    }
}

export async function submitFeedback() {
    const feedbackContent = feedbackText ? feedbackText.value.trim() : '';

    // At least rating or feedback text is required
    if (!state.selectedRating && !feedbackContent) {
        alert('Please provide a rating or feedback text.');
        return;
    }

    setLoadingState(feedbackSubmitBtn, true);
    feedbackSubmitBtn.textContent = 'Sending...';

    try {
        const base = (window.APP_BASE || '').replace(/\/$/, '');
        const response = await fetch(`${base}/api/submit-feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rating: state.selectedRating,
                feedback: feedbackContent,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            })
        });

        if (response.ok) {
            feedbackSubmitBtn.textContent = 'Thank you!';
            feedbackSubmitBtn.style.background = 'linear-gradient(145deg, #20c997, #17a2b8)';
            setTimeout(() => {
                closeFeedbackModal();
            }, 1500);
        } else {
            throw new Error('Failed to submit feedback');
        }
    } catch (error) {
        console.error('Feedback submission error:', error);
        alert('Failed to submit feedback. Please try again.');
        feedbackSubmitBtn.textContent = 'Submit';
    } finally {
        setLoadingState(feedbackSubmitBtn, false);
    }
}