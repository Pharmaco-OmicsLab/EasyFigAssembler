import { state } from './state.js';

/**
 * Get mouse position relative to canvas, accounting for zoom and pan
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {MouseEvent} evt - The mouse event
 * @returns {Object} Object with x and y coordinates
 */
export function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // map clientX/Y into internal pixels, then undo pan only
    // Note: canvas scaling already accounts for zoom, so we don't need to divide by zoom here
    const x = (evt.clientX - rect.left) * scaleX - state.canvasPanX;
    const y = (evt.clientY - rect.top) * scaleY - state.canvasPanY;
    return { x, y };
}

/**
 * Check if mouse position is over a panel
 * @param {Object} mousePos - Object with x and y coordinates
 * @param {Object} panel - Panel object
 * @returns {boolean} True if mouse is over panel
 */
export function isMouseOverPanel(mousePos, panel) {
    // Use customX/customY for custom layout, imageX/imageY for other layouts
    const activeFigure = state.project.figures[state.activeFigureIndex];
    if (activeFigure && activeFigure.settings.layout === 'custom') {
        return mousePos.x >= panel.customX && mousePos.x <= panel.customX + panel.customWidth &&
               mousePos.y >= panel.customY && mousePos.y <= panel.customY + panel.customHeight;
    } else {
        // For grid layouts with spanning panels, use frame boundaries for more accurate detection
        if (activeFigure && activeFigure.settings.layout && activeFigure.settings.layout.startsWith('grid')) {
            return isMouseOverPanelFrame(mousePos, panel);
        } else {
            return mousePos.x >= panel.imageX && mousePos.x <= panel.imageX + panel.displayWidth &&
                   mousePos.y >= panel.imageY && mousePos.y <= panel.imageY + panel.displayHeight;
        }
    }
}

/**
 * Check if mouse position is over a panel's frame (for spanning panels)
 * @param {Object} mousePos - Object with x and y coordinates
 * @param {Object} panel - Panel object
 * @returns {boolean} True if mouse is over panel frame
 */
export function isMouseOverPanelFrame(mousePos, panel) {
    // Use frame boundaries for spanning panels to get accurate visual boundaries
    if (panel.frameX !== undefined && panel.frameY !== undefined && 
        panel.frameWidth !== undefined && panel.frameHeight !== undefined) {
        return mousePos.x >= panel.frameX && mousePos.x <= panel.frameX + panel.frameWidth &&
               mousePos.y >= panel.frameY && mousePos.y <= panel.frameY + panel.frameHeight;
    } else {
        // Fallback to image boundaries if frame properties are not available
        return mousePos.x >= panel.imageX && mousePos.x <= panel.imageX + panel.displayWidth &&
               mousePos.y >= panel.imageY && mousePos.y <= panel.imageY + panel.displayHeight;
    }
}

/**
 * Get the visual boundaries of a panel for drag-and-drop operations
 * @param {Object} panel - Panel object
 * @returns {Object} Object with x, y, width, height representing visual boundaries
 */
export function getPanelVisualBounds(panel) {
    const activeFigure = state.project.figures[state.activeFigureIndex];
    
    if (activeFigure && activeFigure.settings.layout === 'custom') {
        return {
            x: panel.customX,
            y: panel.customY,
            width: panel.customWidth,
            height: panel.customHeight
        };
    } else if (activeFigure && activeFigure.settings.layout && activeFigure.settings.layout.startsWith('grid')) {
        // For grid layouts, use frame boundaries for spanning panels
        if (panel.frameX !== undefined && panel.frameY !== undefined && 
            panel.frameWidth !== undefined && panel.frameHeight !== undefined) {
            return {
                x: panel.frameX,
                y: panel.frameY,
                width: panel.frameWidth,
                height: panel.frameHeight
            };
        }
    }
    
    // Fallback to image boundaries
    return {
        x: panel.imageX,
        y: panel.imageY,
        width: panel.displayWidth,
        height: panel.displayHeight
    };
}

/**
 * Get resize handle type at mouse position
 * @param {Object} mousePos - Object with x and y coordinates
 * @param {Object} panel - Panel object
 * @returns {string|null} Handle type ('nw', 'ne', 'sw', 'se') or null
 */
export function getResizeHandle(mousePos, panel) {
    const handleSize = 8;
    const tolerance = handleSize / 2;

    // Use custom layout coordinates
    const handles = [
        { type: 'nw', x: panel.customX, y: panel.customY },
        { type: 'ne', x: panel.customX + panel.customWidth, y: panel.customY },
        { type: 'sw', x: panel.customX, y: panel.customY + panel.customHeight },
        { type: 'se', x: panel.customX + panel.customWidth, y: panel.customY + panel.customHeight }
    ];

    for (let handle of handles) {
        if (Math.abs(mousePos.x - handle.x) <= tolerance && Math.abs(mousePos.y - handle.y) <= tolerance) {
            return handle.type;
        }
    }
    return null;
}

/**
 * Snap a value to the grid
 * @param {number} value - Value to snap
 * @returns {number} Snapped value
 */
export function snapToGrid(value) {
    return Math.round(value / state.SNAP_GRID_SIZE) * state.SNAP_GRID_SIZE;
}

/**
 * Get snap positions from all panels
 * @param {Array} panels - Array of panel objects
 * @param {Object} excludePanel - Panel to exclude from snap calculations
 * @returns {Array} Array of snap line positions
 */
export function getSnapPositions(panels, excludePanel) {
    const snapLines = [];
    panels.forEach(panel => {
        if (panel.id === excludePanel?.id) return;
        snapLines.push(panel.imageX); // left edge
        snapLines.push(panel.imageX + panel.displayWidth); // right edge
        snapLines.push(panel.imageY); // top edge
        snapLines.push(panel.imageY + panel.displayHeight); // bottom edge
    });
    return snapLines;
}

/**
 * Find the nearest snap position within tolerance
 * @param {number} value - Value to find nearest snap for
 * @param {Array} snapLines - Array of snap line positions
 * @param {number} tolerance - Tolerance for snapping (defaults to state.SNAP_TOLERANCE)
 * @returns {number} Nearest snap position or original value
 */
export function findNearestSnap(value, snapLines, tolerance = state.SNAP_TOLERANCE) {
    for (let snapLine of snapLines) {
        if (Math.abs(value - snapLine) <= tolerance) {
            return snapLine;
        }
    }
    return value;
}

/**
 * Darken a hex color by a percentage
 * @param {string} hex - Hex color string (e.g., '#ff0000')
 * @param {number} percent - Percentage to darken (0-100)
 * @returns {string} Darkened hex color
 */
export function darkenColor(hex, percent) {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    r = Math.floor(r * (100 - percent) / 100);
    g = Math.floor(g * (100 - percent) / 100);
    b = Math.floor(b * (100 - percent) / 100);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
} 