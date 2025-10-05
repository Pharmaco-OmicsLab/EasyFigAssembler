import { drawFigureOnCanvas } from './canvas.js';
import { generateEditedImage } from './editModal.js';
import { isFloatingPreviewVisible } from './floatingPreview.js';
import {
    layoutCustom,
    layoutSpanningGrid,
    layoutVerticalStack
} from './layouts.js';
import { state } from './state.js';
import * as ui from './ui.js';

/**
 * Initialize preview resize observer event listeners
 */
export function initializePreviewEventListeners() {
    // Add resize observer to update canvas when preview is resized
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(entries => {
            // Debounce resize updates
            if (state.resizeTimeout) {
                clearTimeout(state.resizeTimeout);
            }

            state.resizeTimeout = setTimeout(() => {
                for (let entry of entries) {
                    const rect = entry.contentRect;
                    const currentResizeHash = `${entry.target.id}-${Math.round(rect.width)}-${Math.round(rect.height)}`;

                    // Only update if size actually changed significantly
                    if (currentResizeHash === state.lastResizeHash) {
                        continue;
                    }
                    state.lastResizeHash = currentResizeHash;

                    if (entry.target === ui.editModalPreview) {
                        // Only enforce collapse state constraints when collapsed
                        if (ui.editModalPreview.classList.contains('collapsed')) {
                            ui.editModalPreview.style.height = '50px';
                            ui.editModalPreview.style.minHeight = '50px';
                            ui.editModalPreview.style.maxHeight = '50px';
                        } else {
                            // When expanded, completely avoid overriding CSS resize properties
                            // Only trigger canvas update without modifying dimensions
                            if (rect.width > 50 && rect.height > 50) {
                                // Force update for resize without touching style properties
                                updateMiniPreview(true);
                            }
                        }
                    }
                }
            }, 100); // Faster response for better user experience
        });

        if (ui.editModalPreview) {
            resizeObserver.observe(ui.editModalPreview);
        }
    }
}

/**
 * Initialize edit modal preview toggle functionality
 */
export function initializeEditModalPreviewEventListeners() {
    // Edit modal preview toggle functionality
    if (ui.editPreviewToggleBtn && ui.editModalPreview) {
        const toggleEditPreview = (e) => {
            e.stopPropagation();
            const isCollapsed = ui.editModalPreview.classList.contains('collapsed');

            if (isCollapsed) {
                ui.editModalPreview.classList.remove('collapsed');
                ui.editModalPreview.classList.add('expanded');
                // Clear forced constraints when expanding
                ui.editModalPreview.style.height = '';
                ui.editModalPreview.style.minHeight = '';
                ui.editModalPreview.style.maxHeight = '';
            } else {
                ui.editModalPreview.classList.add('collapsed');
                ui.editModalPreview.classList.remove('expanded');
                // Force height to 50px when collapsing
                ui.editModalPreview.style.height = '50px';
                ui.editModalPreview.style.minHeight = '50px';
                ui.editModalPreview.style.maxHeight = '50px';
            }
        };

        ui.editPreviewToggleBtn.addEventListener('click', toggleEditPreview);
    }
}

// Global debouncing mechanism for mini preview updates
// FIX: Remove local variables and use global state
// let globalPreviewUpdateTimeout = null;
// let isPreviewUpdateScheduled = false;
// let lastUpdateHash = null; // Track if there are actual changes

// UPDATED: This function updates the mini preview canvas with real-time edits
export function updateMiniPreview(forceUpdate = false) {
    // Prevent multiple simultaneous calls unless forced
    if (state.isPreviewUpdateScheduled && !forceUpdate) {
        return;
    }

    // Only update if we have an active figure and panels
    if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex] ||
        !state.project.figures[state.activeFigureIndex].panels ||
        state.project.figures[state.activeFigureIndex].panels.length === 0) {
        return;
    }

    // Create a more comprehensive hash of current state to catch all changes
    const activeFigure = state.project.figures[state.activeFigureIndex];
    const currentHash = JSON.stringify({
        panelCount: activeFigure.panels.length,
        layout: activeFigure.settings.layout,
        effectiveLayout: activeFigure.effectiveLayout,
        spacing: activeFigure.settings.spacing,
        labelPosition: activeFigure.settings.labelPosition,
        labelStyle: activeFigure.settings.labelStyle,
        labelFontSize: activeFigure.settings.labelFontSize,
        labelFontFamily: activeFigure.settings.labelFontFamily,
        labelFontWeight: activeFigure.settings.labelFontWeight,
        labelSpacing: activeFigure.settings.labelSpacing,
        maintainAspectRatio: activeFigure.settings.maintainAspectRatio,
        targetWidth: activeFigure.settings.targetWidth,
        journal: activeFigure.settings.journal,
        // Include panel positions and properties that change during interaction
        panelStates: activeFigure.panels.map(panel => ({
            id: panel.id,
            order: panel.order,
            label: panel.label,
            imageX: panel.imageX,
            imageY: panel.imageY,
            displayWidth: panel.displayWidth,
            displayHeight: panel.displayHeight,
            customX: panel.customX,
            customY: panel.customY,
            customWidth: panel.customWidth,
            customHeight: panel.customHeight,
            edits: panel.edits
        })),
        editingPanel: state.currentlyEditingPanel ? state.currentlyEditingPanel.id : null,
        editingValues: state.currentlyEditingPanel ? {
            brightness: ui.brightnessSlider ? ui.brightnessSlider.value : 100,
            contrast: ui.contrastSlider ? ui.contrastSlider.value : 100,
            rotation: ui.rotateSlider ? ui.rotateSlider.value : 0,
            cropBox: state.cropBox
        } : null,
        // Include canvas dimensions to detect layout changes
        canvasWidth: ui.figureCanvas ? ui.figureCanvas.width : 0,
        canvasHeight: ui.figureCanvas ? ui.figureCanvas.height : 0
    });

    // If nothing changed and not forced, don't update
    if (currentHash === state.lastUpdateHash && !forceUpdate) {
        return;
    }

    state.lastUpdateHash = currentHash;

    // Clear any existing timeout
    if (state.globalPreviewUpdateTimeout) {
        clearTimeout(state.globalPreviewUpdateTimeout);
    }

    state.isPreviewUpdateScheduled = true;

    // Use shorter timeout since we now have better change detection
    state.globalPreviewUpdateTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
            try {
                // Update floating preview if visible
                if (isFloatingPreviewVisible() && ui.floatingPreviewCanvas && ui.floatingPreviewCtx) {
                    updateMiniPreviewCanvas(ui.floatingPreviewCanvas, ui.floatingPreviewCtx);
                }
                // Always update edit modal preview if modal is open, regardless of collapsed state
                if (state.isEditModalOpen && ui.editModalMiniPreviewCanvas && ui.editModalMiniPreviewCtx) {
                    updateMiniPreviewCanvas(ui.editModalMiniPreviewCanvas, ui.editModalMiniPreviewCtx);
                }
            } catch (error) {
                console.warn('Mini preview update failed:', error);
            } finally {
                state.isPreviewUpdateScheduled = false;
            }
        });
    }, forceUpdate ? 50 : 100); // Faster update when forced
}

export function updateMiniPreviewCanvas(canvas, ctx) {
    if (!canvas || !ctx || state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex]) {
        if (canvas && ctx && canvas.width > 0 && canvas.height > 0) {
            try {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            } catch (e) {
                console.warn('Canvas context error:', e);
            }
        }
        return;
    }

    const activeFigure = state.project.figures[state.activeFigureIndex];
    if (!activeFigure.panels || activeFigure.panels.length === 0) {
        if (ctx && canvas.width > 0 && canvas.height > 0) {
            try {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            } catch (e) {
                console.warn('Canvas context error:', e);
            }
        }
        return;
    }

    // Get current main canvas dimensions without zoom/pan
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Temporarily render without zoom/pan to get base dimensions
    const settings = activeFigure.settings;
    
    // Safety check: ensure allJournalRules is loaded
    if (!state.allJournalRules) {
        console.warn('Journal rules not loaded, using default values');
        return;
    }
    
    const rules = state.allJournalRules[settings.journal] || state.allJournalRules['Default'];
    const spacing = parseInt(settings.spacing);

    // Calculate canvas width with improved logic for visual consistency
    let baseCanvasWidthMM = settings.targetWidth !== null ? settings.targetWidth : rules.doubleColumnWidth_mm;

    // Apply minimum width constraint and scaling for narrow journals
    if (settings.targetWidth === null) { // Only apply to journal-preset widths, not custom widths
        if (baseCanvasWidthMM < state.MIN_CANVAS_WIDTH_MM) {
            // For very narrow journals like Science, scale up for better visual experience
            baseCanvasWidthMM = Math.max(state.MIN_CANVAS_WIDTH_MM, baseCanvasWidthMM * state.JOURNAL_SCALE_FACTOR);
        }
    }

    const font = `${settings.labelFontWeight} ${settings.labelFontSize * state.PT_TO_PX}px ${settings.labelFontFamily}`;
    tempCtx.font = font;

    // Calculate precise label dimensions by checking all panels
    let maxLabelWidth = 0;
    let effectiveLabelHeight = 0;

    activeFigure.panels.forEach((panel, index) => {
        // Generate the actual label text that will be displayed
        let labelText = panel.label;
        if (settings.labelStyle !== 'custom') {
            labelText = String.fromCharCode(65 + index);
            if (settings.labelStyle === 'ABC_paren') labelText += ')';
            if (settings.labelStyle === 'ABC_period') labelText += '.';
            if (settings.labelStyle === 'abc') labelText = labelText.toLowerCase();
        }

        const textMetrics = tempCtx.measureText(labelText);
        maxLabelWidth = Math.max(maxLabelWidth, textMetrics.width);

        if (effectiveLabelHeight === 0) {
            effectiveLabelHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
            if (!effectiveLabelHeight || effectiveLabelHeight <= 0) {
                effectiveLabelHeight = (settings.labelFontSize * state.PT_TO_PX) * 1.2;
            }
        }
    });

    const labelWidth = maxLabelWidth;
    const labelHeight = effectiveLabelHeight;

    const layoutOptions = {
        spacing: spacing,
        labelPosition: settings.labelPosition,
        labelWidth: labelWidth,
        labelHeight: labelHeight,
        labelSpacing: settings.labelSpacing || 0,
        maintainAspectRatio: settings.maintainAspectRatio
    };

    let effectiveLayout = settings.layout;
    let numCols = 1;
    if (effectiveLayout === 'auto') {
        // Use the stored effective layout from Smart Layout selection, or default to 'stack'
        effectiveLayout = activeFigure.effectiveLayout || 'stack';
    }

    if (effectiveLayout === 'grid2x2') numCols = 2;
    if (effectiveLayout === 'grid3x3') numCols = 3;

    let canvasWidthForSizing = baseCanvasWidthMM * state.PIXELS_PER_MM;
    let panelAreaWidth, colWidth;
    if (effectiveLayout.startsWith('grid')) {
        panelAreaWidth = canvasWidthForSizing - ((numCols + 1) * spacing);
        colWidth = panelAreaWidth / numCols;
    } else {
        if (layoutOptions.labelPosition === 'left') {
            canvasWidthForSizing -= (numCols * layoutOptions.labelWidth);
        }
        panelAreaWidth = canvasWidthForSizing - ((numCols + 1) * spacing);
        colWidth = panelAreaWidth / numCols;
    }

    // Create panels copy and apply real-time edits for preview
    const panelsCopy = JSON.parse(JSON.stringify(activeFigure.panels));
    const panelPromises = panelsCopy.map(async (panel, i) => {
        const originalPanel = activeFigure.panels[i];
        panel.image = originalPanel.image;

        // If this is the currently editing panel, apply real-time edits
        if (state.currentlyEditingPanel && originalPanel.id === state.currentlyEditingPanel.id) {
            const currentEdits = {
                ...originalPanel.edits,
                brightness: ui.brightnessSlider ? ui.brightnessSlider.value : 100,
                contrast: ui.contrastSlider ? ui.contrastSlider.value : 100,
                rotation: ui.rotateSlider ? ui.rotateSlider.value : 0,
                crop: state.cropBox ? { ...state.cropBox } : null,
                greyscale: state.currentlyEditingPanel.edits.greyscale || 0
            };

            try {
                const editedResult = await generateEditedImage(originalPanel.pristineSrc, currentEdits, 0.2); // Use low scale for preview
                
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
                
                const previewImg = new Image();
                return new Promise(resolve => {
                    previewImg.onload = () => {
                        panel.image = previewImg;
                        panel.originalWidth = previewImg.width;
                        panel.originalHeight = previewImg.height;
                        resolve(panel);
                    };
                    previewImg.src = editedSrc;
                });
            } catch (error) {
                console.warn('Mini preview generation failed, using original:', error);
                return panel;
            }
        }
        return panel;
    });

    Promise.all(panelPromises).then(processedPanels => {
        let layoutDimensions;
        switch (effectiveLayout) {
            case 'stack': layoutDimensions = layoutVerticalStack(processedPanels, layoutOptions); break;
            case 'grid2x2':
                layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
                layoutDimensions = layoutSpanningGrid(processedPanels, 2, layoutOptions);
                break;
            case 'grid3x3':
                layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
                layoutDimensions = layoutSpanningGrid(processedPanels, 3, layoutOptions);
                break;
            case 'grid4xn':
                layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
                layoutDimensions = layoutSpanningGrid(processedPanels, 4, layoutOptions);
                break;
            case 'grid5xn':
                layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
                layoutDimensions = layoutSpanningGrid(processedPanels, 5, layoutOptions);
                break;
            case 'grid6xn':
                layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
                layoutDimensions = layoutSpanningGrid(processedPanels, 6, layoutOptions);
                break;
            case 'custom':
                layoutDimensions = layoutCustom(processedPanels, layoutOptions);
                break;
            default: layoutDimensions = layoutVerticalStack(processedPanels, layoutOptions); break;
        }

        // Calculate available space in container, accounting for padding and header
        const container = canvas.parentElement;
        const containerRect = container.getBoundingClientRect();

        // Get more accurate container dimensions
        let containerPadding = 30; // Account for padding
        let headerHeight = 60; // Account for header and info text

        // Special handling for edit modal preview
        if (canvas === ui.editModalMiniPreviewCanvas) {
            containerPadding = 20; // Less padding for edit modal
            headerHeight = 45; // Account for smaller header in edit modal
        }

        const availableWidth = container.clientWidth;
        const availableHeight = container.clientHeight;

        // Calculate scale to fit entire figure within available space
        const scaleX = availableWidth / layoutDimensions.width;
        const scaleY = availableHeight / layoutDimensions.height;
        const previewScale = Math.min(scaleX, scaleY, 1); // Ensure we don't scale up beyond 100%

        // Set canvas dimensions to show the entire scaled figure
        const canvasWidth = layoutDimensions.width * previewScale;
        const canvasHeight = layoutDimensions.height * previewScale;

        // For edit modal preview, ensure we use the full available space
        if (canvas === ui.editModalMiniPreviewCanvas) {
            // Use available space more effectively for edit modal
            canvas.width = Math.max(canvasWidth, Math.min(availableWidth, 320));
            canvas.height = Math.max(canvasHeight, Math.min(availableHeight, 240));
        } else {
            // Ensure minimum dimensions but prioritize showing complete figure
            canvas.width = Math.max(canvasWidth, 100);
            canvas.height = Math.max(canvasHeight, 75);
        }

        // Clear and prepare canvas
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Center the figure if the canvas is larger than the scaled figure
        const offsetX = (canvas.width - canvasWidth) / 2;
        const offsetY = (canvas.height - canvasHeight) / 2;

        ctx.translate(offsetX, offsetY);
        ctx.scale(previewScale, previewScale);

        // Draw white background for the figure area
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, layoutDimensions.width, layoutDimensions.height);

        // Draw panels using the same logic as main canvas
        const previewOptions = {
            ...settings,
            zoom: 1.0,
            isExport: false,
            labelFontSize: settings.labelFontSize,
            labelSpacing: settings.labelSpacing || 0
        };
        drawFigureOnCanvas(ctx, canvas, layoutDimensions, processedPanels, previewOptions);

        // Draw viewport indicator when zoomed (scaled appropriately)
        if (state.currentZoom > 1) {
            const containerRect = document.getElementById('figure-canvas-container').getBoundingClientRect();

            // Calculate viewport area in canvas coordinates
            const viewportWidth = containerRect.width / state.currentZoom;
            const viewportHeight = containerRect.height / state.currentZoom;
            const viewportX = -state.canvasPanX / state.currentZoom;
            const viewportY = -state.canvasPanY / state.currentZoom;

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2 / previewScale; // Scale line width appropriately
            ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
        }

        ctx.restore();
    }).catch(error => {
        console.warn('Mini preview update failed:', error);
    });
} 