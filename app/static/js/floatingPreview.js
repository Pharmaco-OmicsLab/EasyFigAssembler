import { updateMiniPreviewCanvas } from './preview.js';
import * as ui from './ui.js';

// Floating preview state
let isDragging = false;
let isResizing = false;
let dragStartX = 0;
let dragStartY = 0;
let initialX = 0;
let initialY = 0;
let initialWidth = 0;
let initialHeight = 0;

/**
 * Initialize floating preview functionality
 */
export function initializeFloatingPreview() {
    if (!ui.floatingPreviewWindow || !ui.livePreviewBtn) {
        console.warn('Floating preview elements not found');
        return;
    }

    // Toggle preview window
    ui.livePreviewBtn.addEventListener('click', toggleFloatingPreview);

    // Close button
    ui.floatingPreviewCloseBtn.addEventListener('click', hideFloatingPreview);

    // Drag functionality
    ui.floatingPreviewHeader.addEventListener('mousedown', startDrag);

    // Resize functionality
    ui.floatingPreviewResizeHandle.addEventListener('mousedown', startResize);

    // Global mouse events for drag and resize
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDragAndResize);

    // Prevent text selection during drag
    ui.floatingPreviewHeader.addEventListener('selectstart', (e) => e.preventDefault());
    ui.floatingPreviewResizeHandle.addEventListener('selectstart', (e) => e.preventDefault());
}

/**
 * Toggle floating preview window visibility
 */
export function toggleFloatingPreview() {
    if (ui.floatingPreviewWindow.classList.contains('hidden')) {
        showFloatingPreview();
    } else {
        hideFloatingPreview();
    }
}

/**
 * Show floating preview window
 */
export function showFloatingPreview() {
    ui.floatingPreviewWindow.classList.remove('hidden');
    // Update preview content
    updateFloatingPreview();
}

/**
 * Hide floating preview window
 */
export function hideFloatingPreview() {
    ui.floatingPreviewWindow.classList.add('hidden');
}

/**
 * Update floating preview canvas content
 */
export function updateFloatingPreview() {
    if (!ui.floatingPreviewCanvas || !ui.floatingPreviewCtx || 
        ui.floatingPreviewWindow.classList.contains('hidden')) {
        return;
    }

    // Use the existing updateMiniPreviewCanvas function
    updateMiniPreviewCanvas(ui.floatingPreviewCanvas, ui.floatingPreviewCtx);
}

/**
 * Start dragging the preview window
 */
function startDrag(e) {
    if (e.target.closest('.floating-preview-close')) {
        return; // Don't start drag if clicking close button
    }

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    const rect = ui.floatingPreviewWindow.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;

    ui.floatingPreviewWindow.style.cursor = 'grabbing';
    e.preventDefault();
}

/**
 * Start resizing the preview window
 */
function startResize(e) {
    isResizing = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    const rect = ui.floatingPreviewWindow.getBoundingClientRect();
    initialWidth = rect.width;
    initialHeight = rect.height;

    ui.floatingPreviewWindow.style.cursor = 'nw-resize';
    e.preventDefault();
}

/**
 * Handle mouse movement for drag and resize
 */
function handleMouseMove(e) {
    if (isDragging) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        const newX = initialX + deltaX;
        const newY = initialY + deltaY;
        
        // Constrain to viewport bounds
        const maxX = window.innerWidth - ui.floatingPreviewWindow.offsetWidth;
        const maxY = window.innerHeight - ui.floatingPreviewWindow.offsetHeight;
        
        ui.floatingPreviewWindow.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
        ui.floatingPreviewWindow.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
    } else if (isResizing) {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        const newWidth = initialWidth + deltaX;
        const newHeight = initialHeight + deltaY;
        
        // Apply minimum and maximum constraints
        const minWidth = 300;
        const minHeight = 250;
        const maxWidth = window.innerWidth * 0.8;
        const maxHeight = window.innerHeight * 0.8;
        
        const constrainedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        const constrainedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
        
        ui.floatingPreviewWindow.style.width = constrainedWidth + 'px';
        ui.floatingPreviewWindow.style.height = constrainedHeight + 'px';
        
        // Update preview content when resizing
        requestAnimationFrame(() => {
            updateFloatingPreview();
        });
    }
}

/**
 * Stop drag and resize operations
 */
function stopDragAndResize() {
    if (isDragging || isResizing) {
        isDragging = false;
        isResizing = false;
        
        ui.floatingPreviewWindow.style.cursor = '';
        
        // Update preview after resize
        if (isResizing) {
            updateFloatingPreview();
        }
    }
}

/**
 * Check if floating preview is visible
 */
export function isFloatingPreviewVisible() {
    return ui.floatingPreviewWindow && !ui.floatingPreviewWindow.classList.contains('hidden');
} 