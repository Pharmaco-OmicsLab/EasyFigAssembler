// --- FIGURE AND PANEL MANAGEMENT MODULE ---
import {
    redrawCanvasOnly,
    renderFigure
} from './canvas.js';
import { openEditModal } from './editModal.js';
import {
    getCurrentState,
    initializeHistoryButtons,
    saveState,
    updateHistoryButtons
} from './history.js';
import { state } from './state.js';
import * as ui from './ui.js';
import { darkenColor } from './utils.js';
import { updateGridControlsState, updateJournalInfoDisplay } from './view.js';

// --- FIGURE MANAGEMENT FUNCTIONS ---

/**
 * Render the figure tabs in the UI
 */
export function renderTabs() {
    ui.figureTabsContainer.innerHTML = '';
    if (!state.project.figures) return;
    
    state.project.figures.forEach((fig, index) => {
        const tab = document.createElement('div');
        tab.className = 'figure-tab';
        tab.dataset.index = index;
        
        const tabLabel = document.createElement('span');
        tabLabel.textContent = `Figure ${index + 1}`;
        tab.appendChild(tabLabel);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-tab-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = `Delete Figure ${index + 1}`;
        deleteBtn.dataset.index = index;
        tab.appendChild(deleteBtn);
        
        if (index === state.activeFigureIndex) {
            tab.classList.add('active');
        }
        
        ui.figureTabsContainer.appendChild(tab);
    });
}

/**
 * Add a new figure to the project
 */
export function addFigure() {
    const newFigureNumber = state.project.figures.length + 1;
    state.project.figures.push({
        name: `Figure ${newFigureNumber}`,
        panels: [],
        caption: '',
        settings: {
            journal: 'Default', 
            layout: 'auto', 
            targetWidth: 180, 
            spacing: '10',
            labelStyle: 'ABC', 
            labelPosition: 'top', 
            labelFontFamily: 'Arial',
            labelFontSize: '12', 
            labelFontWeight: 'bold', 
            exportDpi: '600', 
            exportDpiCustom: '',
            maintainAspectRatio: true, 
            labelSpacing: 0,
            // Grid control settings with proper defaults
            showGrid: false, 
            showPanelGrid: false,
            showLabelGrid: false,
            gridColor: '#000000', 
            gridType: 'dashed', 
            gridThickness: 1
        }
    });
    
    switchFigure(state.project.figures.length - 1, false); // Don't save history when switching to empty figure
    initializeHistoryButtons();
    
    // Save state when adding a new figure so undo can work
    if (!state.isRestoringState) {
        saveState();
    }
    
    // Fit to page by default for new figures
    setTimeout(() => {
        if (window.fitToPage) {
            window.fitToPage();
        }
    }, 100);
}

/**
 * Delete a figure from the project
 */
export function deleteFigure(indexToDelete) {
    if (state.project.figures.length <= 1) {
        // Show confirmation dialog for deleting the last figure
        showDeleteLastFigureDialog(indexToDelete);
        return;
    }
    
    state.project.figures.splice(indexToDelete, 1);
    if (state.activeFigureIndex >= indexToDelete) {
        state.activeFigureIndex = Math.max(0, state.activeFigureIndex - 1);
    }
    switchFigure(state.activeFigureIndex, false);
    if (!state.isRestoringState) {
        saveState();
    }
}

/**
 * Show dialog for deleting the last figure
 */
function showDeleteLastFigureDialog(indexToDelete) {
    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'delete-last-figure-modal';
    modal.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>Delete Last Figure</h3>
                <p>This will delete the last figure and reset the workspace. Do you want to save the project first?</p>
                <div class="modal-buttons">
                    <button id="save-and-delete-btn" class="btn-primary">Yes, Save First</button>
                    <button id="delete-without-save-btn" class="btn-secondary">No, Don't Save</button>
                    <button id="cancel-delete-btn" class="btn-cancel">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    document.getElementById('save-and-delete-btn').addEventListener('click', () => {
        // Trigger save project
        const projectState = getCurrentState();
        const projectJson = JSON.stringify(projectState, null, 2);
        const blob = new Blob([projectJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'figure-assembler-project.json';
        link.click();
        URL.revokeObjectURL(url);

        // Then reset workspace
        resetWorkspace();
        document.body.removeChild(modal);
    });

    document.getElementById('delete-without-save-btn').addEventListener('click', () => {
        resetWorkspace();
        document.body.removeChild(modal);
    });

    document.getElementById('cancel-delete-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // Close on overlay click
    modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
        if (e.target === modal.querySelector('.modal-overlay')) {
            document.body.removeChild(modal);
        }
    });
}

/**
 * Reset the workspace to a new project state
 */
function resetWorkspace() {
    // Reset to a completely new project state
    state.project = { figures: [] };
    state.activeFigureIndex = -1;
    state.historyStack = [];
    state.redoStack = [];

    // Reset zoom and pan
    state.currentZoom = 1.0;
    state.canvasPanX = 0;
    state.canvasPanY = 0;

    // Reset canvas
    ui.figureCanvas.width = 0;
    ui.figureCanvas.height = 0;
    ui.figureCanvas.style.transform = '';

    // Add new blank figure
    addFigure();

    // Update UI
    renderTabs();
    renderFigure();
    updateAuxiliaryUI();
    initializeHistoryButtons();
}

/**
 * Switch to a different figure
 */
export function switchFigure(index, saveHistory = true) {
    if (saveHistory && !state.isRestoringState && state.activeFigureIndex !== -1 && state.activeFigureIndex < state.project.figures.length) {
        saveState();
    }

    state.isSwitchingFigure = true;

    // Reset custom layout state when switching figures
    state.selectedPanelCustom = null;
    state.isPanelDraggingCustom = false;
    state.isPanelResizingCustom = false;
    state.activeResizeHandleType = null;

    state.activeFigureIndex = index;
    const activeFigure = state.project.figures[state.activeFigureIndex];
    
    if (activeFigure) {
        ui.journalSelect.value = activeFigure.settings.journal;
        ui.labelStyleSelect.value = activeFigure.settings.labelStyle;
        ui.labelPositionSelect.value = activeFigure.settings.labelPosition;
        ui.labelFontFamilySelect.value = activeFigure.settings.labelFontFamily;
        ui.labelFontSizeInput.value = activeFigure.settings.labelFontSize;
        ui.labelFontWeightSelect.value = activeFigure.settings.labelFontWeight;
        ui.targetWidthInput.value = activeFigure.settings.targetWidth || '';
        ui.exportDpiSelect.value = activeFigure.settings.exportDpi;
        ui.exportDpiCustom.value = activeFigure.settings.exportDpiCustom;
        ui.exportDpiCustom.style.display = ui.exportDpiSelect.value === 'custom' ? 'inline-block' : 'none';
        ui.maintainAspectRatioCheckbox.checked = activeFigure.settings.maintainAspectRatio;
        ui.figureCaptionEditor.value = activeFigure.caption || '';

        // Update spacing controls
        const currentSpacing = parseInt(activeFigure.settings.spacing) || 10;
        if (ui.spacingSlider) {
            ui.spacingSlider.value = currentSpacing;
            // Update slider progress for visual fill
            const progress = (currentSpacing / 50) * 100;
            ui.spacingSlider.style.setProperty('--slider-progress', progress + '%');
        }
        if (ui.spacingNumber) ui.spacingNumber.value = currentSpacing;
        if (ui.spacingDecrease) ui.spacingDecrease.disabled = currentSpacing <= 0;
        if (ui.spacingIncrease) ui.spacingIncrease.disabled = currentSpacing >= 50;
        if (ui.spacingPreview) ui.spacingPreview.style.setProperty('--current-spacing', currentSpacing + 'px');
        if (ui.spacingCurrentDisplay) ui.spacingCurrentDisplay.textContent = currentSpacing + 'px';

        // Update label spacing controls
        const currentLabelSpacing = parseInt(activeFigure.settings.labelSpacing) || 0;
        if (ui.labelSpacingNumber) ui.labelSpacingNumber.value = currentLabelSpacing;
        if (ui.labelSpacingValue) ui.labelSpacingValue.textContent = currentLabelSpacing;
        if (ui.labelSpacingDecrease) ui.labelSpacingDecrease.disabled = currentLabelSpacing <= 0;
        if (ui.labelSpacingIncrease) ui.labelSpacingIncrease.disabled = currentLabelSpacing >= 30;

        // Update grid controls with proper error handling and hierarchical state management
        if (ui.showGridCheckbox) {
            // Ensure grid settings exist with defaults
            if (!activeFigure.settings.hasOwnProperty('showGrid')) {
                activeFigure.settings.showGrid = false;
            }
            const isGridEnabled = activeFigure.settings.showGrid === true;
            ui.showGridCheckbox.checked = isGridEnabled;
            updateGridControlsState(isGridEnabled);
        }
        if (ui.showPanelGridCheckbox) {
            // Set default if not present
            if (!activeFigure.settings.hasOwnProperty('showPanelGrid')) {
                activeFigure.settings.showPanelGrid = false;
            }
            ui.showPanelGridCheckbox.checked = activeFigure.settings.showPanelGrid === true;
        }
        if (ui.showLabelGridCheckbox) {
            // Set default if not present
            if (!activeFigure.settings.hasOwnProperty('showLabelGrid')) {
                activeFigure.settings.showLabelGrid = false;
            }
            ui.showLabelGridCheckbox.checked = activeFigure.settings.showLabelGrid === true;
        }
        if (ui.gridTypeSelect) {
            ui.gridTypeSelect.value = activeFigure.settings.gridType || 'dashed';
        }
        if (ui.gridThicknessInput) {
            ui.gridThicknessInput.value = activeFigure.settings.gridThickness || 1;
        }
        if (ui.gridColorInput) {
            ui.gridColorInput.value = activeFigure.settings.gridColor || '#000000';
        }

        updateJournalInfoDisplay();
        updateAuxiliaryUI();
        updateLayoutButtonSelection(activeFigure.settings.layout);
        renderFigure();

        // Force grid redraw to ensure grid is visible if enabled
        setTimeout(() => {
            if (activeFigure.settings.showGrid) {
                redrawCanvasOnly();
            }
        }, 100);
    }
    renderTabs();
    state.isSwitchingFigure = false;
}

// --- PANEL MANAGEMENT FUNCTIONS ---

/**
 * Update the panel list display
 */
export function updatePanelList() {
    if (!ui.panelListContainer || state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex]) {
        if (ui.panelListContainer) ui.panelListContainer.innerHTML = '';
        return;
    }

    const activeFigure = state.project.figures[state.activeFigureIndex];
    const sortedPanels = [...activeFigure.panels].sort((a,b) => a.order - b.order);

    ui.panelListContainer.innerHTML = '';

    sortedPanels.forEach((panel, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'panel-list-item';
        listItem.draggable = true;
        listItem.dataset.panelId = panel.id;
        listItem.dataset.panelIndex = index;

        listItem.innerHTML = `
            <div class="panel-info">
                <canvas class="panel-thumbnail" width="24" height="24"></canvas>
                <span class="panel-label">${panel.label}</span>
            </div>
            <div class="panel-actions">
                <button class="panel-edit-btn btn-3d-edit" data-panel-id="${panel.id}" title="Edit panel">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="panel-delete-btn" data-panel-id="${panel.id}" title="Delete panel">×</button>
                <span class="panel-drag-handle material-symbols-outlined">drag_indicator</span>
            </div>
        `;

        // Draw thumbnail
        const thumbnail = listItem.querySelector('.panel-thumbnail');
        const thumbCtx = thumbnail.getContext('2d');
        const scale = Math.min(24 / panel.originalWidth, 24 / panel.originalHeight);
        const w = panel.originalWidth * scale;
        const h = panel.originalHeight * scale;
        thumbCtx.drawImage(panel.image, (24-w)/2, (24-h)/2, w, h);

        // Add edit button listener
        const editBtn = listItem.querySelector('.panel-edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(panel);
        });

        // Add delete button listener
        const deleteBtn = listItem.querySelector('.panel-delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete panel ${panel.label}?`)) {
                deletePanelById(panel.id);
            }
        });

        ui.panelListContainer.appendChild(listItem);
    });

    attachPanelListListeners();
}

/**
 * Delete a panel by its ID
 */
function deletePanelById(panelId) {
    if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex]) return;

    const activeFigure = state.project.figures[state.activeFigureIndex];
    const panelIndex = activeFigure.panels.findIndex(p => p.id === panelId);

    if (panelIndex !== -1) {
        activeFigure.panels.splice(panelIndex, 1);
        // Re-label remaining panels
        activeFigure.panels.forEach((panel, index) => {
            panel.order = index;
            if (activeFigure.settings.labelStyle !== 'custom') {
                panel.label = String.fromCharCode(65 + index);
            }
        });
        if (!state.isRestoringState) {
            saveState();
        }
        updateAuxiliaryUI();
        renderFigure();
    }
}

/**
 * Attach drag and drop listeners to panel list items
 */
function attachPanelListListeners() {
    const listItems = ui.panelListContainer.querySelectorAll('.panel-list-item');

    listItems.forEach(item => {
        item.addEventListener('dragstart', handlePanelDragStart);
        item.addEventListener('dragover', handlePanelDragOver);
        item.addEventListener('dragleave', handlePanelDragLeave);
        item.addEventListener('drop', handlePanelDrop);
        item.addEventListener('dragend', handlePanelDragEnd);
    });
}

/**
 * Handle panel drag start event
 */
function handlePanelDragStart(e) {
    state.draggedPanelIndex = parseInt(e.target.dataset.panelIndex);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

/**
 * Handle panel drag over event
 */
function handlePanelDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.target.classList.add('drag-over');
}

/**
 * Handle panel drag leave event
 */
function handlePanelDragLeave(e) {
    e.target.classList.remove('drag-over');
}

/**
 * Handle panel drop event
 */
function handlePanelDrop(e) {
    e.preventDefault();
    e.target.classList.remove('drag-over');

    const targetIndex = parseInt(e.target.dataset.panelIndex);

    if (state.draggedPanelIndex !== null && targetIndex !== state.draggedPanelIndex) {
        reorderPanels(state.draggedPanelIndex, targetIndex);
    }
}

/**
 * Handle panel drag end event
 */
function handlePanelDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.panel-list-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    state.draggedPanelIndex = null;
}

/**
 * Reorder panels and update labels
 */
function reorderPanels(fromIndex, toIndex) {
    if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex]) return;

    const activeFigure = state.project.figures[state.activeFigureIndex];
    const sortedPanels = [...activeFigure.panels].sort((a,b) => a.order - b.order);

    // Move panel
    const movedPanel = sortedPanels.splice(fromIndex, 1)[0];
    sortedPanels.splice(toIndex, 0, movedPanel);

    // Update order and labels
    sortedPanels.forEach((panel, index) => {
        panel.order = index;
        // Only update labels if not using custom labels or if panel doesn't have custom text
        if (activeFigure.settings.labelStyle !== 'custom') {
            panel.label = String.fromCharCode(65 + index); // A, B, C...
        }
    });

    if (!state.isRestoringState) {
        saveState();
    }
    updateAuxiliaryUI();
    renderFigure();
}

// --- CONTEXT MENU FUNCTIONS ---

/**
 * Show the context menu for a panel
 */
export function showContextMenu(x, y, panel) {
    state.contextMenuTargetPanel = panel;
    ui.panelContextMenu.style.left = x + 'px';
    ui.panelContextMenu.style.top = y + 'px';
    ui.panelContextMenu.style.display = 'block';
}

/**
 * Hide the context menu
 */
export function hideContextMenu() {
    ui.panelContextMenu.style.display = 'none';
    state.contextMenuTargetPanel = null;
}

/**
 * Handle context menu actions
 */
export function handleContextMenuAction(action) {
    if (!state.contextMenuTargetPanel || state.activeFigureIndex === -1) return;

    const activeFigure = state.project.figures[state.activeFigureIndex];
    const panelIndex = activeFigure.panels.findIndex(p => p.id === state.contextMenuTargetPanel.id);

    switch (action) {
        case 'edit':
            openEditModal(state.contextMenuTargetPanel);
            break;
        case 'delete':
            if (confirm(`Delete panel ${state.contextMenuTargetPanel.label}?`)) {
                activeFigure.panels.splice(panelIndex, 1);
                // Re-label remaining panels
                activeFigure.panels.forEach((panel, index) => {
                    panel.order = index;
                    if (activeFigure.settings.labelStyle !== 'custom') {
                        panel.label = String.fromCharCode(65 + index);
                    }
                });
                if (!state.isRestoringState) {
                    saveState();
                }
                updateAuxiliaryUI();
                renderFigure();
            }
            break;
        case 'bring-front':
            state.contextMenuTargetPanel.order = activeFigure.panels.length - 1;
            reorderPanelsByOrder();
            break;
        case 'send-back':
            state.contextMenuTargetPanel.order = 0;
            reorderPanelsByOrder();
            break;
    }
    hideContextMenu();
}

/**
 * Reorder panels by their order property
 */
function reorderPanelsByOrder() {
    if (state.activeFigureIndex === -1) return;
    const activeFigure = state.project.figures[state.activeFigureIndex];

    // Sort by order and reassign sequential orders
    activeFigure.panels.sort((a, b) => a.order - b.order);
    activeFigure.panels.forEach((panel, index) => {
        panel.order = index;
        if (activeFigure.settings.labelStyle !== 'custom') {
            panel.label = String.fromCharCode(65 + index);
        }
    });

    if (!state.isRestoringState) {
        saveState();
    }
    updateAuxiliaryUI();
    renderFigure();
}

// --- HELPER FUNCTIONS ---

// Import updateGridControlsState from view.js

// Import updateJournalInfoDisplay from view.js

/**
 * Update layout button selection
 */
export function updateLayoutButtonSelection(selectedLayoutType) {
    // Remove selected class from all layout buttons
    const allLayoutButtons = document.querySelectorAll('.layout-btn');
    allLayoutButtons.forEach(btn => {
        btn.classList.remove('selected');
    });

    // Find and select the appropriate button
    let targetButton = null;
    if (selectedLayoutType === 'auto') {
        // For auto layout, select the Smart Layout button
        targetButton = document.querySelector('.layout-btn[data-layout="auto"]');
    } else {
        // For other layouts, find the matching button
        targetButton = document.querySelector(`.layout-btn[data-layout="${selectedLayoutType}"]`);
    }

    if (targetButton) {
        targetButton.classList.add('selected');
    }
}

/**
 * Update auxiliary UI elements
 */
export function updateAuxiliaryUI() {
    if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex]) return;
    
    const activeFigure = state.project.figures[state.activeFigureIndex];

    if (ui.customLabelsContainer) {
        ui.customLabelsContainer.style.display = activeFigure.settings.labelStyle === 'custom' ? 'block' : 'none';
        ui.customLabelsContainer.innerHTML = '';

        // Clear individual export container content
        const individualExportContent = ui.individualExportContainer?.querySelector('.card-content');
        if (individualExportContent) {
            individualExportContent.innerHTML = '';
        }

        const sortedPanels = [...activeFigure.panels].sort((a,b) => a.order - b.order);
        if (sortedPanels.length > 0) {
            ui.individualExportContainer?.classList.add('has-content');
            ui.individualExportContainer?.classList.remove('hidden');
        } else {
            ui.individualExportContainer?.classList.remove('has-content');
            ui.individualExportContainer?.classList.add('hidden');
        }

        // Update panel list
        updatePanelList();

        const panelColors = ['#007bff', '#28a745', '#17a2b8', '#fd7e14', '#6f42c1', '#dc3545'];
        sortedPanels.forEach((panel, index) => {
            const input = document.createElement('input');
            input.type = 'text';
            // FIX: If labelStyle is not custom, update the label when reordering
            if (activeFigure.settings.labelStyle !== 'custom') {
                panel.label = String.fromCharCode(65 + index); // Re-label based on sorted order
            }
            input.value = panel.label;
            input.title = `Custom label for panel in position ${panel.order + 1}`;
            input.addEventListener('change', () => {
                if (!state.isRestoringState) {
                    saveState();
                }
            });
            input.addEventListener('input', (e) => {
                panel.label = e.target.value;
                renderFigure();
                const exportBtn = document.querySelector(`button[data-panel-id="${panel.id}"]`);
                if (exportBtn) { 
                    exportBtn.textContent = `Download Panel ${panel.label}`; 
                }
            });
            ui.customLabelsContainer.appendChild(input);

            const button = document.createElement('button');
            button.className = 'individual-export-btn';
            button.dataset.panelId = panel.id;
            button.textContent = `Download Panel ${panel.label}`;
            const color = panelColors[index % panelColors.length];
            button.style.backgroundColor = color;
            button.addEventListener('mouseover', () => button.style.backgroundColor = darkenColor(color, 20));
            button.addEventListener('mouseout', () => button.style.backgroundColor = color);
            button.addEventListener('click', () => {
                const link = document.createElement('a');
                link.href = panel.originalSrc;
                const extension = panel.originalFileType.split('/')[1];
                link.download = `Panel_${panel.label}.${extension}`;
                link.click();
            });
            const individualExportContent = ui.individualExportContainer?.querySelector('.card-content');
            if (individualExportContent) {
                individualExportContent.appendChild(button);
            }
        });
    }
}

// --- PROJECT INITIALIZATION FUNCTIONS ---

/**
 * Populate journal selector with available journal rules
 */
export function populateJournalSelector() {
    ui.journalSelect.innerHTML = '';
    
    // Safety check: ensure allJournalRules is loaded
    if (!state.allJournalRules) {
        console.warn('Journal rules not yet loaded, skipping journal selector population');
        return;
    }
    
    for (const journalName in state.allJournalRules) {
        const option = document.createElement('option');
        option.value = journalName;
        option.textContent = journalName;
        ui.journalSelect.appendChild(option);
    }
}

/**
 * Initialize a new project with default state
 */
export function initializeNewProject() {
    state.project = { figures: [] };
    state.activeFigureIndex = -1;
    state.historyStack = [];
    state.redoStack = [];
    initializeHistoryButtons();
    addFigure();
    
    // Save the initial state to history stack so undo can work properly
    // This ensures there's always at least one state to undo from
    setTimeout(() => {
        if (state.project.figures.length > 0) {
            const initialState = getCurrentState();
            state.historyStack.push(initialState);
            console.log('💾 Initial project state saved to history stack');
            updateHistoryButtons();
        }
    }, 100);
}

// Make switchFigure and renderTabs available globally for other modules
window.switchFigure = switchFigure;
window.renderTabs = renderTabs; 