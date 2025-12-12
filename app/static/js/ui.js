// js/ui.js

// DOM element getters - these functions will be called when needed
export function getDpiValidationMessage() {
    return document.getElementById('dpi-validation-message');
}

export function getExportDpiSelect() {
    return document.getElementById('export-dpi-select');
}

export function getExportDpiCustom() {
    return document.getElementById('export-dpi-custom');
}

export function getExportFigureBtn() {
    return document.getElementById('export-figure-btn');
}

// --- 1. GET ALL THE HTML ELEMENTS WE'LL NEED ---
export const uploadArea = document.getElementById('upload-area');
export const fileInput = document.getElementById('file-input');
export const figureCanvas = document.getElementById('figure-canvas');
export const ctx = figureCanvas ? figureCanvas.getContext('2d') : null;

// Sidebar Controls
export const labelStyleSelect = document.getElementById('label-style');
export const labelPositionSelect = document.getElementById('label-position');
export const labelFontFamilySelect = document.getElementById('label-font-family');
export const labelFontSizeInput = document.getElementById('label-font-size');
export const labelFontWeightSelect = document.getElementById('label-font-weight');
export const journalSelect = document.getElementById('journal-select');
export const layoutOptionsContainer = document.getElementById('layout-options');
export const feedbackList = document.getElementById('feedback-list');
export const targetWidthInput = document.getElementById('target-width-input');
export const applyDimensionBtn = document.getElementById('apply-dimension-btn');
export const customLabelsContainer = document.getElementById('custom-labels');
export const exportDpiSelect = document.getElementById('export-dpi-select');
export const exportDpiCustom = document.getElementById('export-dpi-custom');
export const dpiValidationMessage = document.getElementById('dpi-validation-message');
export const individualExportContainer = document.getElementById('individual-export-container');

// New export functionality elements
export const exportFigureBtn = document.getElementById('export-figure-btn');
export const exportOptionCards = document.querySelectorAll('.export-option-card');

// New label spacing elements
export const labelSpacingNumber = document.getElementById('label-spacing-number');
export const labelSpacingDecrease = document.getElementById('label-spacing-decrease');
export const labelSpacingIncrease = document.getElementById('label-spacing-increase');
export const labelSpacingValue = document.getElementById('label-spacing-value');

// Panel Spacing Controls
export const spacingSlider = document.getElementById('spacing-slider');
export const spacingNumber = document.getElementById('spacing-number');
export const spacingDecrease = document.getElementById('spacing-decrease');
export const spacingIncrease = document.getElementById('spacing-increase');
export const spacingReset = document.getElementById('spacing-reset');
export const spacingPreview = document.querySelector('.spacing-preview-inline');
export const spacingPresets = document.querySelectorAll('.preset-btn');
export const spacingCurrentDisplay = document.getElementById('spacing-current-display');

// Global Action Buttons
export const saveProjectBtn = document.getElementById('save-project-btn');
export const loadProjectInput = document.getElementById('load-project-input');
export const undoBtn = document.getElementById('undo-btn');
export const redoBtn = document.getElementById('redo-btn');
export const resetAllBtn = document.getElementById('reset-all-btn');
export const figureTabsContainer = document.getElementById('figure-tabs');
export const addFigureBtn = document.getElementById('add-figure-btn');
export const addPanelsBtn = document.getElementById('add-panels-btn');

// Panel Edit Modal Elements
export const editModal = document.getElementById('edit-modal');
export const editCanvas = document.getElementById('edit-canvas');
export const editCtx = editCanvas ? editCanvas.getContext('2d') : null;
export const brightnessSlider = document.getElementById('brightness-slider');
export const brightnessValue = document.getElementById('brightness-value');
export const contrastSlider = document.getElementById('contrast-slider');
export const contrastValue = document.getElementById('contrast-value');
export const rotateSlider = document.getElementById('rotate-slider');
export const rotateValue = document.getElementById('rotate-value');
export const resetCropBtn = document.getElementById('reset-crop-btn'); // Move reset crop button here.
export const resetBrightnessBtn = document.getElementById('reset-brightness-btn');
export const resetContrastBtn = document.getElementById('reset-contrast-btn');
export const resetRotateBtn = document.getElementById('reset-rotate-btn');
export const cancelEditBtn = document.getElementById('cancel-edit-btn');
export const applyEditBtn = document.getElementById('apply-edit-btn');
export const greyscaleBtn = document.getElementById('greyscale-btn');
export const panelColspanInput = document.getElementById('panel-colspan-input');
export const panelRowspanInput = document.getElementById('panel-rowspan-input');

// Main canvas controls
export const maintainAspectRatioCheckbox = document.getElementById('maintain-aspect-ratio');

// Annotation Elements
export const annotationTools = document.getElementById('annotation-tools');
export const annotationColorInput = document.getElementById('annotation-color');
export const annotationLineWidthInput = document.getElementById('annotation-linewidth');
export const annotationFontSizeInput = document.getElementById('annotation-fontsize');
// NEW: Text annotation specific controls
export const annotationFontFamilySelect = document.getElementById('annotation-font-family'); //
export const annotationBoldBtn = document.getElementById('annotation-bold-btn'); // Assuming these are added in HTML
export const annotationItalicBtn = document.getElementById('annotation-italic-btn'); // Assuming these are added in HTML
export const annotationStylingOptions = document.querySelector('.annotation-options'); // Select the div that contains styling options
export const clearAnnotationsBtn = document.getElementById('clear-annotations-btn');

// NEW: Panel list and context menu elements
export const panelListContainer = document.getElementById('panel-list-container-main');
export const panelContextMenu = document.getElementById('panel-context-menu');
export const figureCaptionEditor = document.getElementById('figure-caption-editor');
export const fitToPageBtn = document.getElementById('fit-to-page-btn');

// NEW: Annotation history elements
export const undoAnnotationBtn = document.getElementById('undo-annotation-btn');
export const redoAnnotationBtn = document.getElementById('redo-annotation-btn');

// NEW: Container size control elements
export const containerSizeSelect = document.getElementById('container-size-select');
export const customSizeControls = document.getElementById('custom-size-controls');
export const customWidthInput = document.getElementById('custom-width-input');
export const customHeightInput = document.getElementById('custom-height-input');
export const applyCustomSizeBtn = document.getElementById('apply-custom-size-btn');

// Additional DOM element constants moved from main.js
export const smartLayoutLoadingModal = document.getElementById('smart-layout-loading-modal');

// Grid control elements
export const showGridCheckbox = document.getElementById('show-grid-checkbox');
export const showPanelGridCheckbox = document.getElementById('show-panel-grid-checkbox');
export const showLabelGridCheckbox = document.getElementById('show-label-grid-checkbox');
export const gridColorInput = document.getElementById('grid-color-input');
export const gridTypeSelect = document.getElementById('grid-type-select');
export const gridThicknessInput = document.getElementById('grid-thickness-input');

// Mini preview elements - removed since element doesn't exist in HTML
// export const miniPreviewCanvas = document.getElementById('mini-preview-canvas');
// export const miniPreviewCtx = miniPreviewCanvas ? miniPreviewCanvas.getContext('2d') : null;

// Floating preview elements
export const floatingPreviewWindow = document.getElementById('floating-preview-window');
export const floatingPreviewCanvas = document.getElementById('floating-preview-canvas');
export const floatingPreviewCtx = floatingPreviewCanvas ? floatingPreviewCanvas.getContext('2d') : null;
export const floatingPreviewHeader = document.getElementById('floating-preview-header');
export const floatingPreviewCloseBtn = document.getElementById('floating-preview-close-btn');
export const floatingPreviewResizeHandle = document.getElementById('floating-preview-resize-handle');
export const livePreviewBtn = document.getElementById('live-preview-btn');

// Edit modal preview elements
export const editModalPreview = document.getElementById('edit-modal-preview');
export const editModalMiniPreviewCanvas = document.getElementById('edit-modal-mini-preview-canvas');
export const editModalMiniPreviewCtx = editModalMiniPreviewCanvas ? editModalMiniPreviewCanvas.getContext('2d') : null;
export const editPreviewToggleBtn = document.getElementById('edit-preview-toggle-btn');

// Feedback modal elements and state
export const feedbackModal = document.getElementById('feedback-modal');
export const feedbackCloseBtn = document.getElementById('feedback-close-btn');
export const feedbackSubmitBtn = document.getElementById('feedback-submit-btn');
export const feedbackText = document.getElementById('feedback-text');
export const emojiButtons = document.querySelectorAll('.emoji-btn');

// Additional DOM elements from main.js
export const editControls = document.getElementById('edit-controls-panel');
export const figureCanvasContainer = document.getElementById('figure-canvas-container');
export const zoomInBtn = document.getElementById('zoom-in-btn');
export const zoomOutBtn = document.getElementById('zoom-out-btn');
export const zoomResetBtn = document.getElementById('zoom-reset-btn');
export const saveCaptionBtn = document.getElementById('save-caption-btn');
export const clearCaptionBtn = document.getElementById('clear-caption-btn');
export const allLayoutButtons = document.querySelectorAll('.layout-btn');
export const gridSubControls = document.getElementById('grid-sub-controls');
export const journalInfoDisplay = document.getElementById('journal-info-display');
export const layoutSpanControls = document.getElementById('layout-span-controls');
export const currentLayoutIndicator = document.getElementById('current-layout-indicator');
export const editControlsPanel = document.getElementById('edit-controls-panel');
export const collapseBtn = document.getElementById('collapse-edit-controls');
export const resizeHandle = document.getElementById('edit-controls-resize-handle');
export const accordionHeaders = document.querySelectorAll('.accordion-header');
export const canvasWrapper = document.getElementById('canvas-wrapper');
export const stickySidebarWrapper = document.getElementById('sticky-sidebar-wrapper');
