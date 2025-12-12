import { renderFigure } from './canvas.js';
import { generateEditedImage } from './editModal.js';
import { state } from './state.js';
import * as ui from './ui.js';

// Import functions that need to be available globally (these will be set on window)
// Note: These functions are defined in main.js and will be available globally
// switchFigure, renderTabs

/**
 * Get the current state of the project for history tracking
 * @returns {Object} Deep copy of current project state
 */
export function getCurrentState() {
    console.log('🔍 getCurrentState() called');
    const currentState = JSON.parse(JSON.stringify({
        figures: state.project.figures.map(fig => ({
            ...fig,
            // Explicitly preserve the effectiveLayout to maintain layout type across undo/redo
            effectiveLayout: fig.effectiveLayout,
            panels: fig.panels.map(panel => ({
                id: panel.id,
                label: panel.label,
                order: panel.order,
                pristineSrc: panel.pristineSrc,
                edits: panel.edits,
                originalFileType: panel.originalFileType,
                // Include custom position properties for custom layouts
                customX: panel.customX,
                customY: panel.customY,
                customWidth: panel.customWidth,
                customHeight: panel.customHeight
            }))
        })),
        activeFigureIndex: state.activeFigureIndex
    }));
    console.log('📊 Current state captured:', {
        activeFigureIndex: currentState.activeFigureIndex,
        figuresCount: currentState.figures.length,
        panelsCount: currentState.figures[0]?.panels?.length || 0,
        firstPanel: currentState.figures[0]?.panels[0] ? {
            id: currentState.figures[0].panels[0].id,
            label: currentState.figures[0].panels[0].label,
            order: currentState.figures[0].panels[0].order,
            customX: currentState.figures[0].panels[0].customX,
            customY: currentState.figures[0].panels[0].customY
        } : null
    });
    return currentState;
}

/**
 * Restore the project to a previously saved state
 * @param {Object} stateToRestore - The state to restore
 */
export async function restoreState(stateToRestore) {
    console.log('🔄 restoreState() called with:', {
        hasFigures: !!stateToRestore?.figures,
        figuresCount: stateToRestore?.figures?.length || 0,
        activeFigureIndex: stateToRestore?.activeFigureIndex
    });
    
    if (!stateToRestore || !stateToRestore.figures) {
        console.error("❌ Attempted to restore invalid state.");
        return;
    }
    if (!state.project) state.project = {};

    const figurePromises = stateToRestore.figures.map(savedFigure => {
        return new Promise(resolveFigure => {
            if (!savedFigure.panels) {
                resolveFigure({ ...savedFigure, panels: [] });
                return;
            }
            const panelPromises = savedFigure.panels.map(savedPanel => {
                return new Promise(async (resolvePanel) => {
                    console.log('🖼️ Restoring panel:', {
                        id: savedPanel.id,
                        label: savedPanel.label,
                        order: savedPanel.order,
                        customX: savedPanel.customX,
                        customY: savedPanel.customY
                    });
                    
                    // FIX: Ensure generateEditedImage correctly bakes annotations when restoring
                    const editedResult = await generateEditedImage(savedPanel.pristineSrc, savedPanel.edits);
                    
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
                    });
                    img.src = editedSrc;
                });
            });
            Promise.all(panelPromises).then(rebuiltPanels => {
                console.log('✅ Figure restored with', rebuiltPanels.length, 'panels');
                resolveFigure({ ...savedFigure, panels: rebuiltPanels });
            });
        });
    });

    state.project.figures = await Promise.all(figurePromises);
    state.activeFigureIndex = stateToRestore.activeFigureIndex;
    
    console.log('🎯 State restored successfully:', {
        activeFigureIndex: state.activeFigureIndex,
        figuresCount: state.project.figures.length,
        panelsCount: state.project.figures[0]?.panels?.length || 0
    });

    if (state.activeFigureIndex >= 0 && state.project.figures[state.activeFigureIndex]) {
        window.switchFigure(state.activeFigureIndex, false);
    } else if (state.project.figures.length > 0) {
        window.switchFigure(0, false);
    } else {
        window.renderTabs();
        renderFigure();
    }
}

/**
 * Save the current state to the history stack
 */
export function saveState() {
    console.log('💾 saveState() called - isRestoringState:', state.isRestoringState);
    // Prevent saving state during undo/redo operations
    if (state.isRestoringState) {
        console.log('🚫 saveState() blocked - currently restoring state');
        return;
    }
    
    console.log('💾 saveState() proceeding');
    console.log('📈 History stack before save:', {
        historyLength: state.historyStack.length,
        redoLength: state.redoStack.length
    });
    
    state.redoStack = [];
    const newState = getCurrentState();
    state.historyStack.push(newState);
    
    if (state.historyStack.length > 30) {
        state.historyStack.shift();
    }
    
    console.log('📈 History stack after save:', {
        historyLength: state.historyStack.length,
        redoLength: state.redoStack.length
    });
    
    updateHistoryButtons();
}

/**
 * Undo the last action by restoring the previous state
 */
export async function undo() {
    console.log('⏪ undo() called');
    // Prevent re-entrancy while an undo/redo restore is already in progress
    if (state.isRestoringState) {
        console.log('🚫 undo() ignored - state is currently restoring');
        return;
    }
    console.log('📊 State before undo:', {
        historyLength: state.historyStack.length,
        redoLength: state.redoStack.length,
        activeFigureIndex: state.activeFigureIndex,
        currentPanelsCount: state.project.figures[state.activeFigureIndex]?.panels?.length || 0
    });

    if (state.historyStack.length < 2) {
        console.log('❌ Cannot undo: history stack too small');
        return;
    }

    const currentState = state.historyStack.pop();
    state.redoStack.push(currentState);

    // Mark restoring state BEFORE any async rebuild begins so saveState() calls are suppressed
    state.isRestoringState = true;

    // Immediately update buttons to reflect new stack size so a fast double-click doesn't fire a second undo
    updateHistoryButtons();

    const previousState = JSON.parse(JSON.stringify(state.historyStack[state.historyStack.length - 1]));
    console.log('📋 Previous state retrieved:', {
        activeFigureIndex: previousState.activeFigureIndex,
        figuresCount: previousState.figures.length,
        panelsCount: previousState.figures[0]?.panels?.length || 0,
        firstPanel: previousState.figures[0]?.panels[0] ? {
            id: previousState.figures[0].panels[0].id,
            label: previousState.figures[0].panels[0].label,
            order: previousState.figures[0].panels[0].order,
            customX: previousState.figures[0].panels[0].customX,
            customY: previousState.figures[0].panels[0].customY
        } : null
    });

    // Restore the previous state
    state.project = { figures: [] };
    state.activeFigureIndex = previousState.activeFigureIndex;

    const figurePromises = previousState.figures.map(savedFigure => {
        return new Promise(resolveFigure => {
            const panelPromises = savedFigure.panels.map(savedPanel => {
                return new Promise(async (resolvePanel) => {
                    console.log('🔄 Restoring panel in undo:', {
                        id: savedPanel.id,
                        label: savedPanel.label,
                        order: savedPanel.order,
                        customX: savedPanel.customX,
                        customY: savedPanel.customY
                    });

                    const editedResult = await generateEditedImage(savedPanel.pristineSrc, savedPanel.edits);
                    
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
                        originalWidth: img.width,
                        originalHeight: img.height,
                        originalSrc: editedSrc,
                    });
                    img.src = editedSrc;
                });
            });
            Promise.all(panelPromises).then(rebuiltPanels => {
                console.log('✅ Figure rebuilt in undo with', rebuiltPanels.length, 'panels');
                resolveFigure({ ...savedFigure, panels: rebuiltPanels });
            });
        });
    });

    Promise.all(figurePromises).then(rebuiltFigures => {
        state.project.figures = rebuiltFigures;

        console.log('🎯 Undo completed successfully:', {
            activeFigureIndex: state.activeFigureIndex,
            figuresCount: state.project.figures.length,
            panelsCount: state.project.figures[0]?.panels?.length || 0,
            historyLength: state.historyStack.length,
            redoLength: state.redoStack.length
        });

        // Debug: Log panel positions after restoration
        if (state.project.figures[0]?.panels) {
            console.log('🔍 Panel positions after undo restoration:');
            state.project.figures[0].panels.forEach(panel => {
                console.log(`  Panel ${panel.label}: customX=${panel.customX}, customY=${panel.customY}, order=${panel.order}`);
            });
        }

    window.switchFigure(state.activeFigureIndex, false);
    // Re-run button update (redo becomes enabled, undo might remain disabled) after rebuild
    updateHistoryButtons();

        // Force a re-render to ensure visual updates
        setTimeout(() => {
            console.log('🔄 Forcing re-render after undo');
            renderFigure();
        }, 50);

        // Set isRestoringState to false AFTER all UI updates are complete (next tick to allow any switchFigure triggered renders)
        setTimeout(() => {
            state.isRestoringState = false;
        }, 0);
    });
}

/**
 * Redo the last undone action
 */
export async function redo() {
    console.log('⏩ redo() called');
    if (state.isRestoringState) {
        console.log('� redo() ignored - state is currently restoring');
        return;
    }
    console.log('�📊 State before redo:', {
        historyLength: state.historyStack.length,
        redoLength: state.redoStack.length,
        activeFigureIndex: state.activeFigureIndex
    });

    if (state.redoStack.length === 0) {
        console.log('❌ Cannot redo: redo stack empty');
        return;
    }

    const nextState = state.redoStack.pop();
    state.historyStack.push(nextState);

    // Enter restoring state and immediately update buttons so user cannot spam redo
    state.isRestoringState = true;
    updateHistoryButtons();

    console.log('📋 Next state retrieved:', {
        activeFigureIndex: nextState.activeFigureIndex,
        figuresCount: nextState.figures.length,
        panelsCount: nextState.figures[0]?.panels?.length || 0
    });

    // Restore the next state
    state.project = { figures: [] };
    state.activeFigureIndex = nextState.activeFigureIndex;

    const figurePromises = nextState.figures.map(savedFigure => {
        return new Promise(resolveFigure => {
            const panelPromises = savedFigure.panels.map(savedPanel => {
                return new Promise(async (resolvePanel) => {
                    console.log('🔄 Restoring panel in redo:', {
                        id: savedPanel.id,
                        label: savedPanel.label,
                        order: savedPanel.order,
                        customX: savedPanel.customX,
                        customY: savedPanel.customY
                    });

                    const editedResult = await generateEditedImage(savedPanel.pristineSrc, savedPanel.edits);
                    
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
                        originalWidth: img.width,
                        originalHeight: img.height,
                        originalSrc: editedSrc,
                    });
                    img.src = editedSrc;
                });
            });
            Promise.all(panelPromises).then(rebuiltPanels => {
                console.log('✅ Figure rebuilt in redo with', rebuiltPanels.length, 'panels');
                resolveFigure({ ...savedFigure, panels: rebuiltPanels });
            });
        });
    });

    Promise.all(figurePromises).then(rebuiltFigures => {
        state.project.figures = rebuiltFigures;

        console.log('🎯 Redo completed successfully:', {
            activeFigureIndex: state.activeFigureIndex,
            figuresCount: state.project.figures.length,
            panelsCount: state.project.figures[0]?.panels?.length || 0,
            historyLength: state.historyStack.length,
            redoLength: state.redoStack.length
        });

        // Debug: Log panel positions after restoration
        if (state.project.figures[0]?.panels) {
            console.log('🔍 Panel positions after redo restoration:');
            state.project.figures[0].panels.forEach(panel => {
                console.log(`  Panel ${panel.label}: customX=${panel.customX}, customY=${panel.customY}, order=${panel.order}`);
            });
        }

    window.switchFigure(state.activeFigureIndex, false);
    updateHistoryButtons();

        // Force a re-render to ensure visual updates
        setTimeout(() => {
            console.log('🔄 Forcing re-render after redo');
            renderFigure();
        }, 50);

        setTimeout(() => {
            state.isRestoringState = false;
        }, 0);
    });
}

/**
 * Update the enabled/disabled state of undo/redo buttons
 */
export function updateHistoryButtons() {
    const undoDisabled = state.historyStack.length < 2;
    const redoDisabled = state.redoStack.length === 0;
    
    console.log('🔘 Updating history buttons:', {
        undoDisabled,
        redoDisabled,
        historyLength: state.historyStack.length,
        redoLength: state.redoStack.length
    });
    
    const wasUndoDisabled = ui.undoBtn.disabled;
    ui.undoBtn.disabled = undoDisabled;
    ui.redoBtn.disabled = redoDisabled;
    
    if (wasUndoDisabled && !undoDisabled) {
        console.log('✅ Undo button is now ENABLED!');
    } else if (!wasUndoDisabled && undoDisabled) {
        console.log('❌ Undo button is now DISABLED!');
    }
}

/**
 * Initialize history buttons to disabled state
 */
export function initializeHistoryButtons() {
    console.log('🔧 Initializing history buttons');
    ui.undoBtn.disabled = true;
    ui.redoBtn.disabled = true;
}

/**
 * Reset all changes to the original state when panels were first loaded
 */
export async function resetAllChanges() {
    console.log('🔄 resetAllChanges() called');
    
    if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex] || state.project.figures[state.activeFigureIndex].panels.length === 0) {
        alert("No panels to reset.");
        return;
    }

    if (!confirm("This will reset all panels to their original state. All edits (cropping, annotations, adjustments) and panel positions will be lost. Continue?")) {
        return;
    }

    // Check if we have a first state in history to reset to
    if (state.historyStack.length === 0) {
        alert("No initial state found to reset to.");
        return;
    }

    try {
        // Reset to the first state in history (when panels were just loaded)
        const firstState = state.historyStack[0];
        console.log('🔄 Resetting to first state:', {
            activeFigureIndex: firstState.activeFigureIndex,
            figuresCount: firstState.figures.length,
            panelsCount: firstState.figures[0]?.panels?.length || 0
        });
        
        await restoreState(JSON.parse(JSON.stringify(firstState)));

        // Reset history to just the first state
        state.historyStack = [firstState];
        state.redoStack = [];
        updateHistoryButtons();

        // Reset custom layout state
        state.selectedPanelCustom = null;
        state.isPanelDraggingCustom = false;
        state.isPanelResizingCustom = false;
        state.activeResizeHandleType = null;

        console.log("✅ All panels reset to original state");

    } catch (error) {
        console.error("❌ Error resetting panels:", error);
        alert("Failed to reset panels. Please try again.");
    }
} 