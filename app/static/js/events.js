/**
 * Event listener initialization for the EasyFigAssembler application
 * Handles collapsible sidebar cards and other UI interactions
 */

import * as api from './api.js';
import { setLoadingState } from './api.js';
import {
    redrawCanvasOnly,
    renderFigure
} from './canvas.js';
import { showFeedbackModal } from './feedback.js';
import {
    addFigure,
    deleteFigure,
    handleContextMenuAction,
    hideContextMenu,
    showContextMenu,
    switchFigure,
    updateAuxiliaryUI,
    updateLayoutButtonSelection
} from './figure.js';
import {
    handleFiles,
    hideSmartLayoutLoadingDialog,
    loadDemoPanels,
    loadProject,
    showSmartLayoutLoadingDialog
} from './file.js';
import {
    getCurrentState,
    redo,
    resetAllChanges,
    saveState,
    undo
} from './history.js';
import { updateMiniPreview } from './preview.js';
import { state } from './state.js';
import * as ui from './ui.js';
import {
    findNearestSnap,
    getMousePos,
    getPanelVisualBounds,
    getResizeHandle,
    getSnapPositions,
    isMouseOverPanel,
    snapToGrid
} from './utils.js';
import {
    applyCustomSize,
    fitToPage,
    handleContainerSizeChange,
    resetZoom,
    restoreContainerOverflow,
    updateContainerForAutoSize,
    updateGridControlsState,
    updateJournalInfoDisplay,
    zoomIn,
    zoomOut
} from './view.js';

/**
 * Initialize all application event listeners
 * Sets up event handlers for UI interactions like collapsible cards
 */
export function initializeAppEventListeners() {
    // Collapsible sidebar cards
    document.addEventListener('click', (e) => {
        const cardHeader = e.target.closest('.card-header');
        if (cardHeader) {
            const card = cardHeader.closest('.sidebar-card, .main-content-card');
            if (card) {
                card.classList.toggle('collapsed');
            }
        }
    });
}

/**
 * Initialize all sidebar control event listeners
 * Handles journal selection, label controls, spacing controls, layout options, export controls, and grid controls
 */
export function initializeSidebarEventListeners() {
    // Journal selection listener
    if (ui.journalSelect) {
        ui.journalSelect.addEventListener('change', (e) => {
        const activeFigure = state.project.figures[state.activeFigureIndex];
        if (!activeFigure) return;
        activeFigure.settings.targetWidth = null;
        ui.targetWidthInput.value = '';
        activeFigure.settings.journal = e.target.value;
        updateJournalInfoDisplay();
        if (!state.isRestoringState) {
            saveState();
        }
        renderFigure();
    });
    }

    // Label style and position listeners
    if (ui.labelStyleSelect) {
        ui.labelStyleSelect.addEventListener('change', (e) => {
            handleSettingChange('labelStyle', e.target.value);
            updateAuxiliaryUI();
        });
    }
    if (ui.labelPositionSelect) {
        ui.labelPositionSelect.addEventListener('change', (e) => handleSettingChange('labelPosition', e.target.value));
    }
    if (ui.labelFontFamilySelect) {
        ui.labelFontFamilySelect.addEventListener('change', (e) => handleSettingChange('labelFontFamily', e.target.value));
    }
    if (ui.labelFontSizeInput) {
        ui.labelFontSizeInput.addEventListener('change', (e) => handleSettingChange('labelFontSize', e.target.value));
    }
    if (ui.labelFontWeightSelect) {
        ui.labelFontWeightSelect.addEventListener('change', (e) => handleSettingChange('labelFontWeight', e.target.value));
    }

    // Panel Spacing listeners
    initializePanelSpacingListeners();

    // Label Spacing listeners
    initializeLabelSpacingListeners();

    // Layout options container listener
    if (ui.layoutOptionsContainer) {
        ui.layoutOptionsContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('layout-btn')) {
            const layout = e.target.dataset.layout;
            console.log('Layout button clicked. Layout:', layout);

            if (state.project.figures[state.activeFigureIndex]) {
                state.project.figures[state.activeFigureIndex].effectiveLayout = null;
            }

            // Add pressed effect
            e.target.classList.add('pressed');
            setTimeout(() => {
                e.target.classList.remove('pressed');
            }, 150);

            // Reset custom layout state when switching away from custom
            if (layout !== 'custom') {
                state.selectedPanelCustom = null;
                state.isPanelDraggingCustom = false;
                state.isPanelResizingCustom = false;
                state.activeResizeHandleType = null;
            }

            // Special handling for Smart Layout
            if (layout === 'auto') {
                // Show loading dialog immediately
                showSmartLayoutLoadingDialog();

                // Update layout setting and button selection immediately
                handleSettingChange('layout', layout);
                updateLayoutButtonSelection(layout);

                // Add artificial delay for Smart Layout
                await new Promise(resolve => setTimeout(resolve, 2500));

                // Trigger rendering after delay
                renderFigure();

                // --- FIX: Ensure container is sized correctly after loading panels ---
                if (state.containerSizeMode === 'auto') {
                    // Import setContainerSize dynamically to avoid circular dependency
                    const { setContainerSize } = await import('./view.js');
                    setContainerSize('auto');
                }

                // Hide loading dialog
                hideSmartLayoutLoadingDialog();
            } else {
                // For all other layouts, proceed normally
                handleSettingChange('layout', layout);
                updateLayoutButtonSelection(layout);
            }

            // Update span controls if modal is open
            if (state.isEditModalOpen) {
                setTimeout(() => {
                    // Import updateLayoutSpanControls dynamically to avoid circular dependency
                    import('./view.js').then(({ updateLayoutSpanControls }) => {
                        updateLayoutSpanControls();
                    });
                }, 100);
            }
        }
    });
    }

    // Apply dimension button listener
    if (ui.applyDimensionBtn) {
        ui.applyDimensionBtn.addEventListener('click', () => {
        const val = parseFloat(ui.targetWidthInput.value);
        handleSettingChange('targetWidth', (val && val > 0) ? val : null);
        updateJournalInfoDisplay(); // Update journal info when custom width is applied
    });
    }

    // Export options listeners
    initializeExportListeners();

    // Grid control listeners
    initializeGridControlListeners();

    // Zoom and View control listeners
    if (ui.zoomInBtn) ui.zoomInBtn.addEventListener('click', zoomIn);
    if (ui.zoomOutBtn) ui.zoomOutBtn.addEventListener('click', zoomOut);
    if (ui.zoomResetBtn) ui.zoomResetBtn.addEventListener('click', resetZoom);

    // Additional controls
    if (ui.fitToPageBtn) ui.fitToPageBtn.addEventListener('click', fitToPage);

    // Container size controls
    if (ui.containerSizeSelect) {
        ui.containerSizeSelect.addEventListener('change', handleContainerSizeChange);
    }
    if (ui.applyCustomSizeBtn) {
        ui.applyCustomSizeBtn.addEventListener('click', applyCustomSize);
    }

    // Window resize listener for auto-sizing (debounced)
    // FIX: Use global state instead of local variable
    // let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(state.resizeTimeout);
        state.resizeTimeout = setTimeout(() => {
            if (state.containerSizeMode === 'auto') {
                updateContainerForAutoSize();
            } else {
                // For non-auto modes, just fit the canvas to the container when window resizes.
                fitToPage();
            }
        }, 150); // Debounce resize events
    });

    // Context menu listeners
    document.addEventListener('click', hideContextMenu);
    if (ui.panelContextMenu) {
        ui.panelContextMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.target.dataset.action;
        if (action) handleContextMenuAction(action);
    });
    }

    // Figure caption listener
    if (ui.figureCaptionEditor) {
        ui.figureCaptionEditor.addEventListener('input', () => {
        if (state.activeFigureIndex >= 0 && state.project.figures[state.activeFigureIndex]) {
            state.project.figures[state.activeFigureIndex].caption = ui.figureCaptionEditor.value;
            // Debounced save to avoid excessive history entries
            clearTimeout(ui.figureCaptionEditor._saveTimeout);
            ui.figureCaptionEditor._saveTimeout = setTimeout(() => {
                if (!state.isRestoringState) {
                    saveState();
                }
            }, 1000);
        }
    });
    }

    // Figure caption Save button
    const saveCaptionBtn = document.getElementById('save-caption-btn');
    if (saveCaptionBtn) {
        saveCaptionBtn.addEventListener('click', () => {
            if (state.activeFigureIndex >= 0 && state.project.figures[state.activeFigureIndex]) {
                state.project.figures[state.activeFigureIndex].caption = ui.figureCaptionEditor.value;
                if (!state.isRestoringState) {
                    saveState();
                }

                // Visual feedback
                const originalText = saveCaptionBtn.textContent;
                saveCaptionBtn.textContent = 'Saved!';
                saveCaptionBtn.style.background = 'linear-gradient(145deg, #20c997, #17a2b8)';
                setTimeout(() => {
                    saveCaptionBtn.textContent = originalText;
                    saveCaptionBtn.style.background = '';
                }, 1500);
            }
        });
    }

    // Figure caption Clear button
    const clearCaptionBtn = document.getElementById('clear-caption-btn');
    if (clearCaptionBtn) {
        clearCaptionBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the figure legend?')) {
                ui.figureCaptionEditor.value = '';
                if (state.activeFigureIndex >= 0 && state.project.figures[state.activeFigureIndex]) {
                    state.project.figures[state.activeFigureIndex].caption = '';
                    if (!state.isRestoringState) {
                        saveState();
                    }
                }
            }
        });
    }

    // Maintain aspect ratio checkbox listener
    if (ui.maintainAspectRatioCheckbox) {
        ui.maintainAspectRatioCheckbox.addEventListener('change', () => {
        if(state.activeFigureIndex === -1) return;
        state.project.figures[state.activeFigureIndex].settings.maintainAspectRatio = ui.maintainAspectRatioCheckbox.checked;
        if (!state.isRestoringState) {
            saveState();
        }
        renderFigure();
    });
    }
}

/**
 * Initialize panel spacing event listeners
 */
function initializePanelSpacingListeners() {
    // FIX: Use global state instead of local variable
    // let renderTimeout;

    // Panel Spacing Functions
    function updateSpacingAll(val) {
        val = Math.round(Math.max(0, Math.min(50, val)));
        if (ui.spacingSlider) {
            ui.spacingSlider.value = val;
            // Update slider progress for visual fill
            const progress = (val / 50) * 100;
            ui.spacingSlider.style.setProperty('--slider-progress', progress + '%');
        }
        if (ui.spacingNumber) ui.spacingNumber.value = val;
        if (ui.spacingDecrease) ui.spacingDecrease.disabled = val <= 0;
        if (ui.spacingIncrease) ui.spacingIncrease.disabled = val >= 50;
        if (ui.spacingPreview) ui.spacingPreview.style.setProperty('--current-spacing', val + 'px');
        if (ui.spacingCurrentDisplay) ui.spacingCurrentDisplay.textContent = val + 'px';
        handleSettingChange('spacing', val.toString());
    }

    // Panel Spacing Event Listeners
    if (ui.spacingSlider) {
        ui.spacingSlider.addEventListener('input', (e) => {
            updateSpacingAll(parseInt(e.target.value));
        });
    }

    if (ui.spacingNumber) {
        ui.spacingNumber.addEventListener('input', (e) => {
            updateSpacingAll(parseInt(e.target.value) || 0);
        });
        ui.spacingNumber.addEventListener('change', (e) => {
            updateSpacingAll(parseInt(e.target.value) || 0);
        });
    }

    if (ui.spacingDecrease) {
        ui.spacingDecrease.addEventListener('click', () => {
            const currentVal = ui.spacingSlider ? parseInt(ui.spacingSlider.value) : 10;
            updateSpacingAll(currentVal - 1);
        });
    }

    if (ui.spacingIncrease) {
        ui.spacingIncrease.addEventListener('click', () => {
            const currentVal = ui.spacingSlider ? parseInt(ui.spacingSlider.value) : 10;
            updateSpacingAll(currentVal + 1);
        });
    }

    if (ui.spacingReset) {
        ui.spacingReset.addEventListener('click', () => {
            updateSpacingAll(10);
        });
    }

    // Spacing Presets
    ui.spacingPresets.forEach(btn => {
        btn.addEventListener('click', () => {
            const value = parseInt(btn.dataset.value);
            if (!isNaN(value)) {
                updateSpacingAll(value);
            }
        });
    });
}

/**
 * Initialize label spacing event listeners
 */
function initializeLabelSpacingListeners() {
    // Label Spacing Controls
    function updateLabelSpacingAll(val) {
        val = Math.round(Math.max(0, Math.min(30, val)));
        if (ui.labelSpacingNumber) ui.labelSpacingNumber.value = val;
        if (ui.labelSpacingValue) ui.labelSpacingValue.textContent = val;
        if (ui.labelSpacingDecrease) ui.labelSpacingDecrease.disabled = val <= 0;
        if (ui.labelSpacingIncrease) ui.labelSpacingIncrease.disabled = val >= 30;
        handleSettingChange('labelSpacing', val);
    }

    if (ui.labelSpacingNumber) {
        ui.labelSpacingNumber.addEventListener('input', (e) => {
            updateLabelSpacingAll(parseInt(e.target.value) || 0);
        });
        ui.labelSpacingNumber.addEventListener('change', (e) => {
            updateLabelSpacingAll(parseInt(e.target.value) || 0);
        });
    }

    if (ui.labelSpacingDecrease) {
        ui.labelSpacingDecrease.addEventListener('click', () => {
            const currentVal = ui.labelSpacingNumber ? parseInt(ui.labelSpacingNumber.value) : 0;
            updateLabelSpacingAll(currentVal - 1);
        });
    }

    if (ui.labelSpacingIncrease) {
        ui.labelSpacingIncrease.addEventListener('click', () => {
            const currentVal = ui.labelSpacingNumber ? parseInt(ui.labelSpacingNumber.value) : 0;
            updateLabelSpacingAll(currentVal + 1);
        });
    }
}

/**
 * Initialize export-related event listeners
 */
function initializeExportListeners() {
    const exportDpiSelect = ui.getExportDpiSelect();
    const exportDpiCustom = ui.getExportDpiCustom();
    const exportFigureBtn = ui.getExportFigureBtn();
    
    if (!exportDpiSelect || !exportDpiCustom) {
        console.warn('Export DPI elements not found');
        return;
    }
    
    exportDpiSelect.addEventListener('change', (e) => {
        exportDpiCustom.style.display = e.target.value === 'custom' ? 'inline-block' : 'none';
        // Hide validation message when switching away from custom
        if (e.target.value !== 'custom') {
            const dpiValidationMessage = ui.getDpiValidationMessage();
            if (dpiValidationMessage) {
                dpiValidationMessage.style.display = 'none';
            }
        }
    });

    // Add DPI validation for custom input
    exportDpiCustom.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const dpiValidationMessage = ui.getDpiValidationMessage();
        
        if (!dpiValidationMessage) {
            console.warn('DPI validation message element not found');
            return;
        }
        
        if (value > 1200) {
            dpiValidationMessage.textContent = 'Maximum DPI allowed is 1200. Please enter a lower value.';
            dpiValidationMessage.style.display = 'block';
            e.target.setCustomValidity('Maximum DPI allowed is 1200');
            // Disable export button for invalid DPI
            if (exportFigureBtn) {
                exportFigureBtn.disabled = true;
            }
        } else if (value < 50) {
            dpiValidationMessage.textContent = 'Minimum DPI allowed is 50. Please enter a higher value.';
            dpiValidationMessage.style.display = 'block';
            e.target.setCustomValidity('Minimum DPI allowed is 50');
            // Disable export button for invalid DPI
            if (exportFigureBtn) {
                exportFigureBtn.disabled = true;
            }
        } else {
            dpiValidationMessage.style.display = 'none';
            e.target.setCustomValidity('');
            // Re-enable export button if format is selected
            if (exportFigureBtn && state.selectedExportFormat) {
                exportFigureBtn.disabled = false;
            }
        }
    });

    // Export format selection logic
    ui.exportOptionCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove active selection from all cards
            ui.exportOptionCards.forEach(c => c.classList.remove('active-selection'));

            // Add active selection to clicked card
            card.classList.add('active-selection');

            // Set selected format
            state.selectedExportFormat = card.dataset.format;

            // Enable export button
            ui.exportFigureBtn.disabled = false;
        });
    });

    // Export figure button logic
    exportFigureBtn.addEventListener('click', async () => {
        if (!state.selectedExportFormat) {
            alert('Please select an export format first.');
            return;
        }

        if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex] || state.project.figures[state.activeFigureIndex].panels.length === 0) {
            alert('Please upload panels before exporting.');
            return;
        }

        // Validate DPI before export
        if (exportDpiSelect.value === 'custom') {
            const customDpi = parseInt(exportDpiCustom.value);
            if (customDpi > 1200) {
                alert('Maximum DPI allowed is 1200. Please enter a lower value.');
                return;
            }
            if (customDpi < 50) {
                alert('Minimum DPI allowed is 50. Please enter a higher value.');
                return;
            }
        }

        try {
            setLoadingState(exportFigureBtn, true);

            let exportSuccess = false;
            if (state.selectedExportFormat === 'png' || state.selectedExportFormat === 'jpeg') {
                exportSuccess = await api.exportHighResClientSide(state.selectedExportFormat, exportFigureBtn);
            } else if (state.selectedExportFormat === 'pdf' || state.selectedExportFormat === 'tiff') {
                exportSuccess = await api.exportWithBackend(state.selectedExportFormat, exportFigureBtn);
            }

            // Only proceed if export was successful
            if (exportSuccess) {
                // Reset selection after successful export
                ui.exportOptionCards.forEach(c => c.classList.remove('active-selection'));
                state.selectedExportFormat = null;
                exportFigureBtn.disabled = true;

                // Show feedback modal after successful export
                showFeedbackModal();
            }

        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        } finally {
            setLoadingState(ui.exportFigureBtn, false);
        }
    });
}

/**
 * Initialize grid control event listeners
 */
function initializeGridControlListeners() {
    // Grid control event listeners with hierarchical dependency logic
    if (ui.showGridCheckbox) {
        ui.showGridCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            handleSettingChange('showGrid', isChecked);
            updateGridControlsState(isChecked);

            // When Show Grid is checked, automatically check both sub-options
            if (isChecked) {
                if (ui.showPanelGridCheckbox) {
                    ui.showPanelGridCheckbox.checked = true;
                    handleSettingChange('showPanelGrid', true);
                }
                if (ui.showLabelGridCheckbox) {
                    ui.showLabelGridCheckbox.checked = true;
                    handleSettingChange('showLabelGrid', true);
                }
            }
        });
    }

    if (ui.showPanelGridCheckbox) {
        ui.showPanelGridCheckbox.addEventListener('change', (e) => {
            handleSettingChange('showPanelGrid', e.target.checked);
        });
    }

    if (ui.showLabelGridCheckbox) {
        ui.showLabelGridCheckbox.addEventListener('change', (e) => {
            handleSettingChange('showLabelGrid', e.target.checked);
        });
    }

    if (ui.gridColorInput) {
        ui.gridColorInput.addEventListener('change', (e) => {
            handleSettingChange('gridColor', e.target.value);
        });
    }

    if (ui.gridTypeSelect) {
        ui.gridTypeSelect.addEventListener('change', (e) => {
            handleSettingChange('gridType', e.target.value);
        });
    }

    if (ui.gridThicknessInput) {
        ui.gridThicknessInput.addEventListener('change', (e) => {
            handleSettingChange('gridThickness', parseInt(e.target.value));
        });
    }
}

/**
 * Global handleSettingChange function for accessibility
 * This function needs to be available globally for the event listeners
 */
function handleSettingChange(key, value) {
    if(state.activeFigureIndex === -1) return;
    state.project.figures[state.activeFigureIndex].settings[key] = value;

    // Only save state if we're not restoring from undo/redo or switching figures
    if (!state.isRestoringState && !state.isSwitchingFigure) {
        saveState();
    }

    // For grid-related settings, only redraw without recalculating layout
    if (key.includes('Grid') || key.includes('grid')) {
        redrawCanvasOnly();
    } else {
        renderFigure();
    }
}

// Make it globally available immediately and ensure it's accessible
window.handleSettingChange = handleSettingChange;



/**
 * Initialize main content area and global action event listeners
 * Handles keyboard shortcuts, file handling, project save/load, demo buttons,
 * figure management, undo/redo, canvas interactions, zoom/view controls, and window resize
 */
export function initializeMainEventListeners() {
    console.log('🔧 initializeMainEventListeners() called');
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (!ui.undoBtn.disabled) undo();
        } else if (cmdOrCtrl && ((e.key === 'y') || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            if (!ui.redoBtn.disabled) redo();
        }
    });

    // File handling listeners
    if (ui.uploadArea && ui.fileInput) {
        ui.uploadArea.addEventListener('click', () => ui.fileInput.click());
        ui.uploadArea.addEventListener('dragover', (event) => {
            event.preventDefault();
            ui.uploadArea.style.backgroundColor = '#d0ebff';
        });
        ui.uploadArea.addEventListener('dragleave', () => {
            ui.uploadArea.style.backgroundColor = '#f0f8ff';
        });
        ui.uploadArea.addEventListener('drop', (event) => {
            event.preventDefault();
            ui.uploadArea.style.backgroundColor = '#f0f8ff';
            handleFiles(event.dataTransfer.files);
        });
        ui.fileInput.addEventListener('change', (event) => {
            handleFiles(event.target.files);
        });
    }
    
    if (ui.addPanelsBtn && ui.fileInput) {
        ui.addPanelsBtn.addEventListener('click', () => ui.fileInput.click());
    }

    // Project save/load listeners
    if (ui.saveProjectBtn) {
        ui.saveProjectBtn.addEventListener('click', () => {
            if (!state.project.figures || state.project.figures.length === 0) {
                alert("Please create a figure and upload panels before saving.");
                return;
            }
            const projectState = getCurrentState();
            const projectJson = JSON.stringify(projectState, null, 2);
            const blob = new Blob([projectJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'figure-assembler-project.json';
            link.click();
            URL.revokeObjectURL(url);
        });
    }
    
    if (ui.loadProjectInput) {
        ui.loadProjectInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const loadedProject = JSON.parse(event.target.result);
                    state.historyStack = [];
                    state.redoStack = [];
                    loadProject(loadedProject);
                } catch (error) {
                    alert("Failed to load project file. It may be corrupted.");
                    console.error("Error parsing project file:", error);
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    // Demo button event listeners with visual feedback
    const demoBtns = [
        document.getElementById('demo-btn-1'),
        document.getElementById('demo-btn-2'),
        document.getElementById('demo-btn-3')
    ];

    demoBtns.forEach((btn, index) => {
        if (btn) {
            btn.addEventListener('click', async () => {
                // Reset all demo buttons to default state
                demoBtns.forEach(b => {
                    b.classList.remove('loading', 'success');
                    b.disabled = false;
                });

                // Set clicked button to loading state
                btn.classList.add('loading');
                btn.disabled = true;
                const originalText = btn.textContent;
                btn.textContent = 'Loading...';

                try {
                    await loadDemoPanels(index + 1);

                    // Show success state
                    btn.classList.remove('loading');
                    btn.classList.add('success');
                    btn.textContent = 'Loaded!';

                    // Reset to normal state after 2 seconds
                    setTimeout(() => {
                        btn.classList.remove('success');
                        btn.textContent = originalText;
                        btn.disabled = false;
                    }, 2000);

                } catch (error) {
                    // Reset to normal state on error
                    btn.classList.remove('loading');
                    btn.textContent = originalText;
                    btn.disabled = false;
                    console.error('Demo loading failed:', error);
                }
            });
        }
    });

    // Figure management listeners
    if (ui.figureTabsContainer) {
        ui.figureTabsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-tab-btn')) {
                const index = parseInt(e.target.dataset.index);
                deleteFigure(index);
            } else {
                const tab = e.target.closest('.figure-tab');
                if (tab) {
                    const index = parseInt(tab.dataset.index);
                    if (index !== state.activeFigureIndex) {
                        switchFigure(index);
                    }
                }
            }
        });
    }

    // Undo/Redo/Reset listeners
    if (ui.undoBtn) {
        console.log('🔧 Setting up undo button event listener');
        ui.undoBtn.addEventListener('click', (e) => {
            console.log('🖱️ Undo button clicked!');
            console.log('📊 Event details:', {
                target: e.target,
                currentTarget: e.currentTarget,
                button: e.button,
                type: e.type,
                disabled: e.target.disabled
            });
            
            if (e.target.disabled) {
                console.log('❌ Undo button is disabled, ignoring click');
                return;
            }
            if (state.isRestoringState) {
                console.log('🚫 Undo click ignored - restoration in progress');
                return;
            }
            
            console.log('✅ Undo button is enabled, calling undo()');
            undo();
        });
    } else {
        console.error('❌ Undo button not found in DOM');
    }
    if (ui.redoBtn) ui.redoBtn.addEventListener('click', redo);
    if (ui.resetAllBtn) ui.resetAllBtn.addEventListener('click', resetAllChanges);
    if (ui.addFigureBtn) ui.addFigureBtn.addEventListener('click', addFigure);

    // Canvas interaction listeners
    const figureCanvasContainer = document.getElementById('figure-canvas-container');
    // FIX: Use global state instead of local variables
    // let potentialDragPanel = null;
    // let mouseDownPos = null;
    const DRAG_THRESHOLD = 5; // pixels to move before starting drag

    // Context menu for right-click
    if (figureCanvasContainer) {
        figureCanvasContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const mousePos = getMousePos(ui.figureCanvas, e);
            const activeFigure = state.project.figures[state.activeFigureIndex];
            if (!activeFigure) return;

            // Find which panel was right-clicked
            for (let i = activeFigure.panels.length - 1; i >= 0; i--) {
                const panel = activeFigure.panels[i];
                if (isMouseOverPanel(mousePos, panel)) {
                    showContextMenu(e.clientX, e.clientY, panel);
                    break;
                }
            }
        });

        figureCanvasContainer.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle mouse button
                state.isPanning = true;
                state.panStartX = e.clientX - state.canvasPanX;
                state.panStartY = e.clientY - state.canvasPanY;
                figureCanvasContainer.style.cursor = 'grabbing';
                restoreContainerOverflow(); // Restore overflow when starting to pan
                e.preventDefault(); // Prevent text selection
            } else {
                const mousePos = getMousePos(ui.figureCanvas, e);
                const activeFigure = state.project.figures[state.activeFigureIndex];
                if (!activeFigure) return;

                // Handle custom layout interactions
                if (activeFigure.settings.layout === 'custom') {
                    // Check for resize handle first
                    if (state.selectedPanelCustom) {
                        const handleType = getResizeHandle(mousePos, state.selectedPanelCustom);
                        if (handleType) {
                            state.isPanelResizingCustom = true;
                            state.activeResizeHandleType = handleType;
                            state.resizeStartPanelBounds = {
                                x: state.selectedPanelCustom.customX,
                                y: state.selectedPanelCustom.customY,
                                width: state.selectedPanelCustom.customWidth,
                                height: state.selectedPanelCustom.customHeight
                            };
                            state.dragStartMouseX = mousePos.x;
                            state.dragStartMouseY = mousePos.y;
                            restoreContainerOverflow(); // Restore overflow when resizing panels
                            return;
                        }
                    }

                    // Check for panel selection/dragging
                    for (let i = activeFigure.panels.length - 1; i >= 0; i--) {
                        const panel = activeFigure.panels[i];
                        if (isMouseOverPanel(mousePos, panel)) {
                            // Set layout to custom when starting custom dragging
                            if (activeFigure.settings.layout !== 'custom') {
                                console.log('🎯 Setting layout to custom for custom panel dragging');
                                activeFigure.settings.layout = 'custom';
                                activeFigure.effectiveLayout = 'custom';
                            }
                            
                            state.selectedPanelCustom = panel;
                            state.isPanelDraggingCustom = true;
                            // Calculate offset from mouse to panel corner (like original drag logic)
                            state.dragStartX = mousePos.x - panel.customX;
                            state.dragStartY = mousePos.y - panel.customY;
                            restoreContainerOverflow(); // Restore overflow when interacting with panels
                            renderFigure();
                            return;
                        }
                    }

                    // Clicked on empty area - deselect
                    state.selectedPanelCustom = null;
                    renderFigure();
                    return;
                }

                // Original logic for non-custom layouts
                state.mouseDownPos = { x: e.clientX, y: e.clientY };

                // Find which panel was clicked
                for (let i = activeFigure.panels.length - 1; i >= 0; i--) {
                    const panel = activeFigure.panels[i];
                    if (isMouseOverPanel(mousePos, panel)) {
                        state.potentialDragPanel = {
                            panel: panel,
                            offsetX: mousePos.x - panel.imageX,
                            offsetY: mousePos.y - panel.imageY
                        };
                        break; // Stop after finding the top-most panel
                    }
                }
            }
        });

            figureCanvasContainer.addEventListener('mouseup', (e) => {
            // Cancel any pending animation frames and timeouts
            if (state.panUpdateRAF) {
                cancelAnimationFrame(state.panUpdateRAF);
                state.panUpdateRAF = null;
            }
            if (state.dragUpdateRAF) {
                cancelAnimationFrame(state.dragUpdateRAF);
                state.dragUpdateRAF = null;
            }
            if (state.resizeUpdateRAF) {
                cancelAnimationFrame(state.resizeUpdateRAF);
                state.resizeUpdateRAF = null;
            }
            if (state.dragPreviewUpdateTimeout) {
                clearTimeout(state.dragPreviewUpdateTimeout);
                state.dragPreviewUpdateTimeout = null;
            }
            
            if (state.isPanning && e.button === 1) {
                state.isPanning = false;
                figureCanvasContainer.style.cursor = 'default';
            } else if (state.isPanelDraggingCustom || state.isPanelResizingCustom) {
                // Handle custom layout interactions
                if (state.isPanelDraggingCustom || state.isPanelResizingCustom) {
                    console.log('🎯 Custom layout change detected - calling saveState()');
                    console.log('📊 Panel positions before save:', {
                        selectedPanel: state.selectedPanelCustom ? {
                            id: state.selectedPanelCustom.id,
                            label: state.selectedPanelCustom.label,
                            customX: state.selectedPanelCustom.customX,
                            customY: state.selectedPanelCustom.customY,
                            customWidth: state.selectedPanelCustom.customWidth,
                            customHeight: state.selectedPanelCustom.customHeight
                        } : null
                    });
                    if (!state.isRestoringState) {
                        saveState();
                    }
                    // Force preview update after custom layout change
                    updateMiniPreview(true);
                }
                state.isPanelDraggingCustom = false;
                state.isPanelResizingCustom = false;
                state.activeResizeHandleType = null;
                state.resizeStartPanelBounds = null;
                figureCanvasContainer.style.cursor = 'default';
            } else if (state.isDragging) {
                // Simplified drag-to-reorder logic for non-custom layouts
                const activeFigure = state.project.figures[state.activeFigureIndex];
                if (!activeFigure) return;

                const oldOrder = state.draggedPanel.order;
                // Use the swapTargetOrder calculated during mousemove
                let newOrder = state.swapTargetOrder !== null ? state.swapTargetOrder : oldOrder;

                // If there's a potential swap target, we swap the orders.
                if (state.potentialSwapTarget) {
                    const draggedPanel = state.draggedPanel;
                    const targetPanel = state.potentialSwapTarget;

                    // Swap the order
                    const tempOrder = draggedPanel.order;
                    draggedPanel.order = targetPanel.order;
                    targetPanel.order = tempOrder;

                    // Sort the panels array based on the new order
                    activeFigure.panels.sort((a, b) => a.order - b.order);

                    // Re-assign order and labels to all panels to ensure consistency
                    activeFigure.panels.forEach((panel, idx) => {
                        panel.order = idx;
                        if (activeFigure.settings.labelStyle !== 'custom') {
                            panel.label = String.fromCharCode(65 + idx);
                        }
                    });

                    console.log('🎯 Drag-to-reorder change detected - calling saveState()');
                    if (!state.isRestoringState) {
                        saveState();
                    }
                }

                // Reset dragging state
                state.isDragging = false;
                state.draggedPanel = null;
                state.potentialSwapTarget = null;
                state.swapTargetOrder = null;
                figureCanvasContainer.style.cursor = 'default';

                // Re-render the figure with the new order
                renderFigure();
                updateAuxiliaryUI();
                updateMiniPreview(true);
                    } else {
                state.potentialDragPanel = null;
                state.mouseDownPos = null;
                // Clear swap target state if dragging was cancelled
                if (state.isDragging) {
                    state.potentialSwapTarget = null;
                    state.swapTargetOrder = null;
                    state.isDragging = false;
                    state.draggedPanel = null;
                }
            }
    });

        figureCanvasContainer.addEventListener('mousemove', (e) => {
            const mousePos = getMousePos(ui.figureCanvas, e);
            const activeFigure = state.project.figures[state.activeFigureIndex];

            if (state.isPanning) {
                state.canvasPanX = e.clientX - state.panStartX;
                window.canvasPanX = state.canvasPanX;
                state.canvasPanY = e.clientY - state.panStartY;
                window.canvasPanY = state.canvasPanY;
                restoreContainerOverflow();
                
                // Use requestAnimationFrame for smoother panning
                if (!state.panUpdateRAF) {
                    state.panUpdateRAF = requestAnimationFrame(() => {
                        renderFigure();
                        state.panUpdateRAF = null;
                    });
                }
            } else if (activeFigure && activeFigure.settings.layout === 'custom') {
                // Handle custom layout interactions
                if (state.isPanelResizingCustom && state.selectedPanelCustom && state.activeResizeHandleType) {
                    const deltaX = mousePos.x - state.dragStartMouseX;
                    const deltaY = mousePos.y - state.dragStartMouseY;
                    const maintainAspectRatio = e.shiftKey;

                    let newBounds = { ...state.resizeStartPanelBounds };

                    switch (state.activeResizeHandleType) {
                        case 'nw':
                            newBounds.x = state.resizeStartPanelBounds.x + deltaX;
                            newBounds.y = state.resizeStartPanelBounds.y + deltaY;
                            newBounds.width = state.resizeStartPanelBounds.width - deltaX;
                            newBounds.height = state.resizeStartPanelBounds.height - deltaY;
                            break;
                        case 'ne':
                            newBounds.y = state.resizeStartPanelBounds.y + deltaY;
                            newBounds.width = state.resizeStartPanelBounds.width + deltaX;
                            newBounds.height = state.resizeStartPanelBounds.height - deltaY;
                            break;
                        case 'sw':
                            newBounds.x = state.resizeStartPanelBounds.x + deltaX;
                            newBounds.width = state.resizeStartPanelBounds.width - deltaX;
                            newBounds.height = state.resizeStartPanelBounds.height + deltaY;
                            break;
                        case 'se':
                            newBounds.width = state.resizeStartPanelBounds.width + deltaX;
                            newBounds.height = state.resizeStartPanelBounds.height + deltaY;
                            break;
                    }

                    // Maintain aspect ratio if shift is held
                    if (maintainAspectRatio && state.selectedPanelCustom.originalWidth && state.selectedPanelCustom.originalHeight) {
                        const aspectRatio = state.selectedPanelCustom.originalWidth / state.selectedPanelCustom.originalHeight;
                        if (Math.abs(deltaX) > Math.abs(deltaY)) {
                            newBounds.height = newBounds.width / aspectRatio;
                        } else {
                            newBounds.width = newBounds.height * aspectRatio;
                        }
                    }

                    // Apply snapping
                    const snapLines = getSnapPositions(activeFigure.panels, state.selectedPanelCustom);
                    newBounds.x = findNearestSnap(snapToGrid(newBounds.x), snapLines);
                    newBounds.y = findNearestSnap(snapToGrid(newBounds.y), snapLines);
                    newBounds.width = snapToGrid(Math.max(20, newBounds.width));
                    newBounds.height = snapToGrid(Math.max(20, newBounds.height));

                    // Update panel
                    state.selectedPanelCustom.customX = newBounds.x;
                    state.selectedPanelCustom.customY = newBounds.y;
                    state.selectedPanelCustom.customWidth = newBounds.width;
                    state.selectedPanelCustom.customHeight = newBounds.height;

                    // Use requestAnimationFrame for smoother resizing
                    if (!state.resizeUpdateRAF) {
                        state.resizeUpdateRAF = requestAnimationFrame(() => {
                            renderFigure();
                            state.resizeUpdateRAF = null;
                        });
                    }
                } else if (state.isPanelDraggingCustom && state.selectedPanelCustom) {
                    // Use offset-based positioning (like original drag logic)
                    let newX = mousePos.x - state.dragStartX;
                    let newY = mousePos.y - state.dragStartY;

                    // Apply snapping
                    const snapLines = getSnapPositions(activeFigure.panels, state.selectedPanelCustom);
                    newX = findNearestSnap(snapToGrid(newX), snapLines);
                    newY = findNearestSnap(snapToGrid(newY), snapLines);

                    state.selectedPanelCustom.customX = newX;
                    state.selectedPanelCustom.customY = newY;

                    // Use requestAnimationFrame for smoother dragging
                    if (!state.dragUpdateRAF) {
                        state.dragUpdateRAF = requestAnimationFrame(() => {
                            renderFigure();
                            // Only update preview occasionally during drag for better performance
                            if (!state.dragPreviewUpdateTimeout) {
                                state.dragPreviewUpdateTimeout = setTimeout(() => {
                                    updateMiniPreview(true);
                                    state.dragPreviewUpdateTimeout = null;
                                }, 100); // Update preview every 100ms during drag
                            }
                            state.dragUpdateRAF = null;
                        });
                    }
                } else {
                    // Update cursor based on what's under mouse
                    let cursor = 'default';
                    if (state.selectedPanelCustom) {
                        const handleType = getResizeHandle(mousePos, state.selectedPanelCustom);
                        if (handleType) {
                            cursor = handleType + '-resize';
                        } else if (isMouseOverPanel(mousePos, state.selectedPanelCustom)) {
                            cursor = 'move';
                        }
                    } else {
                        for (const panel of activeFigure.panels) {
                            if (isMouseOverPanel(mousePos, panel)) {
                                cursor = 'pointer';
                                break;
                            }
                        }
                    }
                    figureCanvasContainer.style.cursor = cursor;
                }
            } else if (state.isDragging) {
                // Original dragging logic for non-custom layouts
                const mousePos = getMousePos(ui.figureCanvas, e);
                state.draggedPanel.imageX = mousePos.x - state.dragStartX;
                state.draggedPanel.imageY = mousePos.y - state.dragStartY;
                
                // Detect potential swap target using visual boundaries
                const draggedPanelBounds = getPanelVisualBounds(state.draggedPanel);
                const dropRect = {
                    x: mousePos.x - state.dragStartX,
                    y: mousePos.y - state.dragStartY,
                    width: draggedPanelBounds.width,
                    height: draggedPanelBounds.height
                };

                const activeFigure = state.project.figures[state.activeFigureIndex];
                const panelsForReorder = activeFigure.panels.filter(p => p.id !== state.draggedPanel.id);
                panelsForReorder.sort((a,b) => a.order - b.order);

                let newPotentialSwapTarget = null;
                let newSwapTargetOrder = null;

                // Find which panel the dragged panel would be dropped on using visual boundaries
                for (let i = 0; i < panelsForReorder.length; i++) {
                    const targetPanel = panelsForReorder[i];
                    const targetBounds = getPanelVisualBounds(targetPanel);
                    
                    if (dropRect.x < targetBounds.x + targetBounds.width &&
                        dropRect.x + dropRect.width > targetBounds.x &&
                        dropRect.y < targetBounds.y + targetBounds.height &&
                        dropRect.y + dropRect.height > targetBounds.y) {
                        newPotentialSwapTarget = targetPanel;
                        
                        newPotentialSwapTarget = targetPanel;
                        break;
                    }
                }

                // Update swap target state
                if (newPotentialSwapTarget !== state.potentialSwapTarget) {
                    state.potentialSwapTarget = newPotentialSwapTarget;
                    state.swapTargetOrder = newSwapTargetOrder;
                }
                
                // Use requestAnimationFrame for smoother dragging
                if (!state.dragUpdateRAF) {
                    state.dragUpdateRAF = requestAnimationFrame(() => {
                        renderFigure();
                        state.dragUpdateRAF = null;
                    });
                }
            } else {
                // Original hover logic for non-custom layouts
                let hovering = false;
                if(state.project.figures && state.project.figures[state.activeFigureIndex]) {
                    for (const panel of state.project.figures[state.activeFigureIndex].panels) {
                        if (isMouseOverPanel(mousePos, panel)) { hovering = true; break; }
                    }
                }
                figureCanvasContainer.style.cursor = hovering ? 'grab' : 'default';

                // Check if drag threshold is reached and start dragging
                if (state.potentialDragPanel && state.mouseDownPos) {
                    const distance = Math.sqrt(
                        Math.pow(e.clientX - state.mouseDownPos.x, 2) +
                        Math.pow(e.clientY - state.mouseDownPos.y, 2)
                    );

                    if (distance > DRAG_THRESHOLD) {
                        state.isDragging = true;
                        state.draggedPanel = state.potentialDragPanel.panel;
                        state.dragStartX = state.potentialDragPanel.offsetX;
                        state.dragStartY = state.potentialDragPanel.offsetY;
                        state.potentialSwapTarget = null; // Clear any previous swap target
                        state.swapTargetOrder = null;
                        figureCanvasContainer.style.cursor = 'grabbing';
                        state.potentialDragPanel = null;
                        state.mouseDownPos = null;
                    }
                }
            }
        });
    }
}