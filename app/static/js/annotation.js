/**
 * Annotation history functionality for the EasyFigAssembler application
 * Handles undo/redo operations for annotation edits
 */

import { hideAnnotationStylingOptions, redrawEditCanvas } from './editModal.js';
import { state } from './state.js';
import * as ui from './ui.js';

/**
 * Initialize annotation history event listeners
 */
export function initializeAnnotationEventListeners() {
    // Annotation history listeners
    if (ui.undoAnnotationBtn) ui.undoAnnotationBtn.addEventListener('click', undoAnnotation);
    if (ui.redoAnnotationBtn) ui.redoAnnotationBtn.addEventListener('click', redoAnnotation);
}

/**
 * Save current annotation state to history
 */
export function saveAnnotationState() {
    if (!state.currentlyEditingPanel) return;

    state.annotationRedoStack = []; // Clear redo stack on new action
    state.annotationHistoryStack.push(JSON.parse(JSON.stringify(state.currentlyEditingPanel.edits.annotations)));

    // Limit history stack size
    if (state.annotationHistoryStack.length > 20) {
        state.annotationHistoryStack.shift();
    }

    updateAnnotationHistoryButtons();
}

/**
 * Undo last annotation action
 */
export function undoAnnotation() {
    if (state.annotationHistoryStack.length < 2 || !state.currentlyEditingPanel) return;

    state.annotationRedoStack.push(state.annotationHistoryStack.pop());
    const previousState = state.annotationHistoryStack[state.annotationHistoryStack.length - 1];
    state.currentlyEditingPanel.edits.annotations = JSON.parse(JSON.stringify(previousState));

    state.selectedAnnotation = null;
    hideAnnotationStylingOptions();
    redrawEditCanvas();
    updateAnnotationHistoryButtons();
}

/**
 * Redo last undone annotation action
 */
export function redoAnnotation() {
    if (state.annotationRedoStack.length === 0 || !state.currentlyEditingPanel) return;

    const nextState = state.annotationRedoStack.pop();
    state.annotationHistoryStack.push(nextState);
    state.currentlyEditingPanel.edits.annotations = JSON.parse(JSON.stringify(nextState));

    state.selectedAnnotation = null;
    hideAnnotationStylingOptions();
    redrawEditCanvas();
    updateAnnotationHistoryButtons();
}

/**
 * Update annotation history button states
 */
export function updateAnnotationHistoryButtons() {
    if (ui.undoAnnotationBtn) ui.undoAnnotationBtn.disabled = state.annotationHistoryStack.length < 2;
    if (ui.redoAnnotationBtn) ui.redoAnnotationBtn.disabled = state.annotationRedoStack.length === 0;
}

/**
 * Reset annotation history
 */
export function resetAnnotationHistory() {
    state.annotationHistoryStack = [];
    state.annotationRedoStack = [];
    if (state.currentlyEditingPanel) {
        state.annotationHistoryStack.push(JSON.parse(JSON.stringify(state.currentlyEditingPanel.edits.annotations || [])));
    }
    updateAnnotationHistoryButtons();
}

