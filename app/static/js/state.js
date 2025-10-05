// --- GLOBAL STATE MANAGEMENT ---
export const state = {
    // Project and figure state
    project: {},
    activeFigureIndex: -1,
    allJournalRules: {},

    // Constants
    PIXELS_PER_MM: 3.78,
    INCHES_PER_MM: 0.0393701,
    PT_TO_PX: 1.33,
    MIN_CANVAS_WIDTH_MM: 80, // Minimum reasonable width for visual display
    JOURNAL_SCALE_FACTOR: 1.2, // Scale factor to make narrow journals more readable

    // Drag and drop state
    isDragging: false,
    draggedPanel: null,
    dragStartX: 0,
    dragStartY: 0,

    // History state
    historyStack: [],
    redoStack: [],

    // Edit Modal State
    isEditModalOpen: false,
    currentlyEditingPanel: null,
    editImage: new Image(),
    cropBox: null,
    isCropping: false,
    cropInteractionMode: null, // 'new-crop', 'move', 'nw-resize', etc.
    cropStartPos: null, // Mouse position when crop interaction started
    cropStartBox: null, // Initial cropBox state when resize/move started

    // FIX: Add coordinate transformation properties for annotations
    editModalCoordinateTransform: {
        scaleX: 1.0, // Scale factor from original image to edit modal
        scaleY: 1.0,
        offsetX: 0,  // Offset from original image to edit modal
        offsetY: 0
    },

    // Annotation State
    activeAnnotationTool: 'crop', // Default to crop
    isDrawingAnnotation: false,
    currentAnnotation: null,
    selectedAnnotation: null, // Index of the currently selected annotation
    isDraggingAnnotation: false, // Whether an existing annotation is being dragged
    annotationDragStart: null, // Mouse position when annotation drag started

    // Zoom State (for main canvas)
    currentZoom: 1.0,
    ZOOM_STEP: 0.1,
    MAX_ZOOM: 3.0,
    MIN_ZOOM: 0.5,

    // Container Size State
    containerSizeMode: 'auto', // 'auto', 'small', 'medium', 'large', 'custom'
    customContainerWidth: 800,
    customContainerHeight: 600,
    isZooming: false, // Flag to track zoom operations

    // Edit Preview State
    isEditPreviewDragging: false,
    editPreviewDragOffset: { x: 0, y: 0 },

    // Annotation history state (for modal-specific undo/redo)
    annotationHistoryStack: [],
    annotationRedoStack: [],

    // Panel list drag state
    draggedPanelIndex: null,
    contextMenuTargetPanel: null,

    // Export format selection state
    selectedExportFormat: null,
    selectedRating: null,

    // Canvas Pan State (for main canvas)
    canvasPanX: 0,
    canvasPanY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,

    // Custom Layout State
    isPanelDraggingCustom: false,
    isPanelResizingCustom: false,
    selectedPanelCustom: null,
    activeResizeHandleType: null,
    dragStartMouseX: 0,
    dragStartMouseY: 0,
    resizeStartPanelBounds: null,
    SNAP_GRID_SIZE: 10,
    SNAP_TOLERANCE: 8,

    // FIX: Add missing timeout and scheduling variables that were local
    qualityCheckTimeout: null,
    globalPreviewUpdateTimeout: null,
    isPreviewUpdateScheduled: false,
    lastUpdateHash: null,
    resizeTimeout: null,
    lastResizeHash: null,
    renderTimeout: null,
    
    // Animation frame IDs for smooth drag operations
    panUpdateRAF: null,
    dragUpdateRAF: null,
    resizeUpdateRAF: null,
    dragPreviewUpdateTimeout: null,

    // FIX: Add edit modal UI state variables
    lastPanelWidth: 350, // Default "open" width for edit modal
    isResizing: false, // For edit modal resize handle
    previewUpdateRAF: null, // RequestAnimationFrame ID for preview updates

    // FIX: Add UI state variables
    isRestoringState: false, // Flag to prevent saving state during undo/redo operations
    isSwitchingFigure: false, // Flag to prevent saving state during figure switching

    // FIX: Add missing drag-related variables
    potentialDragPanel: null, // Panel being considered for dragging
    mouseDownPos: null, // Mouse position when mouse down occurred
    
    // Panel swap visual feedback state
    potentialSwapTarget: null, // Panel that would be swapped with dragged panel
    swapTargetOrder: null // The order position where the swap would occur
};
