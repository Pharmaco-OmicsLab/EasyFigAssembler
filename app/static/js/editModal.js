// --- EDIT MODAL FUNCTIONALITY ---
import { resetAnnotationHistory, saveAnnotationState } from './annotation.js';
import { renderFigure } from './canvas.js';
import { updateLayoutButtonSelection } from './figure.js';
import { saveState } from './history.js';
import { updateMiniPreview } from './preview.js';
import { state } from './state.js';
import * as ui from './ui.js';
import { getMousePos, isMouseOverPanel } from './utils.js';
import { updateLayoutSpanControls } from './view.js';

// Variables used within the edit modal
// FIX: Remove local variables that duplicate global state
let previewUpdateRAF = null;

// FIX: Remove local annotation state variables that duplicate global state
// These are now managed in global state:
// - currentAnnotation -> state.currentAnnotation
// - isDrawingAnnotation -> state.isDrawingAnnotation  
// - isDraggingAnnotation -> state.isDraggingAnnotation
// - annotationDragStart -> state.annotationDragStart
// - isCropping -> state.isCropping
// - activeAnnotationTool -> state.activeAnnotationTool
// - currentlyEditingPanel -> state.currentlyEditingPanel
// - editImage -> state.editImage
// - cropBox -> state.cropBox
// - cropInteractionMode -> state.cropInteractionMode
// - cropStartPos -> state.cropStartPos
// - cropStartBox -> state.cropStartBox
// - selectedAnnotation -> state.selectedAnnotation

// --- 9. PANEL EDITING LOGIC ---
function openEditModal(panel) {
    if (state.isEditModalOpen || !panel || !panel.pristineSrc) {
        return;
    }
    state.isEditModalOpen = true;
    
    // FIX: Initialize the edits object if it doesn't exist
    if (!panel.edits) {
        panel.edits = {};
    }
    
    // FIX: Initialize the annotations array if it doesn't exist
    if (!panel.edits.annotations) {
        panel.edits.annotations = [];
    }
    
    // FIX: Initialize other edit properties if they don't exist
    if (panel.edits.brightness === undefined) {
        panel.edits.brightness = 100;
    }
    if (panel.edits.contrast === undefined) {
        panel.edits.contrast = 100;
    }
    if (panel.edits.greyscale === undefined) {
        panel.edits.greyscale = 0;
    }
    if (panel.edits.rotation === undefined) {
        panel.edits.rotation = 0;
    }
    if (panel.edits.crop === undefined) {
        panel.edits.crop = null;
    }
    if (panel.edits.layoutSpan === undefined) {
        panel.edits.layoutSpan = { colspan: 1, rowspan: 1 };
    }

    // Set the panel as the currently editing panel
    state.currentlyEditingPanel = panel;
    
    console.log('🔧 Edit modal opened with panel:', {
        panelId: panel.id,
        hasEdits: !!panel.edits,
        editsKeys: panel.edits ? Object.keys(panel.edits) : [],
        hasAnnotations: !!(panel.edits && panel.edits.annotations),
        annotationsCount: panel.edits && panel.edits.annotations ? panel.edits.annotations.length : 0,
        annotations: panel.edits && panel.edits.annotations ? panel.edits.annotations : []
    });

    // FIX: Use global state instead of local variable
    ui.brightnessSlider.value = panel.edits.brightness;
    ui.brightnessValue.textContent = panel.edits.brightness + '%';
    ui.contrastSlider.value = panel.edits.contrast;
    ui.contrastValue.textContent = panel.edits.contrast + '%';
    ui.rotateSlider.value = panel.edits.rotation || 0;
    ui.rotateValue.textContent = (panel.edits.rotation || 0) + '°';

    // Set span values
    const span = panel.edits.layoutSpan || { colspan: 1, rowspan: 1 };
    ui.panelColspanInput.value = span.colspan;
    ui.panelRowspanInput.value = span.rowspan;

    // Initialize greyscale button state
    const currentGreyscale = panel.edits.greyscale || 0;
    if (currentGreyscale === 100) {
        ui.greyscaleBtn.classList.add('active');
        ui.greyscaleBtn.textContent = 'Remove Greyscale';
    } else {
        ui.greyscaleBtn.classList.remove('active');
        ui.greyscaleBtn.textContent = 'Toggle Greyscale';
    }

    // Update layout span controls visibility and current layout indicator
    updateLayoutSpanControls();

    // FIX: Set up event handlers before setting the image source
    state.editImage.onload = null; // Clear any existing handlers
    state.editImage.onerror = null;
    
    // Set up the onload handler
    state.editImage.onload = () => {
        ui.editCanvas.width = state.editImage.width;
        ui.editCanvas.height = state.editImage.height;
        
        // Calculate coordinate transformation for annotations
        // This ensures annotations are stored in original image coordinates, not edit modal coordinates
        const originalPanel = state.currentlyEditingPanel;
        if (originalPanel && originalPanel.image) {
            // Calculate scale factors between original panel image and edit modal canvas
            state.editModalCoordinateTransform.scaleX = originalPanel.image.width / state.editImage.width;
            state.editModalCoordinateTransform.scaleY = originalPanel.image.height / state.editImage.height;
            
            // Calculate offsets (usually 0 unless there's padding or centering)
            state.editModalCoordinateTransform.offsetX = 0;
            state.editModalCoordinateTransform.offsetY = 0;
            
            console.log('🔧 Edit modal coordinate transform calculated:', {
                originalImage: `${originalPanel.image.width}x${originalPanel.image.height}`,
                editModal: `${state.editImage.width}x${state.editImage.height}`,
                scaleX: state.editModalCoordinateTransform.scaleX,
                scaleY: state.editModalCoordinateTransform.scaleY,
                originalPanel: originalPanel,
                editImage: state.editImage
            });
            
            // Validate the coordinate transformation
            if (state.editModalCoordinateTransform.scaleX <= 0 || state.editModalCoordinateTransform.scaleY <= 0) {
                console.error('❌ Invalid coordinate transformation calculated:', state.editModalCoordinateTransform);
                // Fallback to 1:1 scaling if invalid
                state.editModalCoordinateTransform.scaleX = 1.0;
                state.editModalCoordinateTransform.scaleY = 1.0;
                console.log('🔧 Using fallback 1:1 scaling');
            }
            

        } else {
            console.warn('⚠️ Could not calculate coordinate transform:', {
                hasOriginalPanel: !!originalPanel,
                hasOriginalImage: !!(originalPanel && originalPanel.image),
                hasEditImage: !!state.editImage,
                originalPanelImage: originalPanel?.image,
                editImage: state.editImage
            });
            
            // Use fallback scaling if coordinate transform cannot be calculated
            state.editModalCoordinateTransform.scaleX = 1.0;
            state.editModalCoordinateTransform.scaleY = 1.0;
            state.editModalCoordinateTransform.offsetX = 0;
            state.editModalCoordinateTransform.offsetY = 0;
            console.log('🔧 Using fallback 1:1 scaling due to missing data');
            

        }
        
        // Initialize cropBox from panel edits or null for new crop
        state.cropBox = panel.edits.crop ? { ...panel.edits.crop } : null;

        state.selectedAnnotation = null;
        hideAnnotationStylingOptions();

        state.activeAnnotationTool = 'crop';
        document.querySelectorAll('#annotation-tools .tool-btn').forEach(btn => {
            btn.classList.remove('active-tool');
        });
        // Set crop button as active by default
        const cropBtn = document.querySelector('#annotation-tools .tool-btn[data-tool="crop"]');
        if (cropBtn) {
            cropBtn.classList.add('active-tool');
        }

        // NEW: Initialize annotation history
        resetAnnotationHistory();

        // Update layout span controls when modal opens
        updateLayoutSpanControls();

        requestAnimationFrame(() => {
            redrawEditCanvas();
        });

        // Initialize edit modal preview - start expanded by default
        const editModalPreview = document.getElementById('edit-modal-preview');
        if (editModalPreview) {
            // Start expanded by default
            editModalPreview.classList.remove('collapsed');
            editModalPreview.classList.add('expanded');
            // Clear any forced constraints
            editModalPreview.style.height = '';
            editModalPreview.style.minHeight = '';
            editModalPreview.style.maxHeight = '';
        }

        ui.editModal.classList.remove('hidden');

        // Add scroll support
        addEditControlsScrollSupport();

        // DEBUG: Check scrollbar issue
        setTimeout(() => {
            const editControls = document.getElementById('edit-controls-panel');
            if (editControls) {
                console.log('=== SCROLLBAR DEBUG INFO ===');
                console.log('Edit controls element:', editControls);
                console.log('Computed styles:');
                console.log('- overflow-y:', getComputedStyle(editControls).overflowY);
                console.log('- overflow-x:', getComputedStyle(editControls).overflowX);
                console.log('- height:', getComputedStyle(editControls).height);
                console.log('- max-height:', getComputedStyle(editControls).maxHeight);
                console.log('- scrollHeight:', editControls.scrollHeight);
                console.log('- clientHeight:', editControls.clientHeight);
                console.log('- offsetHeight:', editControls.offsetHeight);
                console.log('- scrollTop:', editControls.scrollTop);
                console.log('- scrollTopMax:', editControls.scrollTopMax);

                // Check if content overflows
                const hasOverflow = editControls.scrollHeight > editControls.clientHeight;
                console.log('Content overflows:', hasOverflow);
                console.log('Overflow amount:', editControls.scrollHeight - editControls.clientHeight);

                // Check parent modal dimensions
                const modalContent = editControls.closest('.modal-content');
                if (modalContent) {
                    console.log('Modal content height:', getComputedStyle(modalContent).height);
                    console.log('Modal content max-height:', getComputedStyle(modalContent).maxHeight);
                }

                // Force scrollbar to appear for testing
                if (!hasOverflow) {
                    console.log('No overflow detected - adding test content to force scrollbar');
                    const testDiv = document.createElement('div');
                    testDiv.style.height = '1000px';
                    testDiv.style.backgroundColor = 'rgba(255,0,0,0.1)';
                    testDiv.textContent = 'TEST CONTENT FOR SCROLLBAR';
                    editControls.appendChild(testDiv);

                    // Check again after adding test content
                    setTimeout(() => {
                        console.log('After adding test content:');
                        console.log('- scrollHeight:', editControls.scrollHeight);
                        console.log('- clientHeight:', editControls.clientHeight);
                        console.log('- Content overflows:', editControls.scrollHeight > editControls.clientHeight);
                    }, 100);
                }
            }

            updateMiniPreview(true);
        }, 100);
    };
    
    state.editImage.onerror = () => {
        console.error('❌ Failed to load edit image:', panel.pristineSrc);
    };
    
    state.editImage.src = panel.pristineSrc;
}

function closeEditModal() {
    // Restore original image if preview was active (from a previous implementation)
    // This was for live preview on main canvas, which is now disabled.
    // If this logic is tied to _originalImage, it might not be needed or might cause issues.
    // Keeping it commented out or verifying its purpose is key.
    /* if (currentlyEditingPanel && currentlyEditingPanel._originalImage) {
        currentlyEditingPanel.image = currentlyEditingPanel._originalImage;
        delete currentlyEditingPanel._originalImage;
        renderFigure();
    } */

    ui.editModal.classList.add('hidden');
    state.isEditModalOpen = false;
    state.currentlyEditingPanel = null;
            state.cropBox = null;
    state.cropInteractionMode = null;
    state.cropStartPos = null;
    state.cropStartBox = null;
    state.selectedAnnotation = null;
    state.activeAnnotationTool = 'crop';
    state.currentAnnotation = null;
    state.isDrawingAnnotation = false;
    state.isDraggingAnnotation = false;
    state.annotationDragStart = null;
    hideAnnotationStylingOptions();
            state.editImage.src = "";
    state.editImage.onerror = null;
    state.editImage.onload = null;

    // Cancel any pending preview updates (was for main canvas preview)
    if (previewUpdateRAF) {
        cancelAnimationFrame(previewUpdateRAF);
        previewUpdateRAF = null;
    }
}

// NEW: Functions for showing/hiding annotation styling options
function showAnnotationStylingOptions(annotationType) {
    if (ui.annotationStylingOptions) {
        ui.annotationStylingOptions.classList.remove('hidden-by-default');

        const colorControl = document.getElementById('annotation-color-control');
        const lineWidthControl = document.getElementById('annotation-linewidth-control');
        const fontSizeControl = document.getElementById('annotation-fontsize-control');
        const fontFamilyControl = document.getElementById('annotation-font-family-control');
        const fontStyleControl = document.getElementById('annotation-font-style-control');

        // Hide all controls first to ensure clean reset
        if (colorControl) colorControl.style.display = 'none';
        if (lineWidthControl) lineWidthControl.style.display = 'none';
        if (fontSizeControl) fontSizeControl.style.display = 'none';
        if (fontFamilyControl) fontFamilyControl.style.display = 'none';
        if (fontStyleControl) fontStyleControl.style.display = 'none';

        // Show relevant controls based on annotation type
        if (annotationType === 'text') {
            if (colorControl) colorControl.style.display = 'block';
            if (fontSizeControl) fontSizeControl.style.display = 'block';
            if (fontFamilyControl) fontFamilyControl.style.display = 'block';
            if (fontStyleControl) fontStyleControl.style.display = 'block';
        } else if (annotationType === 'arrow' || annotationType === 'rect') {
            if (colorControl) colorControl.style.display = 'block';
            if (lineWidthControl) lineWidthControl.style.display = 'block';
        }
    }
}

export function hideAnnotationStylingOptions() {
    if (ui.annotationStylingOptions) {
        ui.annotationStylingOptions.classList.add('hidden-by-default');

        // Explicitly hide all individual controls for consistency
        const colorControl = document.getElementById('annotation-color-control');
        const lineWidthControl = document.getElementById('annotation-linewidth-control');
        const fontSizeControl = document.getElementById('annotation-fontsize-control');
        const fontFamilyControl = document.getElementById('annotation-font-family-control');
        const fontStyleControl = document.getElementById('annotation-font-style-control');

        if (colorControl) colorControl.style.display = 'none';
        if (lineWidthControl) lineWidthControl.style.display = 'none';
        if (fontSizeControl) fontSizeControl.style.display = 'none';
        if (fontFamilyControl) fontFamilyControl.style.display = 'none';
        if (fontStyleControl) fontStyleControl.style.display = 'none';
    }
}

// NEW: Populate annotation controls based on selected annotation
function populateAnnotationControls(annotation) {
    if (!annotation) return;

    ui.annotationColorInput.value = annotation.color || '#FF0000';

    if (annotation.type === 'text') {
        ui.annotationFontSizeInput.value = annotation.size || 16;
        ui.annotationFontFamilySelect.value = annotation.fontFamily || 'Arial';
        // Set bold/italic controls based on annotation properties
        if (ui.annotationBoldBtn) {
            ui.annotationBoldBtn.classList.toggle('active', annotation.fontWeight === 'bold');
        }
        if (ui.annotationItalicBtn) {
            ui.annotationItalicBtn.classList.toggle('active', annotation.fontStyle === 'italic');
        }
    } else {
        ui.annotationLineWidthInput.value = annotation.lineWidth || 2;
    }
}

// --- START: PASTE THE HELPER FUNCTIONS HERE ---
function drawAnnotations(ctx, panel) {
    if (!panel || !panel.edits.annotations) return;

    // Draw saved annotations
    panel.edits.annotations.forEach((a, index) => {
        ctx.strokeStyle = a.color;
        ctx.fillStyle = a.color;
        ctx.lineWidth = a.lineWidth;

        // Highlight selected annotation
        if (state.selectedAnnotation === index) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = Math.max(a.lineWidth, 3);
        }

        // FIX: Convert coordinates from original image space to edit modal space for display
        let displayCoords;
        switch (a.type) {
            case 'rect':
                const rectStart = convertToEditModalCoordinates(a.x1, a.y1);
                const rectEnd = convertToEditModalCoordinates(a.x2, a.y2);
                ctx.strokeRect(rectStart.x, rectStart.y, rectEnd.x - rectStart.x, rectEnd.y - rectStart.y);
                // Draw selection handles for selected rectangle
                if (state.selectedAnnotation === index) {
                    drawSelectionHandles(ctx, rectStart.x, rectStart.y, rectEnd.x, rectEnd.y);
                }
                break;
            case 'arrow':
                const arrowStart = convertToEditModalCoordinates(a.x1, a.y1);
                const arrowEnd = convertToEditModalCoordinates(a.x2, a.y2);
                drawArrow(ctx, arrowStart.x, arrowStart.y, arrowEnd.x, arrowEnd.y);
                // Draw selection handles for selected arrow
                if (state.selectedAnnotation === index) {
                    drawSelectionHandles(ctx, arrowStart.x, arrowStart.y, arrowEnd.x, arrowEnd.y, true);
                }
                break;
            case 'text':
                const textPos = convertToEditModalCoordinates(a.x, a.y);
                const fontFamily = a.fontFamily || 'Arial';
                const fontWeight = a.fontWeight || 'normal';
                const fontStyle = a.fontStyle || 'normal';
                ctx.font = `${fontStyle} ${fontWeight} ${a.size}px ${fontFamily}`;
                ctx.textBaseline = 'top';
                ctx.fillText(a.text, textPos.x, textPos.y);
                // Draw selection handles for selected text
                if (state.selectedAnnotation === index) {
                    const textMetrics = ctx.measureText(a.text);
                    drawSelectionHandles(ctx, textPos.x, textPos.y, textPos.x + textMetrics.width, textPos.y + a.size);
                }
                break;
        }
    });

    // Draw the annotation currently being created
    if (state.currentAnnotation) {
        ctx.strokeStyle = state.currentAnnotation.color;
        ctx.lineWidth = state.currentAnnotation.lineWidth;
        if (state.currentAnnotation.type === 'rect') {
            ctx.strokeRect(state.currentAnnotation.x1, state.currentAnnotation.y1, state.currentAnnotation.x2 - state.currentAnnotation.x1, state.currentAnnotation.y2 - state.currentAnnotation.y1);
        } else if (state.currentAnnotation.type === 'arrow') {
            drawArrow(ctx, state.currentAnnotation.x1, state.currentAnnotation.y1, state.currentAnnotation.x2, state.currentAnnotation.y2);
        }
    }
}

// NEW: Function to draw selection handles
function drawSelectionHandles(ctx, x1, y1, x2, y2, isLine = false) {
    const handleSize = 6;
    ctx.fillStyle = '#ff0000';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;

    if (isLine) {
        // For lines/arrows, show handles at both ends
        ctx.fillRect(x1 - handleSize/2, y1 - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(x1 - handleSize/2, y1 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x2 - handleSize/2, y2 - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(x2 - handleSize/2, y2 - handleSize/2, handleSize, handleSize);
    } else {
        // For rectangles and text, show corner handles
        const corners = [
            [x1, y1], [x2, y1], [x1, y2], [x2, y2]
        ];
        corners.forEach(([x, y]) => {
            ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
            ctx.strokeRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
        });
    }
}



// NEW: Function to get annotation at mouse position
function getAnnotationAt(mouseX, mouseY, annotations) {

    for (let i = annotations.length - 1; i >= 0; i--) {
        const a = annotations[i];
        console.log(`🔍 Checking annotation ${i}:`, { type: a.type, coords: a });
        
        switch (a.type) {
            case 'rect':
                // Convert coordinates for hit testing
                const rectStart = convertToEditModalCoordinates(a.x1, a.y1);
                const rectEnd = convertToEditModalCoordinates(a.x2, a.y2);
                if (mouseX >= Math.min(rectStart.x, rectEnd.x) && mouseX <= Math.max(rectStart.x, rectEnd.x) &&
                    mouseY >= Math.min(rectStart.y, rectEnd.y) && mouseY <= Math.max(rectStart.y, rectEnd.y)) {
                    console.log(`✅ Rect annotation ${i} hit!`);
                    return i;
                }
                break;
            case 'arrow':
                // Check if click is near the line (with some tolerance)
                const tolerance = 10;
                const arrowStart = convertToEditModalCoordinates(a.x1, a.y1);
                const arrowEnd = convertToEditModalCoordinates(a.x2, a.y2);
                const dist = distanceToLine(mouseX, mouseY, arrowStart.x, arrowStart.y, arrowEnd.x, arrowEnd.y);
                if (dist <= tolerance) {
                    console.log(`✅ Arrow annotation ${i} hit! Distance: ${dist}`);
                    return i;
                }
                break;
            case 'text':
                // Simple bounding box check for text (approximation, actual text width might vary)
                const textPos = convertToEditModalCoordinates(a.x, a.y);
                const tempCtxForText = ui.editCanvas.getContext('2d'); // Get a temporary context
                tempCtxForText.font = `${a.fontStyle || 'normal'} ${a.fontWeight || 'normal'} ${a.size}px ${a.fontFamily || 'Arial'}`;
                const textMetrics = tempCtxForText.measureText(a.text);
                const textWidth = textMetrics.width;
                const textHeight = a.size; // Approximated height for click detection

                if (mouseX >= textPos.x && mouseX <= textPos.x + textWidth &&
                    mouseY >= textPos.y && mouseY <= textPos.y + textHeight) {
                    console.log(`✅ Text annotation ${i} hit!`);
                    return i;
                }
                break;
        }
    }
    console.log('❌ No annotation hit');
    return -1;
}

// NEW: Helper for distance to line (for arrow selection)
function distanceToLine(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// Helper function to convert edit modal coordinates to original image coordinates
function convertToOriginalImageCoordinates(editModalX, editModalY) {
    const transform = state.editModalCoordinateTransform;
    const originalX = (editModalX - transform.offsetX) * transform.scaleX;
    const originalY = (editModalY - transform.offsetY) * transform.scaleY;
    

    
    return { x: originalX, y: originalY };
}

// Helper function to convert from original image coordinates to edit modal coordinates
function convertToEditModalCoordinates(originalX, originalY) {
    const transform = state.editModalCoordinateTransform;
    const editModalX = (originalX / transform.scaleX) + transform.offsetX;
    const editModalY = (originalY / transform.scaleY) + transform.offsetY;
    

    
    return { x: editModalX, y: editModalY };
}



function drawArrow(ctx, fromx, fromy, tox, toy) {
    const headlen = 10; // length of head in pixels
    const dx = tox - fromx;
    const dy = toy - fromy;
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
}

    export function redrawEditCanvas() {
    if (!state.editImage.src) return;

    const edits = state.currentlyEditingPanel.edits;
    ui.editCtx.clearRect(0, 0, ui.editCanvas.width, ui.editCanvas.height);

    // Apply filters
    ui.editCtx.filter = `brightness(${ui.brightnessSlider.value}%) contrast(${ui.contrastSlider.value}%) grayscale(${edits.greyscale || 0}%)`;

    // Save context for transformation
    ui.editCtx.save();

    // Translate to center of canvas and rotate
    ui.editCtx.translate(ui.editCanvas.width / 2, ui.editCanvas.height / 2);
    ui.editCtx.rotate((ui.rotateSlider.value || 0) * Math.PI / 180);
    ui.editCtx.translate(-ui.editCanvas.width / 2, -ui.editCanvas.height / 2);

    // Draw the image and restore context
    ui.editCtx.drawImage(state.editImage, 0, 0, ui.editCanvas.width, ui.editCanvas.height);
    ui.editCtx.restore();

    // Reset filter for drawing annotations and crop box
    ui.editCtx.filter = 'none';

    drawAnnotations(ui.editCtx, state.currentlyEditingPanel);
            // Only draw cropBox and overlay if cropBox exists
                if (state.cropBox) {
            drawCropBox(ui.editCtx, state.cropBox);
        }

    // Trigger mini preview update for edit modal
    if (state.isEditModalOpen) {
        updateMiniPreview(true);
    }
}

function drawCropBox(ctx, box) {
    ctx.save();

    // Normalize box dimensions (handle negative width/height from dragging up/left)
    const normalizedBox = {
        x: Math.min(box.x, box.x + box.width),
        y: Math.min(box.y, box.y + box.height),
        width: Math.abs(box.width),
        height: Math.abs(box.height)
    };

    // Draw the full overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Use globalCompositeOperation to "punch a hole" in the overlay for the crop area
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(normalizedBox.x, normalizedBox.y, normalizedBox.width, normalizedBox.height);

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';

    // Draw crop box border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(normalizedBox.x, normalizedBox.y, normalizedBox.width, normalizedBox.height);

    // Draw resize handles
    const handleSize = 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;

    // Corner handles
    const handles = [
        { x: normalizedBox.x, y: normalizedBox.y }, // top-left
        { x: normalizedBox.x + normalizedBox.width, y: normalizedBox.y }, // top-right
        { x: normalizedBox.x, y: normalizedBox.y + normalizedBox.height }, // bottom-left
        { x: normalizedBox.x + normalizedBox.width, y: normalizedBox.y + normalizedBox.height } // bottom-right
    ];

    handles.forEach(handle => {
        ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
    });

    ctx.restore();
}

    function getCropBoxInteraction(mouseX, mouseY, box) {
    const handleSize = 8;
    const tolerance = handleSize / 2;

    // Normalize box dimensions
    const normalizedBox = {
        x: Math.min(box.x, box.x + box.width),
        y: Math.min(box.y, box.y + box.height),
        width: Math.abs(box.width),
        height: Math.abs(box.height)
    };

    // Check corner handles
    const corners = [
        { type: 'nw-resize', x: normalizedBox.x, y: normalizedBox.y },
        { type: 'ne-resize', x: normalizedBox.x + normalizedBox.width, y: normalizedBox.y },
        { type: 'sw-resize', x: normalizedBox.x, y: normalizedBox.y + normalizedBox.height },
        { type: 'se-resize', x: normalizedBox.x + normalizedBox.width, y: normalizedBox.y + normalizedBox.height }
    ];

    for (let corner of corners) {
        if (Math.abs(mouseX - corner.x) <= tolerance && Math.abs(mouseY - corner.y) <= tolerance) {
            return corner.type;
        }
    }

    // Check if inside crop box (for moving)
    if (mouseX >= normalizedBox.x && mouseX <= normalizedBox.x + normalizedBox.width && 
        mouseY >= normalizedBox.y && mouseY <= normalizedBox.y + normalizedBox.height) {
        return 'move';
    }

    return 'crop'; // Default crop behavior if no specific interaction detected
}

function generateEditedImage(sourceUrl, edits, scale = 1) {
    console.log(`🔧 generateEditedImage called with:`, {
        sourceUrl: sourceUrl,
        edits: edits,
        scale: scale,
        hasAnnotations: !!(edits && edits.annotations),
        annotationsCount: edits && edits.annotations ? edits.annotations.length : 0,
        annotations: edits && edits.annotations ? edits.annotations : []
    });
    
    return new Promise((resolve, reject) => {
        console.log(`generateEditedImage: Starting with sourceUrl=${sourceUrl ? 'valid' : 'invalid'}, scale=${scale}`);
        const sourceImage = new Image();

        const cleanup = () => {
            sourceImage.src = '';
            sourceImage.onload = null;
            sourceImage.onerror = null;
        };

        sourceImage.onload = () => {
            try {
                console.log(`generateEditedImage: Image loaded, dimensions: ${sourceImage.width}x${sourceImage.height}`);
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                const crop = edits.crop || { x: 0, y: 0, width: sourceImage.width, height: sourceImage.height };

                const validCrop = {
                    x: Math.max(0, Math.min(crop.x, sourceImage.width)),
                    y: Math.max(0, Math.min(crop.y, sourceImage.height)),
                    width: Math.max(1, Math.min(crop.width, sourceImage.width - crop.x)),
                    height: Math.max(1, Math.min(crop.height, sourceImage.height - crop.y))
                };

                const intermediateMaxDimension = 4000;
                const targetWidth = validCrop.width * scale;
                const targetHeight = validCrop.height * scale;
                let finalWidth = targetWidth;
                let finalHeight = targetHeight;
                if (targetWidth > intermediateMaxDimension || targetHeight > intermediateMaxDimension) {
                    const scaleRatio = Math.min(intermediateMaxDimension / targetWidth, intermediateMaxDimension / targetHeight);
                    finalWidth = Math.floor(targetWidth * scaleRatio);
                    finalHeight = Math.floor(targetHeight * scaleRatio);
                    console.log(`generateEditedImage: Using intermediate size ${finalWidth}x${finalHeight} (target was ${targetWidth}x${targetHeight})`);
                }

                tempCanvas.width = finalWidth;
                tempCanvas.height = finalHeight;

                const greyscale = edits.greyscale || 0;
                tempCtx.filter = `brightness(${edits.brightness}%) contrast(${edits.contrast}%) grayscale(${greyscale}%)`;
                tempCtx.save();
                tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
                tempCtx.rotate((edits.rotation || 0) * Math.PI / 180);
                tempCtx.drawImage(sourceImage,
                    validCrop.x, validCrop.y, validCrop.width, validCrop.height,
                    -finalWidth / 2, -finalHeight / 2, finalWidth, finalHeight
                );
                tempCtx.restore();

                tempCtx.filter = 'none';
                if (edits.annotations && edits.annotations.length > 0) {
                    // Compute effective scale actually used on this tempCanvas (accounts for intermediate downscale and crop)
                    const effectiveScaleX = finalWidth / validCrop.width;
                    const effectiveScaleY = finalHeight / validCrop.height;
                    const effectiveLineScale = Math.min(effectiveScaleX, effectiveScaleY);
                    console.log(`🔧 generateEditedImage: Processing ${edits.annotations.length} annotations`);

                    // Apply same rotation transform as the image so annotations align when rotation != 0
                    tempCtx.save();
                    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
                    tempCtx.rotate((edits.rotation || 0) * Math.PI / 180);
                    tempCtx.translate(-tempCanvas.width / 2, -tempCanvas.height / 2);

                    edits.annotations.forEach((annotation, index) => {

                        tempCtx.strokeStyle = annotation.color;
                        tempCtx.fillStyle = annotation.color;
                        tempCtx.lineWidth = (annotation.lineWidth || 2) * effectiveLineScale;

                        // Convert from original-image coordinates into cropped, scaled canvas space
                        const scaledX = (annotation.x - (validCrop.x || 0)) * effectiveScaleX;
                        const scaledY = (annotation.y - (validCrop.y || 0)) * effectiveScaleY;
                        const scaledX1 = (annotation.x1 - (validCrop.x || 0)) * effectiveScaleX;
                        const scaledY1 = (annotation.y1 - (validCrop.y || 0)) * effectiveScaleY;
                        const scaledX2 = (annotation.x2 - (validCrop.x || 0)) * effectiveScaleX;
                        const scaledY2 = (annotation.y2 - (validCrop.y || 0)) * effectiveScaleY;

                        switch (annotation.type) {
                            case 'rect':
                                tempCtx.strokeRect(scaledX1, scaledY1, scaledX2 - scaledX1, scaledY2 - scaledY1);
                                break;
                            case 'arrow':
                                drawArrow(tempCtx, scaledX1, scaledY1, scaledX2, scaledY2);
                                break;
                            case 'text':
                                const fontFamily = annotation.fontFamily || 'Arial';
                                const fontWeight = annotation.fontWeight || 'normal';
                                const fontStyle = annotation.fontStyle || 'normal';
                                const fontSize = (annotation.size || 16) * effectiveLineScale;
                                tempCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
                                tempCtx.textBaseline = 'top';
                                tempCtx.fillText(annotation.text, scaledX, scaledY);
                                break;
                        }
                    });

                    tempCtx.restore();
                } else {
                    console.log(`🔧 generateEditedImage: No annotations to process`);
                }

                const imageData = tempCtx.getImageData(0, 0, Math.min(100, tempCanvas.width), Math.min(100, tempCanvas.height));
                const hasContent = imageData.data.some(pixel => pixel !== 0);
                console.log(`generateEditedImage: Created canvas for panel, dimensions: ${tempCanvas.width}x${tempCanvas.height}, has content: ${hasContent}`);
                
                // Return the canvas element to preserve annotations
                cleanup();
                resolve(tempCanvas);
            } catch (err) {
                console.error('generateEditedImage: Unexpected processing error', err);
                cleanup();
                reject(err);
            }
        };
        sourceImage.onerror = (error) => {
            console.error(`generateEditedImage: Failed to load image:`, error);
            cleanup();
            reject(error);
        };
        sourceImage.src = sourceUrl;
    });
}

function setModalControlsDisabled(disabled) {
    ui.applyEditBtn.disabled = disabled;
    ui.cancelEditBtn.disabled = disabled;
    ui.brightnessSlider.disabled = disabled;
    ui.contrastSlider.disabled = disabled;
    ui.resetCropBtn.disabled = disabled;
    ui.resetBrightnessBtn.disabled = disabled;
    ui.resetContrastBtn.disabled = disabled;
    ui.resetRotateBtn.disabled = disabled;
    ui.greyscaleBtn.disabled = disabled;
}

function attachEditModalListeners() {
    // --- Edit Modal Side Panel: Collapsible, Resizable, Accordion, Accessibility ---
    const modalContent = document.querySelector('#edit-modal .modal-content');
    // FIX: Use global state instead of local variable
    // let lastPanelWidth = 350; // Default "open" width

    if (ui.collapseBtn && ui.editControlsPanel && modalContent) {
        ui.collapseBtn.addEventListener('click', () => {
            const isCollapsed = ui.editControlsPanel.classList.toggle('collapsed');
            if (isCollapsed) {
                const currentGridCols = window.getComputedStyle(modalContent).gridTemplateColumns.split(' ');
                if (currentGridCols.length > 1) {
                    const colWidthPx = parseInt(currentGridCols[1]);
                    if (!isNaN(colWidthPx) && colWidthPx >= 220) state.lastPanelWidth = colWidthPx;
                }
                modalContent.style.gridTemplateColumns = '1fr 36px';
            } else {
                modalContent.style.gridTemplateColumns = `1fr ${state.lastPanelWidth}px`;
            }
        });
    }

    // FIX: Use global state instead of local variable
    // let isResizing = false;

    if (ui.resizeHandle && ui.editControlsPanel && modalContent) {
        ui.resizeHandle.addEventListener('mousedown', (e) => {
            if (ui.editControlsPanel.classList.contains('collapsed')) {
                // Do nothing if collapsed
                return;
            }
            state.isResizing = true;
            const startX = e.clientX;
            ui.editControlsPanel.classList.remove('collapsed');
            const currentGridCols = window.getComputedStyle(modalContent).gridTemplateColumns.split(' ');
            const startWidth = parseInt(currentGridCols[1]) || 350;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            function onMouseMove(e) {
                if (!state.isResizing) return;
                let newWidth = startWidth - (e.clientX - startX);
                newWidth = Math.max(260, Math.min(600, newWidth));
                state.lastPanelWidth = newWidth;
                modalContent.style.gridTemplateColumns = `1fr ${newWidth}px`;
            }

            function onMouseUp() {
                if (state.isResizing) {
                    state.isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                }
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    ui.accordionHeaders.forEach((header, idx) => {
        header.addEventListener('click', () => {
            const isExpanded = header.getAttribute('aria-expanded') === 'true';
            header.setAttribute('aria-expanded', String(!isExpanded));
            const panel = header.nextElementSibling;
            panel.hidden = isExpanded;
        });
        if (idx === 0) {
            header.click(); // Open the first one by default
        }
    });

    ui.figureCanvas.addEventListener('dblclick', (e) => {
        if (!state.project.figures || !state.project.figures[state.activeFigureIndex]) return;
        const mousePos = getMousePos(ui.figureCanvas, e);
        const clickedPanel = [...state.project.figures[state.activeFigureIndex].panels].reverse().find(panel => isMouseOverPanel(mousePos, panel));
        if (clickedPanel) {
            openEditModal(clickedPanel);
        }
    });

    // --- START: NEW ANNOTATION TOOL LISTENER ---
    ui.annotationTools.addEventListener('click', (e) => {
        const toolBtn = e.target.closest('.tool-btn');
        if (!toolBtn) return;
        
        const toolType = toolBtn.dataset.tool;
        if (!toolType) return;
        
        // Update the active tool in global state
        state.activeAnnotationTool = toolType;
        
        // Update visual state of all tool buttons
        document.querySelectorAll('#annotation-tools .tool-btn').forEach(btn => {
            btn.classList.remove('active-tool');
        });
        toolBtn.classList.add('active-tool');
        
        // Show/hide styling options based on tool type
        ui.annotationStylingOptions.classList.toggle(
             'hidden-by-default',
             toolType === 'crop' || !toolType      // hide only for crop / nothing picked
        );
        
        // Deselect any currently selected annotation when switching tools
        state.selectedAnnotation = null;
        hideAnnotationStylingOptions();
    });

    ui.clearAnnotationsBtn.addEventListener('click', () => {
        if (state.currentlyEditingPanel && confirm("Are you sure you want to remove all annotations for this panel?")) {
            state.currentlyEditingPanel.edits.annotations = [];
            state.selectedAnnotation = null;
            hideAnnotationStylingOptions();
            saveAnnotationState(); // NEW: Save to annotation history
            redrawEditCanvas();
        }
    });

            // Annotation control change listeners
        ui.annotationColorInput.addEventListener('change', () => {
            if (state.selectedAnnotation !== null && state.currentlyEditingPanel) {
                state.currentlyEditingPanel.edits.annotations[state.selectedAnnotation].color = ui.annotationColorInput.value;
                redrawEditCanvas();
            }
        });

        ui.annotationLineWidthInput.addEventListener('change', () => {
            if (state.selectedAnnotation !== null && state.currentlyEditingPanel) {
                state.currentlyEditingPanel.edits.annotations[state.selectedAnnotation].lineWidth = parseInt(ui.annotationLineWidthInput.value);
                redrawEditCanvas();
            }
        });

        ui.annotationFontSizeInput.addEventListener('change', () => {
            if (state.selectedAnnotation !== null && state.currentlyEditingPanel) {
                const annotation = state.currentlyEditingPanel.edits.annotations[state.selectedAnnotation];
                if (annotation.type === 'text') {
                    annotation.size = parseInt(ui.annotationFontSizeInput.value);
                    redrawEditCanvas();
                }
            }
        });

        ui.annotationFontFamilySelect.addEventListener('change', () => {
            if (state.selectedAnnotation !== null && state.currentlyEditingPanel) {
                const annotation = state.currentlyEditingPanel.edits.annotations[state.selectedAnnotation];
                if (annotation.type === 'text') {
                    annotation.fontFamily = ui.annotationFontFamilySelect.value;
                    redrawEditCanvas();
                }
            }
        });

            // Bold/Italic button event listeners
        if (ui.annotationBoldBtn) { // Check if elements exist before attaching listeners
            ui.annotationBoldBtn.addEventListener('click', () => {
                ui.annotationBoldBtn.classList.toggle('active');
                if (state.selectedAnnotation !== null && state.currentlyEditingPanel) {
                    const annotation = state.currentlyEditingPanel.edits.annotations[state.selectedAnnotation];
                    if (annotation.type === 'text') {
                        annotation.fontWeight = ui.annotationBoldBtn.classList.contains('active') ? 'bold' : 'normal';
                        redrawEditCanvas();
                    }
                }
            });
        }
        if (ui.annotationItalicBtn) { // Check if elements exist before attaching listeners
            ui.annotationItalicBtn.addEventListener('click', () => {
                ui.annotationItalicBtn.classList.toggle('active');
                if (state.selectedAnnotation !== null && state.currentlyEditingPanel) {
                    const annotation = state.currentlyEditingPanel.edits.annotations[state.selectedAnnotation];
                    if (annotation.type === 'text') {
                        annotation.fontStyle = ui.annotationItalicBtn.classList.contains('active') ? 'italic' : 'normal';
                        redrawEditCanvas();
                    }
                }
            });
        }

            // Add keyboard support for annotation editing
        ui.editModal.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && state.selectedAnnotation !== null && state.currentlyEditingPanel) {
                state.currentlyEditingPanel.edits.annotations.splice(state.selectedAnnotation, 1);
                state.selectedAnnotation = null;
                saveAnnotationState(); // NEW: Save to annotation history
                redrawEditCanvas();
                e.preventDefault();
            }
        });

    // Remove any existing listeners to prevent duplication
    ui.brightnessSlider.removeEventListener('input', ui.brightnessSlider._inputHandler);
    ui.contrastSlider.removeEventListener('input', ui.contrastSlider._inputHandler);
    ui.rotateSlider.removeEventListener('input', ui.rotateSlider._inputHandler);

    // Create and store new handlers
    ui.brightnessSlider._inputHandler = (e) => {
        ui.brightnessValue.textContent = e.target.value + '%';
        redrawEditCanvas();
    };
    ui.contrastSlider._inputHandler = (e) => {
        ui.contrastValue.textContent = e.target.value + '%';
        redrawEditCanvas();
    };
    ui.rotateSlider._inputHandler = (e) => {
        ui.rotateValue.textContent = e.target.value + '°';
        redrawEditCanvas();
    };

    // Add the new listeners
    ui.brightnessSlider.addEventListener('input', ui.brightnessSlider._inputHandler);
    ui.contrastSlider.addEventListener('input', ui.contrastSlider._inputHandler);
    ui.rotateSlider.addEventListener('input', ui.rotateSlider._inputHandler);

    ui.resetBrightnessBtn.addEventListener('click', () => {
        ui.brightnessSlider.value = 100;
        ui.brightnessValue.textContent = '100%';
        redrawEditCanvas();
    });

    ui.resetContrastBtn.addEventListener('click', () => {
        ui.contrastSlider.value = 100;
        ui.contrastValue.textContent = '100%';
        redrawEditCanvas();
    });

    ui.resetRotateBtn.addEventListener('click', () => {
        ui.rotateSlider.value = 0;
        ui.rotateValue.textContent = '0°';
        redrawEditCanvas();
    });

    // FIX: Greyscale button listener
    ui.greyscaleBtn.addEventListener('click', () => {
        if (!state.currentlyEditingPanel) return;
        const currentGreyscale = state.currentlyEditingPanel.edits.greyscale || 0;
        state.currentlyEditingPanel.edits.greyscale = (currentGreyscale === 100) ? 0 : 100;

        // Update button visual state
        if (state.currentlyEditingPanel.edits.greyscale === 100) {
            ui.greyscaleBtn.classList.add('active');
            ui.greyscaleBtn.textContent = 'Remove Greyscale';
        } else {
            ui.greyscaleBtn.classList.remove('active');
            ui.greyscaleBtn.textContent = 'Toggle Greyscale';
        }

        redrawEditCanvas();
    });

    ui.resetCropBtn.addEventListener('click', () => {
        // Reset cropBox to allow new crop
        state.cropBox = null;
        state.cropInteractionMode = null;
        redrawEditCanvas();
    });
    ui.cancelEditBtn.addEventListener('click', closeEditModal);

    ui.applyEditBtn.addEventListener('click', async () => {
        if (!state.currentlyEditingPanel) return;
        setModalControlsDisabled(true);
        ui.applyEditBtn.textContent = "Applying...";

        const panel = state.currentlyEditingPanel;
        const activeFigure = state.project.figures[state.activeFigureIndex]; // Get activeFigure reference

        // If the user manually applies edits while in a grid-compatible 'auto' layout,
        // lock in that grid layout to preserve manual span settings.
        if (activeFigure.settings.layout === 'auto' && activeFigure.effectiveLayout && activeFigure.effectiveLayout.startsWith('grid')) {
            console.log(`User is applying edits, switching layout from 'auto' to '${activeFigure.effectiveLayout}' to preserve custom spans.`);
            activeFigure.settings.layout = activeFigure.effectiveLayout;
            updateLayoutButtonSelection(activeFigure.settings.layout);
        }

        panel.edits.brightness = ui.brightnessSlider.value;
        panel.edits.contrast = ui.contrastSlider.value;
        panel.edits.rotation = ui.rotateSlider.value;
        // Store crop settings
        panel.edits.crop = state.cropBox ? { ...state.cropBox } : null;
        const inputColspan = parseInt(ui.panelColspanInput.value) || 1;
        const inputRowspan = parseInt(ui.panelRowspanInput.value) || 1;

        panel.edits.layoutSpan = {
            colspan: inputColspan,
            rowspan: inputRowspan,
        };
        // Note: greyscale is already set on the panel object by its own button

        try {
            console.log('Applying edits to panel:', panel.id, 'Edits:', panel.edits);
            const editedResult = await generateEditedImage(panel.pristineSrc, panel.edits);
            
            // GenerateEditedImage now always returns a canvas element
            const newImageSrc = editedResult.toDataURL('image/png');
            console.log('Generated new image from canvas, data URL length:', newImageSrc.length);
            
            const newImg = new Image();
            newImg.onload = () => {
                console.log('New image loaded, dimensions:', newImg.width, 'x', newImg.height);
                
                // Store the canvas element to preserve annotations for export
                panel.image = editedResult;
                // Also store the data URL for display purposes
                panel.originalSrc = newImageSrc;
                
                panel.originalWidth = newImg.width;
                panel.originalHeight = newImg.height;
                if (!state.isRestoringState) {
                    saveState();
                }
                // Ensure the image is fully loaded before rendering
                requestAnimationFrame(() => {

                    // Force a complete layout recalculation by clearing any cached layout data
                    if (panel.gridPos) {
                        delete panel.gridPos; // Clear cached grid position
                    }
                    // Also clear grid positions for all panels to ensure complete recalculation
                    const activeFigure = state.project.figures[state.activeFigureIndex];
                    if (activeFigure) {
                        console.log('Current layout type:', activeFigure.settings.layout, 'Effective layout:', activeFigure.effectiveLayout);
                        if (activeFigure.panels) {
                            activeFigure.panels.forEach(p => {
                                if (p.gridPos) {
                                    delete p.gridPos;
                                }
                            });
                        }
                    }
                    // Small delay to ensure changes are fully applied
                    setTimeout(() => {
                        console.log('Final check - panel layoutSpan before render:', panel.edits.layoutSpan);
                        console.log('Panel object before renderFigure:', panel);
                        renderFigure(); // This updates the main canvas with the new panel.image and layout
                    }, 10);
                });
                closeEditModal();
                // Removed setTimeout(updateMiniPreview, 10);
            };
            newImg.onerror = (error) => {
                console.error("Failed to load edited image:", error);
                alert("Failed to load the edited image. Please try again.");
            };
            newImg.src = newImageSrc;
        } catch (error) {
            console.error("Failed to apply edits:", error);
            alert("Could not apply edits. Please try again.");
        } finally {
            setModalControlsDisabled(false);
            ui.applyEditBtn.textContent = "Apply Changes";
        }
    });

    // Panel span controls - only update mini preview, not main canvas
    ui.panelColspanInput.addEventListener('change', () => {
        if (state.currentlyEditingPanel) {
            const newSpan = {
                colspan: parseInt(ui.panelColspanInput.value) || 1,
                rowspan: parseInt(ui.panelRowspanInput.value) || 1,
            };

            state.currentlyEditingPanel.edits.layoutSpan = newSpan;
            console.log('🎯 Layout span change detected (colspan) - calling saveState()');
            console.log('📊 New layout span:', {
                panelId: state.currentlyEditingPanel.id,
                panelLabel: state.currentlyEditingPanel.label,
                newSpan: newSpan
            });
            // Save state to history for undo/redo functionality
            if (!state.isRestoringState) {
                saveState();
            }
            // Trigger update through hash change detection
            updateMiniPreview(true);
        }
    });

    ui.panelRowspanInput.addEventListener('change', () => {
        if (state.currentlyEditingPanel) {
            const newSpan = {
                colspan: parseInt(ui.panelColspanInput.value) || 1,
                rowspan: parseInt(ui.panelRowspanInput.value) || 1,
            };

            state.currentlyEditingPanel.edits.layoutSpan = newSpan;
            console.log('🎯 Layout span change detected (rowspan) - calling saveState()');
            console.log('📊 New layout span:', {
                panelId: state.currentlyEditingPanel.id,
                panelLabel: state.currentlyEditingPanel.label,
                newSpan: newSpan
            });
            // Save state to history for undo/redo functionality
            if (!state.isRestoringState) {
                saveState();
            }
            // Trigger update through hash change detection
            updateMiniPreview(true);
        }
    });

    ui.editCanvas.addEventListener('mousedown', (e) => {
        const mousePos = getMousePos(ui.editCanvas, e);
        const mouseX = mousePos.x;
        const mouseY = mousePos.y;

                    if (state.activeAnnotationTool === 'crop') {
                    // Handle crop tool mousedown
        const interaction = state.cropBox ? getCropBoxInteraction(mouseX, mouseY, state.cropBox) : 'new-crop';
            state.cropInteractionMode = interaction;
            state.cropStartPos = { x: mouseX, y: mouseY };
            state.cropStartBox = state.cropBox ? { ...state.cropBox } : null; // Store current cropBox state for moves/resizes

            if (interaction.endsWith('-resize') || interaction === 'move') {
                state.isCropping = true;
                // cropBox values will be adjusted in mousemove based on interaction mode
            } else { // This is 'new-crop' (clicked outside existing box or no box)
                state.isCropping = true;
                state.cropBox = { x: mouseX, y: mouseY, width: 0, height: 0 }; // Initialize new crop box
                state.cropInteractionMode = 'new-crop'; // Set mode to drawing a new crop
            }
        } else {
            // Check if we clicked on an existing annotation for editing
            const clickedAnnotation = getAnnotationAt(mouseX, mouseY, state.currentlyEditingPanel.edits.annotations);

            if (clickedAnnotation !== -1) {
                // Select the annotation for editing
                state.selectedAnnotation = clickedAnnotation;
                const annotation = state.currentlyEditingPanel.edits.annotations[clickedAnnotation];

                // Show styling options and populate controls
                showAnnotationStylingOptions(annotation.type);
                populateAnnotationControls(annotation);

                state.isDraggingAnnotation = true;
                state.annotationDragStart = { x: mouseX, y: mouseY };

                // If it's text and double-clicked, edit the text
                if (annotation.type === 'text' && e.detail === 2) {
                    const newText = prompt("Edit text:", annotation.text);
                    if (newText !== null) {
                        annotation.text = newText;
                        redrawEditCanvas();
                        // Removed setTimeout(updateMiniPreview, 10);
                    }
                    return; // Prevent further mousedown processing
                }
                redrawEditCanvas(); // Redraw to show selection highlight
                            } else if (state.activeAnnotationTool === 'text') {
                const text = prompt("Enter annotation text:");
                if (text && state.currentlyEditingPanel) {
                    // Get bold/italic states directly from buttons
                    const bold = ui.annotationBoldBtn ? ui.annotationBoldBtn.classList.contains('active') : false;
                    const italic = ui.annotationItalicBtn ? ui.annotationItalicBtn.classList.contains('active') : false;

                    // Convert coordinates to original image space before storing
                    const originalCoords = convertToOriginalImageCoordinates(mouseX, mouseY);

                    const newAnnotation = {
                        type: 'text',
                        text: text,
                        x: originalCoords.x,
                        y: originalCoords.y,
                        color: ui.annotationColorInput.value,
                        size: parseInt(ui.annotationFontSizeInput.value),
                        fontFamily: ui.annotationFontFamilySelect.value,
                        fontWeight: bold ? 'bold' : 'normal',
                        fontStyle: italic ? 'italic' : 'normal'
                    };
                    state.currentlyEditingPanel.edits.annotations.push(newAnnotation);
                    console.log('✅ Text annotation created and saved:', {
                        annotation: newAnnotation,
                        totalAnnotations: state.currentlyEditingPanel.edits.annotations.length,
                        panelEdits: state.currentlyEditingPanel.edits
                    });
                    state.selectedAnnotation = state.currentlyEditingPanel.edits.annotations.length - 1; // Select the new annotation
                    showAnnotationStylingOptions('text'); // Ensure text options are visible
                    populateAnnotationControls(newAnnotation); // Populate controls with new annotation's props
                    saveAnnotationState(); // NEW: Save to annotation history
                    redrawEditCanvas();
                }
                            } else if (state.activeAnnotationTool === 'arrow' || state.activeAnnotationTool === 'rect') {
                    // Deselect any selected annotation when starting a new draw
                    state.selectedAnnotation = null;
                    state.isDrawingAnnotation = true;
                    
                    // Convert coordinates to original image space before storing
                    const originalCoords = convertToOriginalImageCoordinates(mouseX, mouseY);
                    
                    state.currentAnnotation = {
                        type: state.activeAnnotationTool,
                        x1: originalCoords.x, y1: originalCoords.y,
                        x2: originalCoords.x, y2: originalCoords.y,
                        color: ui.annotationColorInput.value,
                        lineWidth: parseInt(ui.annotationLineWidthInput.value)
                    };
            }
        }
    });

    ui.editCanvas.addEventListener('mousemove', (e) => {
        const mousePos = getMousePos(ui.editCanvas, e);
        const mouseX = mousePos.x;
        const mouseY = mousePos.y;

                    // Update cursor based on interaction
            if (state.activeAnnotationTool === 'crop' && state.cropBox && !state.isCropping) { // Only update cursor if not already dragging crop
            const interaction = getCropBoxInteraction(mouseX, mouseY, state.cropBox);
            ui.editCanvas.style.cursor = interaction === 'move' ? 'move' : 
                                         interaction === 'crop' ? 'crosshair' : interaction;
        } else if (!state.isCropping && !state.isDrawingAnnotation && !state.isDraggingAnnotation) {
            // Check if hovering over an annotation
            const hoveredAnnotation = getAnnotationAt(mouseX, mouseY, state.currentlyEditingPanel.edits.annotations);
            ui.editCanvas.style.cursor = hoveredAnnotation !== -1 ? 'pointer' : 'crosshair';
        } else if (state.isCropping || state.isDrawingAnnotation || state.isDraggingAnnotation) {
            ui.editCanvas.style.cursor = 'grabbing'; // Show grabbing cursor when actively dragging something
        } else {
            ui.editCanvas.style.cursor = 'default'; // Default cursor when nothing active
        }

        if (!state.isCropping && !state.isDrawingAnnotation && !state.isDraggingAnnotation) return;

        if (state.isCropping && state.cropInteractionMode) {
            const dx = mouseX - state.cropStartPos.x;
            const dy = mouseY - state.cropStartPos.y;

            switch (state.cropInteractionMode) {
                case 'new-crop':
                    // Click-and-drag crop: draw from start point to current mouse position
                    state.cropBox.width = mouseX - state.cropStartPos.x;
                    state.cropBox.height = mouseY - state.cropStartPos.y;
                    break;
                case 'move':
                    state.cropBox.x = state.cropStartBox.x + dx;
                    state.cropBox.y = state.cropStartBox.y + dy;
                    break;
                case 'nw-resize':
                    state.cropBox.x = state.cropStartBox.x + dx;
                    state.cropBox.y = state.cropStartBox.y + dy;
                    state.cropBox.width = state.cropStartBox.width - dx;
                    state.cropBox.height = state.cropStartBox.height - dy;
                    break;
                case 'ne-resize':
                    state.cropBox.y = state.cropStartBox.y + dy;
                    state.cropBox.width = state.cropStartBox.width + dx;
                    state.cropBox.height = state.cropStartBox.height - dy;
                    break;
                case 'sw-resize':
                    state.cropBox.x = state.cropStartBox.x + dx;
                    state.cropBox.width = state.cropStartBox.width - dx;
                    state.cropBox.height = state.cropStartBox.height + dy;
                    break;
                case 'se-resize':
                    state.cropBox.width = state.cropStartBox.width + dx;
                    state.cropBox.height = state.cropStartBox.height + dy;
                    break;
            }
            // Update global state after any cropBox modification
        } else if (state.isDrawingAnnotation) {
                                // Update annotation endpoints in original image coordinates
                    const originalCoords = convertToOriginalImageCoordinates(mouseX, mouseY);
            state.currentAnnotation.x2 = originalCoords.x;
            state.currentAnnotation.y2 = originalCoords.y;
        } else if (state.isDraggingAnnotation && state.selectedAnnotation !== null) {
            const dx = mouseX - state.annotationDragStart.x;
            const dy = mouseY - state.annotationDragStart.y;
            const annotation = state.currentlyEditingPanel.edits.annotations[state.selectedAnnotation];

            // Convert the drag delta to original image coordinates
            const originalDelta = convertToOriginalImageCoordinates(dx, dy);
            const actualDeltaX = originalDelta.x - convertToOriginalImageCoordinates(0, 0).x;
            const actualDeltaY = originalDelta.y - convertToOriginalImageCoordinates(0, 0).y;

            // Move the annotation
            switch (annotation.type) {
                case 'text':
                    annotation.x += actualDeltaX;
                    annotation.y += actualDeltaY;
                    break;
                case 'rect':
                case 'arrow':
                    annotation.x1 += actualDeltaX;
                    annotation.y1 += actualDeltaY;
                    annotation.x2 += actualDeltaX;
                    annotation.y2 += actualDeltaY;
                    break;
            }

            state.annotationDragStart = { x: mouseX, y: mouseY }; // Update drag start for next move
        }
        redrawEditCanvas();
    });

    ui.editCanvas.addEventListener('mouseup', () => {
        if (state.isCropping) {
            state.isCropping = false;

            // Normalize and validate cropBox
            if (state.cropBox) {
                const normalizedBox = {
                    x: Math.min(state.cropBox.x, state.cropBox.x + state.cropBox.width),
                    y: Math.min(state.cropBox.y, state.cropBox.y + state.cropBox.height),
                    width: Math.abs(state.cropBox.width),
                    height: Math.abs(state.cropBox.height)
                };

                // Clamp to canvas boundaries
                normalizedBox.x = Math.max(0, Math.min(normalizedBox.x, ui.editCanvas.width - 1));
                normalizedBox.y = Math.max(0, Math.min(normalizedBox.y, ui.editCanvas.height - 1));

                // Ensure minimum dimensions and within canvas bounds
                normalizedBox.width = Math.max(10, Math.min(normalizedBox.width, ui.editCanvas.width - normalizedBox.x));
                normalizedBox.height = Math.max(10, Math.min(normalizedBox.height, ui.editCanvas.height - normalizedBox.y));

                state.cropBox = normalizedBox;
            }

            state.cropInteractionMode = null;
            ui.editCanvas.style.cursor = 'crosshair';
        }
        if (state.isDrawingAnnotation) {
            state.isDrawingAnnotation = false;
            if (state.currentlyEditingPanel && state.currentAnnotation) {
                // Ensure new annotation is added only if it has meaningful dimensions (for rect/arrow)
                if (state.currentAnnotation.type === 'text' || 
                    (state.currentAnnotation.type === 'rect' && Math.abs(state.currentAnnotation.x2 - state.currentAnnotation.x1) > 1 && Math.abs(state.currentAnnotation.y2 - state.currentAnnotation.y1) > 1) ||
                    (state.currentAnnotation.type === 'arrow' && (Math.abs(state.currentAnnotation.x2 - state.currentAnnotation.x1) > 1 || Math.abs(state.currentAnnotation.y2 - state.currentAnnotation.y1) > 1)) ) {
                    state.currentlyEditingPanel.edits.annotations.push(state.currentAnnotation);
                    console.log('✅ Annotation created and saved:', {
                        annotation: state.currentAnnotation,
                        totalAnnotations: state.currentlyEditingPanel.edits.annotations.length,
                        panelEdits: state.currentlyEditingPanel.edits
                    });
                    state.selectedAnnotation = state.currentlyEditingPanel.edits.annotations.length - 1; // Select the newly drawn one
                    showAnnotationStylingOptions(state.currentAnnotation.type); // Show options for newly drawn annotation
                    populateAnnotationControls(state.currentAnnotation); // Populate controls
                    saveAnnotationState(); // NEW: Save to annotation history
                }
            }
            state.currentAnnotation = null;
            redrawEditCanvas();
        }
        if (state.isDraggingAnnotation) {
            state.isDraggingAnnotation = false;
        }
    });
}

// Function to add scroll support to edit controls
export function addEditControlsScrollSupport() {
    const editControls = document.getElementById('edit-controls');
    if (editControls) {
        // Force scrollbar to be visible
        editControls.style.overflowY = 'scroll';
        editControls.style.overflowX = 'hidden';

        editControls.addEventListener('wheel', function(e) {
            e.preventDefault();
            const scrollAmount = e.deltaY;
            editControls.scrollTop += scrollAmount;
        }, { passive: false });
    }
}

// Export the main functions that are called from outside this module
export { attachEditModalListeners, generateEditedImage, openEditModal };

