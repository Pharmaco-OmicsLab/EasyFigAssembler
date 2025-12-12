import { updateZoomDisplay } from './canvas.js';
import { state } from './state.js';
import * as ui from './ui.js';

// --- ZOOM AND VIEW FUNCTIONS ---

/**
 * Zoom in function
 */
export function zoomIn() {
    state.isZooming = true;
    state.currentZoom = Math.min(state.currentZoom + state.ZOOM_STEP, state.MAX_ZOOM);
    window.currentZoom = state.currentZoom;
    restoreContainerOverflow();
    updateCanvasTransform();
    updateZoomDisplay();
    state.isZooming = false;
}

/**
 * Zoom out function
 */
export function zoomOut() {
    state.isZooming = true;
    state.currentZoom = Math.max(state.currentZoom - state.ZOOM_STEP, state.MIN_ZOOM);
    window.currentZoom = state.currentZoom;
    restoreContainerOverflow();
    updateCanvasTransform();
    updateZoomDisplay();
    state.isZooming = false;
}

/**
 * Reset zoom to 1.0
 */
export function resetZoom() {
    state.currentZoom = 1.0;
    window.currentZoom = state.currentZoom;
    centerCanvas();
    updateCanvasTransform();
    updateZoomDisplay();
}

/**
 * Helper function to restore container overflow when user interacts with canvas
 */
export function restoreContainerOverflow() {
    const container = document.getElementById('figure-canvas-container');
    if (container) {
        container.style.overflow = 'auto';
    }
}

/**
 * Helper function to update canvas transform without centering
 */
export function updateCanvasTransform() {
    const figureCanvas = document.getElementById('figure-canvas');
    if (!figureCanvas || !figureCanvas.width || !figureCanvas.height) return;

    // Update the canvas transform with current zoom and pan
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
        wrapper.style.transform = `scale(${state.currentZoom})`;
        wrapper.style.transformOrigin = '0 0';
    }
    
    const translatePart = (state.canvasPanX !== 0 || state.canvasPanY !== 0)
        ? `translate(${state.canvasPanX}px, ${state.canvasPanY}px)`
        : 'translate(0px, 0px)';
    figureCanvas.style.transform = translatePart;
    figureCanvas.style.transformOrigin = '0 0';
}

/**
 * Fit to page functionality - distinct from reset
 */
export function fitToPage() {
    // Give the container a moment to settle after possible size change
    setTimeout(() => {
        fitToPageLogic(); // Use the dedicated fit-to-page logic
    }, 25);
}

/**
 * Dedicated fit-to-page logic with its own calculation
 */
export function fitToPageLogic() {
    const figureCanvas = document.getElementById('figure-canvas');
    if (!figureCanvas || !figureCanvas.width || !figureCanvas.height) return;

    const container = document.getElementById('figure-canvas-container');
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const canvasWidthCSS = figureCanvas.width;
    const canvasHeightCSS = figureCanvas.height;

    // Force reflow to ensure styles are applied
    container.offsetHeight;
    // Use clientWidth and clientHeight for more accurate size, excluding scrollbars
    const availableWidth = container.clientWidth;
    const availableHeight = container.clientHeight;

    // Ensure we have valid dimensions
    if (availableWidth <= 0 || availableHeight <= 0) {
        console.warn('Container dimensions not ready for fit to page');
        return;
    }

    const tolerance = 2; // px, to account for rounding errors

    // Helper to check if a given zoom fits
    function fits(zoom) {
        return (
            canvasWidthCSS * zoom <= availableWidth + tolerance &&
            canvasHeightCSS * zoom <= availableHeight + tolerance
        );
    }

    let newZoom = 1.0;
    if (fits(1.0)) {
        newZoom = 1.0;
    } else {
        // Find the minimum scale needed to fit
        const minScale = Math.min(availableWidth / canvasWidthCSS, availableHeight / canvasHeightCSS);
        // Smart binary search for the largest zoom that fits (between minScale and 1.0)
        let low = minScale;
        let high = 1.0;
        let best = minScale;
        for (let i = 0; i < 10; i++) { // 10 iterations is enough for pixel precision
            let mid = (low + high) / 2;
            if (fits(mid)) {
                best = mid;
                low = mid;
            } else {
                high = mid;
            }
        }
        newZoom = Math.min(best, 1.0); // Ensure zoom never exceeds 1
    }

    // Force update the zoom level (ignore current zoom comparison)
    state.currentZoom = newZoom;
    window.currentZoom = state.currentZoom;

    // Explicitly center the canvas
    centerCanvas();

    // Update the canvas transform
    updateCanvasTransform();
    updateZoomDisplay();

    // Ensure the wrapper is sized to the canvas (prevents overflow)
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
        wrapper.style.width = figureCanvas.width + 'px';
        wrapper.style.height = figureCanvas.height + 'px';
    }

    // Debugging: Log bounding rects of container, wrapper, and canvas
    const containerRect = container.getBoundingClientRect();
    const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
    const canvasRect = figureCanvas.getBoundingClientRect();
    console.log('DEBUG: Bounding rects after fitToPageLogic:', {
        container: {
            top: containerRect.top,
            bottom: containerRect.bottom,
            left: containerRect.left,
            right: containerRect.right,
            width: containerRect.width,
            height: containerRect.height
        },
        wrapper: wrapperRect ? {
            top: wrapperRect.top,
            bottom: wrapperRect.bottom,
            left: wrapperRect.left,
            right: wrapperRect.right,
            width: wrapperRect.width,
            height: wrapperRect.height
        } : null,
        canvas: {
            top: canvasRect.top,
            bottom: canvasRect.bottom,
            left: canvasRect.left,
            right: canvasRect.right,
            width: canvasRect.width,
            height: canvasRect.height
        }
    });

    console.log(`Fit to page: CanvasCSS ${canvasWidthCSS}x${canvasHeightCSS}, Container ${availableWidth}x${availableHeight}, Zoom: ${newZoom}`);
}

/**
 * Center canvas by resetting pan values
 */
export function centerCanvas() {
    state.canvasPanX = 0;
    window.canvasPanX = state.canvasPanX;
    state.canvasPanY = 0;
    window.canvasPanY = state.canvasPanY;
}

/**
 * Calculate auto container size based on canvas dimensions
 */
export function calculateAutoContainerSize() {
    const figureCanvas = document.getElementById('figure-canvas');
    if (!figureCanvas || !figureCanvas.width || !figureCanvas.height) return;

    const container = document.getElementById('figure-canvas-container');
    const sidebar = document.getElementById('sticky-sidebar-wrapper');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 380; // Default sidebar width

    // Account for sidebar and other UI elements
    const availableWidth = window.innerWidth - sidebarWidth - 100; // 100px for margins/padding
    const maxWidth = Math.min(availableWidth * 0.9, window.innerWidth * 0.7); // 90% of available width or 70% of viewport
    const maxHeight = window.innerHeight * 0.6; // 60% of viewport height (more conservative)

    const aspectRatio = figureCanvas.width / figureCanvas.height;

    let containerWidth, containerHeight;

    if (aspectRatio > 1) {
        // Landscape figure
        containerWidth = Math.min(figureCanvas.width, maxWidth);
        containerHeight = containerWidth / aspectRatio;

        if (containerHeight > maxHeight) {
            containerHeight = maxHeight;
            containerWidth = containerHeight * aspectRatio;
        }
    } else {
        // Portrait figure
        containerHeight = Math.min(figureCanvas.height, maxHeight);
        containerWidth = containerHeight * aspectRatio;

        if (containerWidth > maxWidth) {
            containerWidth = maxWidth;
            containerHeight = containerWidth / aspectRatio;
        }
    }

    // Add minimal padding in auto mode and ensure minimum size
    containerWidth = Math.max(400, Math.min(containerWidth + 0, maxWidth)); // Reduced from 80 to 20 for auto mode
    containerHeight = Math.max(300, Math.min(containerHeight + 0, maxHeight)); // Reduced from 80 to 20 for auto mode

    return { width: containerWidth, height: containerHeight };
}

/**
 * Update container for auto size mode
 */
export function updateContainerForAutoSize() {
    if (state.containerSizeMode !== 'auto') return;

    const dimensions = calculateAutoContainerSize();
    if (dimensions) {
        const container = document.getElementById('figure-canvas-container');

        // Clear any existing inline styles first
        container.style.width = '';
        container.style.height = '';

        // Force a reflow to ensure CSS classes are applied
        container.offsetHeight;

        // Set the new calculated dimensions
        container.style.width = `${dimensions.width}px`;
        container.style.height = `${dimensions.height}px`;

        // Force another reflow to ensure the new dimensions are applied
        container.offsetHeight;

        // For auto mode, we still need to recalculate zoom and fitting when container size changes
        // This preserves the user's zoom level for other changes but recalculates when container size changes
        setTimeout(() => {
            fitToPageLogic();
        }, 25);
    }
}

/**
 * Update container size without affecting zoom (for figure edits)
 */
export function updateContainerSizeOnly() {
    if (state.containerSizeMode !== 'auto') return;

    const dimensions = calculateAutoContainerSize();
    if (dimensions) {
        const container = document.getElementById('figure-canvas-container');

        // Clear any existing inline styles first
        container.style.width = '';
        container.style.height = '';

        // Force a reflow to ensure CSS classes are applied
        container.offsetHeight;

        // Set the new calculated dimensions
        container.style.width = `${dimensions.width}px`;
        container.style.height = `${dimensions.height}px`;

        // Force another reflow to ensure the new dimensions are applied
        container.offsetHeight;

        // Don't call centerAndFitCanvas() - preserve current zoom and pan
        // Just update the canvas transform to maintain current zoom level
        updateCanvasTransform();
    }
}

// --- UI HELPER FUNCTIONS ---

/**
 * Update grid controls state
 */
export function updateGridControlsState(isGridEnabled) {
    const gridSubControls = document.getElementById('grid-sub-controls');
    if (gridSubControls) {
        if (isGridEnabled) {
            gridSubControls.classList.remove('disabled');
        } else {
            gridSubControls.classList.add('disabled');
            // When main grid is disabled, also uncheck sub-options
            if (ui.showPanelGridCheckbox) {
                ui.showPanelGridCheckbox.checked = false;
                if (state.activeFigureIndex !== -1 && state.project.figures[state.activeFigureIndex]) {
                    if (window.handleSettingChange) {
                        window.handleSettingChange('showPanelGrid', false);
                    }
                }
            }
            if (ui.showLabelGridCheckbox) {
                ui.showLabelGridCheckbox.checked = false;
                if (state.activeFigureIndex !== -1 && state.project.figures[state.activeFigureIndex]) {
                    if (window.handleSettingChange) {
                        window.handleSettingChange('showLabelGrid', false);
                    }
                }
            }
        }
    }
}

/**
 * Update journal info display
 */
export function updateJournalInfoDisplay() {
    const journalInfoDisplay = document.getElementById('journal-info-display');
    if (!journalInfoDisplay) return;

    if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex]) {
        journalInfoDisplay.innerHTML = '';
        return;
    }

    const activeFigure = state.project.figures[state.activeFigureIndex];
    const selectedJournal = activeFigure.settings.journal;
    
    // Safety check: ensure allJournalRules is loaded and the selected journal exists
    if (!state.allJournalRules || !state.allJournalRules[selectedJournal]) {
        journalInfoDisplay.innerHTML = '';
        return;
    }
    
    const rules = state.allJournalRules[selectedJournal];

    // Clear display if no specific journal is selected or if using custom width
    if (!rules || selectedJournal === 'Default' || activeFigure.settings.targetWidth !== null) {
        journalInfoDisplay.innerHTML = '';
        return;
    }

    // Display journal-specific information
    const journalName = selectedJournal;
    let infoHTML = `<h5>${journalName} Specifications</h5><ul>`;

    if (rules.doubleColumnWidth_mm) {
        // Calculate the actual canvas width being used
        let actualCanvasWidthMM = rules.doubleColumnWidth_mm;
        if (actualCanvasWidthMM < state.MIN_CANVAS_WIDTH_MM) {
            actualCanvasWidthMM = Math.max(state.MIN_CANVAS_WIDTH_MM, actualCanvasWidthMM * state.JOURNAL_SCALE_FACTOR);
        }
        infoHTML += `<li><span class="journal-spec">Double Column (default):</span> ${rules.doubleColumnWidth_mm}mm`;
        if (actualCanvasWidthMM !== rules.doubleColumnWidth_mm) {
            infoHTML += ` <span class="journal-note">(displayed at ${Math.round(actualCanvasWidthMM)}mm for better visibility)</span>`;
        }
        infoHTML += `</li>`;
    }

    if (rules.maxHeight_mm) {
        infoHTML += `<li><span class="journal-spec">Max Height:</span> ${rules.maxHeight_mm}mm</li>`;
    }

    if (rules.dpi_halftone) {
        infoHTML += `<li><span class="journal-spec">Required DPI:</span> ${rules.dpi_halftone}</li>`;
    }

    if (rules.font_min_pt) {
        infoHTML += `<li><span class="journal-spec">Min Font Size:</span> ${rules.font_min_pt}pt</li>`;
    }

    infoHTML += '</ul>';
    journalInfoDisplay.innerHTML = infoHTML;
}

/**
 * Update layout span controls
 */
export function updateLayoutSpanControls() {
    const layoutSpanControls = document.getElementById('layout-span-controls');
    const currentLayoutIndicator = document.getElementById('current-layout-indicator');

    if (!layoutSpanControls || !currentLayoutIndicator) {
        console.warn('Layout span controls elements not found');
        return;
    }

    if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex]) {
        layoutSpanControls.style.display = 'none';
        currentLayoutIndicator.textContent = 'N/A';
        return;
    }

    const activeFigure = state.project.figures[state.activeFigureIndex];
    let effectiveLayout = activeFigure.settings.layout;

    if (effectiveLayout === 'auto') {
        // Use the stored effective layout from Smart Layout selection, or default to 'stack'
        effectiveLayout = activeFigure.effectiveLayout || 'stack';
    }

    currentLayoutIndicator.textContent = effectiveLayout;

    // Show/hide controls based on layout
    console.log('updateLayoutSpanControls: effectiveLayout =', effectiveLayout);
    if (effectiveLayout.startsWith('grid') && (effectiveLayout === 'grid2x2' || effectiveLayout === 'grid3x3' || effectiveLayout === 'grid4xn' || effectiveLayout === 'grid5xn' || effectiveLayout === 'grid6xn')) {
        layoutSpanControls.style.display = 'block';
        let maxCols = 1;
        if (effectiveLayout === 'grid2x2') maxCols = 2;
        else if (effectiveLayout === 'grid3x3') maxCols = 3;
        else if (effectiveLayout === 'grid4xn') maxCols = 4;
        else if (effectiveLayout === 'grid5xn') maxCols = 5;
        else if (effectiveLayout === 'grid6xn') maxCols = 6;

        const panelColspanInput = document.getElementById('panel-colspan-input');
        const panelRowspanInput = document.getElementById('panel-rowspan-input');
        
        if (panelColspanInput) panelColspanInput.max = maxCols;
        if (panelRowspanInput) panelRowspanInput.max = 10; // Allow reasonable row spanning
        console.log('Layout span controls are visible for grid layout:', effectiveLayout, 'maxCols:', maxCols);
    } else {
        layoutSpanControls.style.display = 'none';
        console.log('Layout span controls are hidden for layout:', effectiveLayout);
    }
}

/**
 * Set container size function
 */
export function setContainerSize(mode, customWidth = null, customHeight = null) {
    const container = document.getElementById('figure-canvas-container');
    const figureCanvas = document.getElementById('figure-canvas');

    console.log(`Setting container size to: ${mode}`, { customWidth, customHeight });

    // Remove all size classes
    container.classList.remove('auto-size', 'small-size', 'medium-size', 'large-size', 'custom-size');

    // Clear any existing inline styles first
    container.style.width = '';
    container.style.height = '';

    // Responsive sizing logic
    if (mode === 'auto') {
        // Use a percentage of the viewport, with min/max
        let width = Math.min(window.innerWidth * 0.8, 1200);
        let height = Math.min(window.innerHeight * 0.7, 900);
        width = Math.max(width, 300);
        height = Math.max(height, 200);
        container.style.width = width + 'px';
        container.style.height = height + 'px';
    } else if (mode === 'small') {
        let width = Math.max(window.innerWidth * 0.4, 300);
        let height = Math.max(window.innerHeight * 0.3, 200);
        container.style.width = width + 'px';
        container.style.height = height + 'px';
    } else if (mode === 'medium') {
        let width = Math.max(window.innerWidth * 0.6, 400);
        let height = Math.max(window.innerHeight * 0.45, 300);
        container.style.width = width + 'px';
        container.style.height = height + 'px';
    } else if (mode === 'large') {
        let width = Math.min(window.innerWidth * 0.8, 1600);
        let height = Math.min(window.innerHeight * 0.6, 1200);
        container.style.width = width + 'px';
        container.style.height = height + 'px';
    } else if (mode === 'custom' && customWidth && customHeight) {
        container.style.width = customWidth + 'px';
        container.style.height = customHeight + 'px';
        state.customContainerWidth = customWidth;
        state.customContainerHeight = customHeight;
    }
    container.style.overflow = 'auto';

    // For auto mode, we'll calculate dimensions later
    state.containerSizeMode = mode;

    // Force another reflow to ensure the new dimensions are applied
    container.offsetHeight;

    // Debug: Check what the actual computed styles are
    const computedStyle = getComputedStyle(container);
    console.log(`Container size set to: ${mode}`, { 
        customWidth, 
        customHeight,
        inlineWidth: container.style.width,
        inlineHeight: container.style.height,
        computedWidth: computedStyle.width,
        computedHeight: computedStyle.height
    });

    // Reset canvas transform but preserve zoom and pan state
    if (figureCanvas) {
        figureCanvas.style.transform = 'scale(1)';
    }

    // Handle auto mode specially to recalculate size
    if (mode === 'auto') {
        setTimeout(() => {
            updateContainerForAutoSize();
        }, 25);
    } else {
        // For non-auto modes, re-render to update the canvas's intrinsic size,
        // then wait for the container's CSS transition to finish before fitting.
        console.log('Triggering re-render for container size change');
        if (state.activeFigureIndex >= 0 && state.project.figures && state.project.figures[state.activeFigureIndex]) {
            // Import renderFigure dynamically to avoid circular dependency
            import('./canvas.js').then(({ renderFigure }) => {
                renderFigure(true); // Re-render synchronously.
            });
        }

        // The container has a 150ms CSS transition. We wait slightly longer to be safe.
        setTimeout(() => {
            console.log('Fitting canvas after re-render and transition');
            fitToPageLogic();
        }, 160);
    }
}

/**
 * Handle container size change
 */
export function handleContainerSizeChange() {
    const containerSizeSelect = document.getElementById('container-size-select');
    const customSizeControls = document.getElementById('custom-size-controls');
    
    if (!containerSizeSelect) return;
    
    const mode = containerSizeSelect.value;

    if (mode === 'custom') {
        if (customSizeControls) customSizeControls.classList.remove('hidden');
    } else {
        if (customSizeControls) customSizeControls.classList.add('hidden');
        setContainerSize(mode);
    }
}

/**
 * Apply custom size
 */
export function applyCustomSize() {
    const customWidthInput = document.getElementById('custom-width-input');
    const customHeightInput = document.getElementById('custom-height-input');
    
    if (!customWidthInput || !customHeightInput) return;
    
    const width = parseInt(customWidthInput.value);
    const height = parseInt(customHeightInput.value);

    if (width >= 200 && width <= 2000 && height >= 200 && height <= 2000) {
        setContainerSize('custom', width, height);
    } else {
        alert('Please enter valid dimensions between 200px and 2000px.');
    }
}

// Make setContainerSize available globally for other modules
window.setContainerSize = setContainerSize; 