import {
    layoutCustom,
    layoutSpanningGrid,
    layoutVerticalStack,
    selectSmartLayout
} from './layouts.js';
import { updateMiniPreview } from './preview.js';
import { runQualityChecks } from './quality.js';
import { state } from './state.js';
import * as ui from './ui.js';
import { getPanelVisualBounds } from './utils.js';

// Note: Some functions are defined in main.js and will be available globally
// updateContainerSizeOnly, updateCanvasTransform

// --- CORE RENDERING LOGIC ---
export async function renderFigure(skipCentering = false) {
    updateUploadUIVisibility();
    if (!skipCentering) {
        updateZoomDisplay(); // Update zoom display when rendering
    }

    if (state.activeFigureIndex === -1 || !state.project.figures || !state.project.figures[state.activeFigureIndex] || state.project.figures[state.activeFigureIndex].panels.length === 0) {
        ui.figureCanvas.width = 0;
        ui.figureCanvas.height = 0;
        ui.feedbackList.innerHTML = '<li>Upload panels to see quality feedback.</li>';
        ui.customLabelsContainer.style.display = 'none';
        ui.individualExportContainer.classList.add('hidden');
        ui.individualExportContainer.classList.remove('has-content');
        return;
    }

    const activeFigure = state.project.figures[state.activeFigureIndex];
    const settings = activeFigure.settings;
    const rules = state.allJournalRules[settings.journal] || state.allJournalRules['Default'];
    if (!rules) { 
        console.warn('No journal rules available, using fallback defaults');
        return; 
    }

    const spacing = parseInt(settings.spacing);
    activeFigure.panels.sort((a, b) => a.order - b.order);

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
    ui.ctx.font = font;

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

        const textMetrics = ui.ctx.measureText(labelText);
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

    // If we have a saved effectiveLayout (from undo/redo), use it to maintain layout consistency
    // This is important for preserving the actual layout type (like grid2x2) when restoring from undo
    if (activeFigure.effectiveLayout && activeFigure.effectiveLayout !== settings.layout) {
        effectiveLayout = activeFigure.effectiveLayout;
        console.log('🔧 Using saved effectiveLayout:', effectiveLayout);
    } else {
        effectiveLayout = settings.layout;
        console.log('🔧 Using settings.layout:', settings.layout);
    }

    // Only switch to custom layout if the user has explicitly chosen custom layout
    // Don't auto-switch based on customX/customY values as they may be set by layout functions
    if (effectiveLayout === 'custom') {
        // User has explicitly chosen custom layout, ensure it's properly set
        activeFigure.settings.layout = 'custom';
        activeFigure.effectiveLayout = 'custom';
    }

    // Smart layout selection for 'auto' layouts
    let smartLayoutReport = null;
    if (effectiveLayout === 'auto') {
        const { panels: smartLayoutPanels, effectiveLayout: chosenLayoutType, report } = await selectSmartLayout(activeFigure.panels, settings, rules);
        activeFigure.panels = smartLayoutPanels;
        effectiveLayout = chosenLayoutType;
        smartLayoutReport = report;
        // Store the effective layout for use by other functions
        activeFigure.effectiveLayout = chosenLayoutType;
    } else {
        // Store the explicit layout choice as well
        activeFigure.effectiveLayout = effectiveLayout;
    }

    if (effectiveLayout === 'grid2x2') numCols = 2;
    if (effectiveLayout === 'grid3x3') numCols = 3;
    if (effectiveLayout === 'grid4xn') numCols = 4;
    if (effectiveLayout === 'grid5xn') numCols = 5;
    if (effectiveLayout === 'grid6xn') numCols = 6;

    let canvasWidthForSizing = baseCanvasWidthMM * state.PIXELS_PER_MM;

    // Only recalculate panel dimensions for non-auto layouts or custom layouts
    if (settings.layout !== 'auto' && effectiveLayout !== 'custom') {
        // For spanning grids, we need to handle width differently
        let panelAreaWidth, colWidth;
        if (effectiveLayout.startsWith('grid')) {
            // Don't subtract label width here for spanning grids, it's handled in the layout function
            panelAreaWidth = canvasWidthForSizing - ((numCols + 1) * spacing);
            colWidth = panelAreaWidth / numCols;
        } else {
            // For non-spanning layouts, subtract label width
            if (layoutOptions.labelPosition === 'left') {
                canvasWidthForSizing -= (numCols * layoutOptions.labelWidth);
            }
            panelAreaWidth = canvasWidthForSizing - ((numCols + 1) * spacing);
            colWidth = panelAreaWidth / numCols;
        }

        activeFigure.panels.forEach(panel => {
            const scale = colWidth / panel.originalWidth;
            panel.displayWidth = colWidth;
            panel.displayHeight = panel.originalHeight * scale;
        });
    }

    let layoutDimensions;
    console.log('🎯 Calling layout function for:', effectiveLayout);
    switch (effectiveLayout) {
        case 'stack': layoutDimensions = layoutVerticalStack(activeFigure.panels, layoutOptions); break;
        case 'grid2x2':
            layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
            layoutOptions.useCustomLayout = false;
            layoutDimensions = layoutSpanningGrid(activeFigure.panels, 2, layoutOptions);
            break;
        case 'grid3x3':
            layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
            layoutOptions.useCustomLayout = false;
            layoutDimensions = layoutSpanningGrid(activeFigure.panels, 3, layoutOptions);
            break;
        case 'grid4xn':
            layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
            layoutOptions.useCustomLayout = false;
            layoutDimensions = layoutSpanningGrid(activeFigure.panels, 4, layoutOptions);
            break;
        case 'grid5xn':
            layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
            layoutOptions.useCustomLayout = false;
            layoutDimensions = layoutSpanningGrid(activeFigure.panels, 5, layoutOptions);
            break;
        case 'grid6xn':
            layoutOptions.baseCanvasWidth = baseCanvasWidthMM * state.PIXELS_PER_MM;
            layoutOptions.useCustomLayout = false;
            layoutDimensions = layoutSpanningGrid(activeFigure.panels, 6, layoutOptions);
            break;
        case 'custom':
            layoutOptions.useCustomLayout = true;
            layoutDimensions = layoutCustom(activeFigure.panels, layoutOptions);
            break;
        default: layoutDimensions = layoutVerticalStack(activeFigure.panels, layoutOptions); break;
    }
    
    console.log('📐 Layout dimensions calculated:', layoutDimensions);
    console.log('🎨 Panel positions after layout:');
    activeFigure.panels.forEach(panel => {
        console.log(`  Panel ${panel.label}: imageX=${panel.imageX}, imageY=${panel.imageY}, displayWidth=${panel.displayWidth}, displayHeight=${panel.displayHeight}`);
    });

    // FIXED DIMENSIONS: Canvas intrinsic dimensions remain constant regardless of zoom
    ui.figureCanvas.width = layoutDimensions.width;
    ui.figureCanvas.height = layoutDimensions.height;

    // Apply zoom and pan via CSS transform for visual magnification only
    // DEBUG: log before renderFigure applies transform
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
        wrapper.style.transform = `scale(${state.currentZoom})`;
        wrapper.style.transformOrigin = '0 0';
    }
    const translatePart = (state.canvasPanX !== 0 || state.canvasPanY !== 0)
        ? `translate(${state.canvasPanX}px, ${state.canvasPanY}px)`
        : 'translate(0px, 0px)';
    ui.figureCanvas.style.transform = translatePart;
    ui.figureCanvas.style.transformOrigin = '0 0';

    // Reset context transformation - no zoom scaling in context
    ui.ctx.setTransform(1, 0, 0, 1, 0, 0);
    ui.ctx.clearRect(0, 0, layoutDimensions.width, layoutDimensions.height);

    // Draw at the fixed resolution without zoom scaling
    ui.ctx.fillStyle = 'white';
    ui.ctx.fillRect(0, 0, layoutDimensions.width, layoutDimensions.height);
    drawFigureOnCanvas(ui.ctx, ui.figureCanvas, layoutDimensions, activeFigure.panels, { 
        ...settings, 
        zoom: 1.0, 
        isExport: false,
        isDragging: state.isDragging,
        state: { draggedPanel: state.draggedPanel }
    });

    // Remove the redundant drawImage call - drawFigureOnCanvas already handles dragging correctly
    // The previous code was drawing a "ghost" image at offset coordinates, causing visual confusion

    if (!state.isDragging) {
        runQualityChecks(smartLayoutReport);
        // Force update mini preview after rendering
        updateMiniPreview(true);
    }

    // Only update container size and center canvas when container size changes, not for other figure edits
    // This prevents zoom level from being reset when making figure changes
    if (!skipCentering && !state.isZooming) {
        // Only recalculate container size and zoom when container size mode changes
        // For all other changes (figure editing, panel modification, etc.), preserve the current zoom
        if (state.containerSizeMode === 'auto') {
            // For auto mode, we still need to update container size but preserve zoom
            if (typeof updateContainerSizeOnly === 'function') {
                updateContainerSizeOnly();
            }
        }
        // Removed the automatic centerAndFitCanvas() call for non-auto modes
        // This will only be called explicitly when container size changes
    }
}

export function redrawCanvasOnly() {
    if (state.activeFigureIndex === -1 || !state.project.figures || !state.project.figures[state.activeFigureIndex] || state.project.figures[state.activeFigureIndex].panels.length === 0) {
        return;
    }

    const activeFigure = state.project.figures[state.activeFigureIndex];

    // Apply zoom and pan via CSS transform for visual magnification only
    if (typeof updateCanvasTransform === 'function') {
        updateCanvasTransform();
    }

    // Reset context transformation - no zoom scaling in context
    ui.ctx.setTransform(1, 0, 0, 1, 0, 0);
    ui.ctx.clearRect(0, 0, ui.figureCanvas.width, ui.figureCanvas.height);

    // Draw at the fixed resolution without zoom scaling
    ui.ctx.fillStyle = 'white';
    ui.ctx.fillRect(0, 0, ui.figureCanvas.width, ui.figureCanvas.height);

    const dimensions = { width: ui.figureCanvas.width, height: ui.figureCanvas.height };
    drawFigureOnCanvas(ui.ctx, ui.figureCanvas, dimensions, activeFigure.panels, { 
        ...activeFigure.settings, 
        zoom: 1.0, 
        isExport: false,
        isDragging: state.isDragging,
        state: { draggedPanel: state.draggedPanel }
    });

    // Force update mini preview after redraw
    updateMiniPreview(true);
}

export function drawFigureOnCanvas(canvasContext, targetCanvas, dimensions, panels, options) {
    canvasContext.fillStyle = 'white';
    // Fill the logical dimensions area (context scaling handles zoom)
    canvasContext.fillRect(0, 0, dimensions.width, dimensions.height);

    // Draw grid overlay only for display (not export) and if grid options are enabled
    const activeFigure = state.project.figures[state.activeFigureIndex];
    const isExport = options.isExport === true;
    if (activeFigure && !isExport) {
        const layoutToCheck = options.layout === 'auto' && activeFigure.effectiveLayout 
            ? activeFigure.effectiveLayout 
            : options.layout;

        const gridOptions = { 
            ...options, 
            layout: layoutToCheck,
            showPanelGrid: activeFigure.settings.showPanelGrid,
            showLabelGrid: activeFigure.settings.showLabelGrid
        };
        drawGridOverlay(canvasContext, dimensions, panels, gridOptions);
    }

    panels.forEach(panel => {
        // Determine panel visual state for dragging feedback
        let panelAlpha = 1.0;
        let showSwapBoundary = false;
        
        if (options.isDragging && panel.id === options.state?.draggedPanel?.id) {
            panelAlpha = 0.6; // Dragged panel is semi-transparent but still visible
        } else if (options.isDragging && state.potentialSwapTarget && panel.id === state.potentialSwapTarget.id) {
            showSwapBoundary = true; // Show swap boundary for target panel
        }
        
        canvasContext.globalAlpha = panelAlpha;
        
        // Debug: Check if panel.image exists and has valid dimensions
        if (!panel.image) {
            console.warn('Panel image is null/undefined for panel:', panel.id);
            return;
        }
        if (panel.image.width === 0 || panel.image.height === 0) {
            console.warn('Panel image has zero dimensions for panel:', panel.id, 'dimensions:', panel.image.width, 'x', panel.image.height);
            return;
        }
        console.log(`🎨 Drawing panel ${panel.label} at: imageX=${panel.imageX}, imageY=${panel.imageY}, width=${panel.displayWidth}, height=${panel.displayHeight}`);
        console.log(`🎨 Panel image type: ${panel.image.constructor.name}, dimensions: ${panel.image.width}x${panel.image.height}`);
        
        try {
            canvasContext.drawImage(panel.image, panel.imageX, panel.imageY, panel.displayWidth, panel.displayHeight);
            console.log(`✅ Successfully drew panel ${panel.label}`);
        } catch (error) {
            console.error(`❌ Failed to draw panel ${panel.label}:`, error);
        }
        
        // Draw dragged panel border
        if (options.isDragging && panel.id === options.state?.draggedPanel?.id) {
            canvasContext.strokeStyle = '#007bff'; // Blue border for dragged panel
            canvasContext.lineWidth = 2;
            canvasContext.setLineDash([4, 2]); // Small dashed line
            canvasContext.strokeRect(
                panel.imageX - 1, 
                panel.imageY - 1, 
                panel.displayWidth + 2, 
                panel.displayHeight + 2
            );
            canvasContext.setLineDash([]); // Reset line dash
        }
        
        // Draw swap boundary if needed
        if (showSwapBoundary) {
            const visualBounds = getPanelVisualBounds(panel);
            
            // Draw subtle background highlight
            canvasContext.fillStyle = 'rgba(255, 107, 53, 0.1)'; // Light orange background
            canvasContext.fillRect(
                visualBounds.x, 
                visualBounds.y, 
                visualBounds.width, 
                visualBounds.height
            );
            
            // Draw prominent boundary
            canvasContext.strokeStyle = '#ff6b35'; // Orange color for swap target
            canvasContext.lineWidth = 3;
            canvasContext.setLineDash([8, 4]); // Dashed line
            canvasContext.strokeRect(
                visualBounds.x - 2, 
                visualBounds.y - 2, 
                visualBounds.width + 4, 
                visualBounds.height + 4
            );
            canvasContext.setLineDash([]); // Reset line dash
        }
        
        canvasContext.globalAlpha = 1.0;

        // Draw selection outline and resize handles for custom layout
        if (options.layout === 'custom' && state.selectedPanelCustom && panel.id === state.selectedPanelCustom.id) {
            drawCustomLayoutHandles(canvasContext, panel);
        }

        let labelText = panel.label;
        if (options.labelStyle !== 'custom') {
            if (options.labelStyle === 'ABC_paren') labelText += ')';
            if (options.labelStyle === 'ABC_period') labelText += '.';
            if (options.labelStyle === 'abc') labelText = labelText.toLowerCase();
        }

        // Font size should not be scaled by zoom here since context is already scaled
        const fontSize = options.labelFontSize * state.PT_TO_PX;
        const font = `${options.labelFontWeight} ${fontSize}px ${options.labelFontFamily}`;
        canvasContext.font = font;

        // Calculate actual label dimensions for this panel
        const labelMetrics = canvasContext.measureText(labelText);
        panel.actualLabelWidth = labelMetrics.width;
        panel.actualLabelHeight = fontSize;

        // Set text alignment for consistent top-left positioning
        canvasContext.fillStyle = 'black';
        canvasContext.textBaseline = 'top';
        canvasContext.textAlign = 'left';

        // Use the exact labelX and labelY from layout functions - no adjustments
        canvasContext.fillText(labelText, panel.labelX, panel.labelY);
    });
}

export function drawCustomLayoutHandles(ctx, panel) {
    // Draw selection outline using custom coordinates
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.strokeRect(panel.customX - 1, panel.customY - 1, panel.customWidth + 2, panel.customHeight + 2);

    // Draw resize handles
    const handleSize = 8;
    ctx.fillStyle = '#007bff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;

    const handles = [
        { x: panel.customX, y: panel.customY }, // nw
        { x: panel.customX + panel.customWidth, y: panel.customY }, // ne
        { x: panel.customX, y: panel.customY + panel.customHeight }, // sw
        { x: panel.customX + panel.customWidth, y: panel.customY + panel.customHeight } // se
    ];

    handles.forEach(handle => {
        ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
    });
}

// Function to draw grid overlay with consistent spacing
export function drawGridOverlay(ctx, dimensions, panels, options) {
    if (!panels.length || !ctx) return;

    // Check if grid should be shown
    const activeFigure = state.project.figures[state.activeFigureIndex];
    if (!activeFigure || !activeFigure.settings) return;

    // Get granular grid visibility options
    const showGrid = activeFigure.settings.showGrid === true;
    const showPanelGrid = options.showPanelGrid === true;
    const showLabelGrid = options.showLabelGrid === true;

    // Early return if no grids are enabled
    if (!showGrid && !showPanelGrid && !showLabelGrid) return;

    ctx.save();

    // Use grid settings with black as default color and 1px thickness
    const gridColor = activeFigure.settings.gridColor || '#000000';
    const gridThickness = activeFigure.settings.gridThickness || 1;
    const gridType = activeFigure.settings.gridType || 'dashed';

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = gridThickness;

    // Set line dash based on grid type
    switch (gridType) {
        case 'solid':
            ctx.setLineDash([]);
            break;
        case 'dashed':
            ctx.setLineDash([5, 5]);
            break;
        case 'dotted':
            ctx.setLineDash([2, 3]);
            break;
        default:
            ctx.setLineDash([5, 5]);
    }

    let numCols = 1;
    if (options.layout === 'grid2x2') numCols = 2;
    else if (options.layout === 'grid3x3') numCols = 3;
    else if (options.layout === 'grid4xn') numCols = 4;
    else if (options.layout === 'grid5xn') numCols = 5;
    else if (options.layout === 'grid6xn') numCols = 6;

    // A. Draw Individual Panel Image Bounding Boxes
    if (showGrid && showPanelGrid) {
        panels.forEach(panel => {
            if (panel.imageX !== undefined && panel.imageY !== undefined && 
                panel.displayWidth > 0 && panel.displayHeight > 0) {
                ctx.strokeRect(
                    Math.round(panel.imageX),
                    Math.round(panel.imageY),
                    Math.round(panel.displayWidth),
                    Math.round(panel.displayHeight)
                );
            }
        });
    }

    // B. Draw Global Label Alignment Grid Lines
    if (showGrid && showLabelGrid) {
        // Collect unique X-coordinates for vertical alignment lines
        const verticalAlignmentLines = new Set();
        // Collect unique Y-coordinates for horizontal alignment lines
        const horizontalAlignmentLines = new Set();

        panels.forEach(panel => {
            if (panel.labelX !== undefined && panel.labelY !== undefined && 
                panel.actualLabelWidth > 0 && panel.actualLabelHeight > 0) {

                // Apply label spacing to position (same logic as in drawFigureOnCanvas)
                let labelX = panel.labelX;
                let labelY = panel.labelY;
                const labelSpacing = options.labelSpacing || 0;

                if (options.labelPosition === 'top') {
                    labelY = panel.labelY - labelSpacing;
                } else if (options.labelPosition === 'left') {
                    labelX = panel.labelX - labelSpacing;
                }

                // Add label boundaries to alignment line sets
                verticalAlignmentLines.add(Math.round(labelX)); // Left edge
                verticalAlignmentLines.add(Math.round(labelX + panel.actualLabelWidth)); // Right edge
                horizontalAlignmentLines.add(Math.round(labelY)); // Top edge
                horizontalAlignmentLines.add(Math.round(labelY + panel.actualLabelHeight)); // Bottom edge
            }
        });

        // Draw vertical alignment lines spanning full height
        verticalAlignmentLines.forEach(x => {
            if (x >= 0 && x <= dimensions.width) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, dimensions.height);
                ctx.stroke();
            }
        });

        // Draw horizontal alignment lines spanning full width
        horizontalAlignmentLines.forEach(y => {
            if (y >= 0 && y <= dimensions.height) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(dimensions.width, y);
                ctx.stroke();
            }
        });
    }

    // C. Draw Consistent Column Separator Lines (for Grid Layouts)
    if (showGrid && showPanelGrid && numCols > 1) {
        const spacing = parseInt(options.spacing || 10);

        // Calculate frame width per column
        let frameWidthPerCol = (dimensions.width - (spacing * (numCols + 1))) / numCols;

        // Draw vertical lines at logical column boundaries
        for (let i = 1; i < numCols; i++) {
            const x = Math.round(spacing + (i * (frameWidthPerCol + spacing)));
            if (x > 0 && x < dimensions.width) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, dimensions.height);
                ctx.stroke();
            }
        }
    }

    // D. Draw Consistent Row Separator Lines (for Multi-row Grid Layouts)
    if (showGrid && showPanelGrid && numCols > 1) {
        const spacing = parseInt(options.spacing || 10);

        // Collect unique row boundaries
        const rowBoundaries = new Set();

        panels.forEach(panel => {
            // Calculate frame boundaries (including label space)
            let frameTop = panel.imageY;
            let frameBottom = panel.imageY + panel.displayHeight;

            // Adjust for label position
            if (options.labelPosition === 'top') {
                const labelSpacing = options.labelSpacing || 0;
                const adjustedLabelY = panel.labelY - labelSpacing;
                if (adjustedLabelY < frameTop) {
                    frameTop = adjustedLabelY;
                }
            }

            // Add frame boundaries (excluding canvas edges)
            if (frameTop > spacing) {
                rowBoundaries.add(Math.round(frameTop - spacing / 2));
            }
            if (frameBottom < dimensions.height - spacing) {
                rowBoundaries.add(Math.round(frameBottom + spacing / 2));
            }
        });

        // Draw horizontal separator lines
        rowBoundaries.forEach(y => {
            if (y > 0 && y < dimensions.height) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(dimensions.width, y);
                ctx.stroke();
            }
        });
    }

    ctx.restore();
}

export function updateUploadUIVisibility() {
    const panelsExist = state.activeFigureIndex > -1 && state.project.figures && state.project.figures[state.activeFigureIndex] && state.project.figures[state.activeFigureIndex].panels.length > 0;
    if (panelsExist) {
        ui.uploadArea.classList.add('hidden');
        ui.addPanelsBtn.classList.remove('hidden');
    } else {
        ui.uploadArea.classList.remove('hidden');
        ui.addPanelsBtn.classList.add('hidden');
    }
}

export function updateZoomDisplay() {
    const zoomLevel = document.getElementById('zoom-level');
    if (zoomLevel) {
        zoomLevel.textContent = `${Math.round(state.currentZoom * 100)}%`;
    }
} 