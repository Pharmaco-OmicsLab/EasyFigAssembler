import { state } from './state.js';

// --- 4. LAYOUT ALGORITHMS ---
export function layoutVerticalStack(panels, options) {
    let currentY = options.spacing;
    const labelWidth = options.labelWidth || 0;
    const labelHeight = options.labelHeight || 0;
    const labelSpacing = options.labelSpacing || 0;

    panels.forEach(panel => {
        // Calculate frame dimensions first
        let frameWidth = panel.displayWidth;
        let frameHeight = panel.displayHeight;

        if (options.labelPosition === 'left') {
            frameWidth += labelWidth + labelSpacing;
        } else if (options.labelPosition === 'top') {
            frameHeight += labelHeight + labelSpacing;
        }

        // Define frame position and dimensions
        panel.frameX = options.spacing;
        panel.frameY = currentY;
        panel.frameWidth = frameWidth;
        panel.frameHeight = frameHeight;

        // Calculate image area within frame
        if (options.labelPosition === 'left') {
            panel.imageAreaX = panel.frameX + labelWidth + labelSpacing;
            panel.imageAreaY = panel.frameY;
            panel.imageAreaWidth = panel.frameWidth - (labelWidth + labelSpacing);
            panel.imageAreaHeight = panel.frameHeight;
        } else if (options.labelPosition === 'top') {
            panel.imageAreaX = panel.frameX;
            panel.imageAreaY = panel.frameY + labelHeight + labelSpacing;
            panel.imageAreaWidth = panel.frameWidth;
            panel.imageAreaHeight = panel.frameHeight - (labelHeight + labelSpacing);
        } else {
            panel.imageAreaX = panel.frameX;
            panel.imageAreaY = panel.frameY;
            panel.imageAreaWidth = panel.frameWidth;
            panel.imageAreaHeight = panel.frameHeight;
        }

        // Use true original dimensions if available (for high-DPI exports)
        const originalWidth = panel.trueOriginalWidth || panel.originalWidth;
        const originalHeight = panel.trueOriginalHeight || panel.originalHeight;
        
        // Scale image using object-fit: contain logic
        const scaleX = panel.imageAreaWidth / originalWidth;
        const scaleY = panel.imageAreaHeight / originalHeight;
        const scale = Math.min(scaleX, scaleY);

        panel.displayWidth = originalWidth * scale;
        panel.displayHeight = originalHeight * scale;

        // Center image within its area
        panel.imageX = panel.imageAreaX + (panel.imageAreaWidth - panel.displayWidth) / 2;
        panel.imageY = panel.imageAreaY + (panel.imageAreaHeight - panel.displayHeight) / 2;

        // Position label at top-left of frame
        if (options.labelPosition === 'left') {
            panel.labelX = panel.imageAreaX - labelWidth - labelSpacing;
            panel.labelY = panel.imageAreaY;
        } else if (options.labelPosition === 'top') {
            panel.labelX = panel.frameX;
            panel.labelY = panel.frameY;
        } else {
            panel.labelX = panel.frameX;
            panel.labelY = panel.frameY - 20; // Position label above panel
        }

        // Move to next frame position
        currentY += frameHeight + options.spacing;
    });

    // Calculate total width based on frame width
    const totalFrameWidth = panels.length > 0 ? panels[0].frameWidth : 0;
    const totalWidth = totalFrameWidth + (2 * options.spacing);

    return { width: totalWidth, height: currentY };
}

export function layoutSpanningGrid(panels, numCols, options) {

    if (panels.length === 0) return { width: 0, height: 0 };

    // Only use custom positions if the user has explicitly chosen custom layout
    // Don't auto-switch based on customX/customY values as they may be set by grid layouts
    const shouldUseCustomLayout = options.useCustomLayout === true;

    if (shouldUseCustomLayout) {
        console.log('🔧 Using custom positions for grid layout');
        return layoutCustom(panels, options);
    }

    const gridMap = []; // 2D array to track occupied cells
    let maxRow = 0;
    const labelWidth = options.labelWidth || 0;
    const labelHeight = options.labelHeight || 0;
    const labelSpacing = options.labelSpacing || 0;

    // Calculate frame width for each column
    console.log(`layoutSpanningGrid: baseCanvasWidth=${options.baseCanvasWidth}, spacing=${options.spacing}, numCols=${numCols}`);
    let frameWidthPerCol = (options.baseCanvasWidth - (options.spacing * (numCols + 1))) / numCols;
    console.log(`layoutSpanningGrid: frameWidthPerCol=${frameWidthPerCol}`);
    
    // Safety check: ensure frameWidthPerCol is reasonable
    if (frameWidthPerCol <= 0 || frameWidthPerCol > 10000) {
        console.warn(`Invalid frameWidthPerCol: ${frameWidthPerCol}, using fallback calculation`);
        // Fallback: use a reasonable width based on typical panel dimensions
        frameWidthPerCol = Math.min(800, options.baseCanvasWidth / numCols);
    }

    // Place panels in grid
    panels.forEach(panel => {
        const span = panel.edits.layoutSpan || { colspan: 1, rowspan: 1 };
        const colspan = Math.max(1, Math.min(span.colspan || 1, numCols));
        const rowspan = Math.max(1, span.rowspan || 1);


        let placed = false;
        let r = 0, c = 0;

        // Find the next available empty cell
        while (!placed) {
            if (!gridMap[r]) gridMap[r] = [];
            if (!gridMap[r][c]) {
                // Check if the panel can fit here without overlapping
                let canFit = true;
                for (let i = 0; i < rowspan && canFit; i++) {
                    for (let j = 0; j < colspan && canFit; j++) {
                        if (c + j >= numCols) { 
                            canFit = false; 
                            break; 
                        }
                        if (!gridMap[r + i]) gridMap[r + i] = [];
                        if (gridMap[r + i][c + j]) {
                            canFit = false; 
                            break;
                        }
                    }
                }

                if (canFit) {
                    // Place the panel and mark cells as occupied
                    panel.gridPos = { r, c, colspan, rowspan };

                    for (let i = 0; i < rowspan; i++) {
                        if (!gridMap[r + i]) gridMap[r + i] = [];
                        for (let j = 0; j < colspan; j++) {
                            gridMap[r + i][c + j] = panel.id;
                        }
                    }
                    maxRow = Math.max(maxRow, r + rowspan);
                    placed = true;
                }
            }
            // Move to next cell
            c++;
            if (c >= numCols) { c = 0; r++; }

            // Safety check to prevent infinite loop
            if (r > 100) {
                console.error('Grid placement failed for panel', panel.id);
                panel.gridPos = { r: 0, c: 0, colspan: 1, rowspan: 1 };
                placed = true;
            }
        }
    });

    // Calculate theoretical row heights first
    const rowHeights = new Array(maxRow).fill(0);
    panels.forEach(panel => {
        if (!panel.gridPos) return;

        const { r, colspan, rowspan } = panel.gridPos;

        // Calculate spanned frame dimensions
        const spannedFrameWidth = (frameWidthPerCol * colspan) + (options.spacing * (colspan - 1));

        // Calculate image area within spanned frame
        let imageAreaWidth = spannedFrameWidth;
        let imageAreaHeight = Infinity; // Will be constrained later

        if (options.labelPosition === 'left') {
            imageAreaWidth = spannedFrameWidth - labelWidth - labelSpacing;
        }

        // Use true original dimensions if available (for high-DPI exports)
        const originalWidth = panel.trueOriginalWidth || panel.originalWidth;
        const originalHeight = panel.trueOriginalHeight || panel.originalHeight;
        
        // Debug: Log scaling calculations for high-DPI exports
        if (originalWidth !== panel.originalWidth) {
            console.log(`Panel ${panel.label}: High-DPI scaling - originalWidth=${panel.originalWidth}, trueOriginalWidth=${originalWidth}, imageAreaWidth=${imageAreaWidth}`);
        }
        
        // Scale image using object-fit: contain logic
        const scaleX = imageAreaWidth / originalWidth;
        const scaleY = imageAreaHeight !== Infinity ? imageAreaHeight / originalHeight : scaleX;
        const scale = Math.min(scaleX, scaleY);

        panel.displayWidth = originalWidth * scale;
        panel.displayHeight = originalHeight * scale;
        
        // Safety check: ensure display dimensions are reasonable
        if (panel.displayWidth <= 0 || panel.displayHeight <= 0 || 
            panel.displayWidth > 10000 || panel.displayHeight > 10000) {
            console.warn(`Panel ${panel.label}: Invalid display dimensions ${panel.displayWidth}x${panel.displayHeight}, using fallback`);
            // Fallback: use a reasonable size
            const fallbackSize = Math.min(200, frameWidthPerCol);
            panel.displayWidth = fallbackSize;
            panel.displayHeight = fallbackSize * (originalHeight / originalWidth);
        }

        // Calculate total frame height (image + label area)
        let theoreticalFrameHeight = panel.displayHeight;
        if (options.labelPosition === 'top') {
            theoreticalFrameHeight += labelHeight + labelSpacing;
        }

        // Distribute frame height across spanned rows
        const heightPerSpannedRow = theoreticalFrameHeight / rowspan;
        for (let i = 0; i < rowspan; i++) {
            if (r + i < rowHeights.length) {
                rowHeights[r + i] = Math.max(rowHeights[r + i], heightPerSpannedRow);
            }
        }
    });

    // Calculate final row positions
    let totalHeight = options.spacing;
    const rowYPositions = [options.spacing];
    rowHeights.forEach(h => {
        totalHeight += h + options.spacing;
        rowYPositions.push(totalHeight);
    });

    // Position panels with frame-based logic
    panels.forEach(panel => {
        if (!panel.gridPos) return;

        const { r, c, colspan, rowspan } = panel.gridPos;

        // Define frame boundaries
        panel.frameX = options.spacing + c * (frameWidthPerCol + options.spacing);
        panel.frameY = rowYPositions[r];
        panel.frameWidth = (frameWidthPerCol * colspan) + (options.spacing * (colspan - 1));
        panel.frameHeight = (rowYPositions[r + rowspan] || rowYPositions[rowYPositions.length - 1]) - panel.frameY - options.spacing;

        // Calculate image area within frame
        if (options.labelPosition === 'left') {
            panel.imageAreaX = panel.frameX + labelWidth + labelSpacing;
            panel.imageAreaY = panel.frameY;
            panel.imageAreaWidth = panel.frameWidth - (labelWidth + labelSpacing);
            panel.imageAreaHeight = panel.frameHeight;
        } else if (options.labelPosition === 'top') {
            panel.imageAreaX = panel.frameX;
            panel.imageAreaY = panel.frameY + labelHeight + labelSpacing;
            panel.imageAreaWidth = panel.frameWidth;
            panel.imageAreaHeight = panel.frameHeight - (labelHeight + labelSpacing);
        } else {
            panel.imageAreaX = panel.frameX;
            panel.imageAreaY = panel.frameY;
            panel.imageAreaWidth = panel.frameWidth;
            panel.imageAreaHeight = panel.frameHeight;
        }

        // Use true original dimensions if available (for high-DPI exports)
        const originalWidth = panel.trueOriginalWidth || panel.originalWidth;
        const originalHeight = panel.trueOriginalHeight || panel.originalHeight;
        
        // Re-scale image to fit final image area using object-fit: contain
        const scaleX = panel.imageAreaWidth / originalWidth;
        const scaleY = panel.imageAreaHeight / originalHeight;
        const finalScale = Math.min(scaleX, scaleY);

        panel.displayWidth = originalWidth * finalScale;
        panel.displayHeight = originalHeight * finalScale;
        
        // Safety check: ensure display dimensions are reasonable
        if (panel.displayWidth <= 0 || panel.displayHeight <= 0 || 
            panel.displayWidth > 10000 || panel.displayHeight > 10000) {
            console.warn(`Panel ${panel.label}: Invalid final display dimensions ${panel.displayWidth}x${panel.displayHeight}, using fallback`);
            // Fallback: use a reasonable size
            const fallbackSize = Math.min(200, panel.imageAreaWidth);
            panel.displayWidth = fallbackSize;
            panel.displayHeight = fallbackSize * (originalHeight / originalWidth);
        }

        // Center image within its area
        panel.imageX = panel.imageAreaX + (panel.imageAreaWidth - panel.displayWidth) / 2;
        panel.imageY = panel.imageAreaY + (panel.imageAreaHeight - panel.displayHeight) / 2;


        // Position label at top-left of frame
        if (options.labelPosition === 'left') {
            panel.labelX = panel.imageAreaX - labelWidth - labelSpacing;
            panel.labelY = panel.imageAreaY;
        } else if (options.labelPosition === 'top') {
            panel.labelX = panel.frameX;
            panel.labelY = panel.frameY;
        } else {
            panel.labelX = panel.frameX;
            panel.labelY = panel.frameY - 20; // Position label above panel
        }
    });

    return { width: options.baseCanvasWidth, height: totalHeight };
}

export function layoutCustom(panels, options) {
    if (panels.length === 0) return { width: 800, height: 600 };

    const labelWidth = options.labelWidth || 0;
    const labelHeight = options.labelHeight || 0;
    const labelSpacing = options.labelSpacing || 0;

    // Initialize custom properties for new panels
    panels.forEach((panel, index) => {
        if (panel.customX === undefined || panel.customY === undefined) {
            panel.customX = index * 220;
            panel.customY = index * 220;
        }
        if (panel.customWidth === undefined || panel.customHeight === undefined) {
            const aspectRatio = panel.originalWidth / panel.originalHeight;
            panel.customWidth = 200;
            panel.customHeight = 200 / aspectRatio;
        }

        // Define frame using custom coordinates (frame includes label area)
        panel.frameX = panel.customX;
        panel.frameY = panel.customY;

        // Calculate frame dimensions to include label area
        if (options.labelPosition === 'left') {
            panel.frameWidth = panel.customWidth + labelWidth + labelSpacing;
            panel.frameHeight = panel.customHeight;
        } else if (options.labelPosition === 'top') {
            panel.frameWidth = panel.customWidth;
            panel.frameHeight = panel.customHeight + labelHeight + labelSpacing;
        } else {
            panel.frameWidth = panel.customWidth;
            panel.frameHeight = panel.customHeight;
        }

        // Calculate image area within frame
        if (options.labelPosition === 'left') {
            panel.imageAreaX = panel.frameX + labelWidth + labelSpacing;
            panel.imageAreaY = panel.frameY;
            panel.imageAreaWidth = panel.customWidth;
            panel.imageAreaHeight = panel.customHeight;
        } else if (options.labelPosition === 'top') {
            panel.imageAreaX = panel.frameX;
            panel.imageAreaY = panel.frameY + labelHeight + labelSpacing;
            panel.imageAreaWidth = panel.customWidth;
            panel.imageAreaHeight = panel.customHeight;
        } else {
            panel.imageAreaX = panel.frameX;
            panel.imageAreaY = panel.frameY;
            panel.imageAreaWidth = panel.customWidth;
            panel.imageAreaHeight = panel.customHeight;
        }

        // Use true original dimensions if available (for high-DPI exports)
        const originalWidth = panel.trueOriginalWidth || panel.originalWidth;
        const originalHeight = panel.trueOriginalHeight || panel.originalHeight;
        
        // Scale image using object-fit: contain logic
        const scaleX = panel.imageAreaWidth / originalWidth;
        const scaleY = panel.imageAreaHeight / originalHeight;
        const scale = Math.min(scaleX, scaleY);

        panel.displayWidth = originalWidth * scale;
        panel.displayHeight = originalHeight * scale;

        // Center image within its area
        panel.imageX = panel.imageAreaX + (panel.imageAreaWidth - panel.displayWidth) / 2;
        panel.imageY = panel.imageAreaY + (panel.imageAreaHeight - panel.displayHeight) / 2;

        // Position label at top-left of frame
        if (options.labelPosition === 'left') {
            panel.labelX = panel.imageAreaX - labelWidth - labelSpacing;
            panel.labelY = panel.imageAreaY;
        } else if (options.labelPosition === 'top') {
            panel.labelX = panel.frameX;
            panel.labelY = panel.frameY;
        } else {
            panel.labelX = panel.frameX;
            panel.labelY = panel.frameY - 20; // Position label above panel
        }
    });

    // Calculate canvas dimensions based on frame boundaries
    let maxX = 800;
    let maxY = 600;
    panels.forEach(panel => {
        maxX = Math.max(maxX, panel.frameX + panel.frameWidth + 50);
        maxY = Math.max(maxY, panel.frameY + panel.frameHeight + 50);
    });

    return { width: maxX, height: maxY };
}

// Add this new function for layout preference scoring
export function getLayoutPreferenceScore(layoutType, numCols, panelCount, canvasWidth) {
    let score = 0;

    // Base preferences for common panel counts
    if (panelCount === 1) {
        if (layoutType === 'stack') score += 100;
        if (layoutType === 'grid2x2' || layoutType === 'grid3x3' || layoutType === 'grid4xn') score -= 50; // Penalize wider grids for single panel
    } else if (panelCount === 2) {
        if (layoutType === 'stack') score += 80;
        if (layoutType === 'grid2x2' && numCols === 2) score += 90; // Strongly prefer 2 columns for 2 panels
        if (layoutType === 'grid3x3' || layoutType === 'grid4xn') score -= 40; // Penalize wider grids
    } else if (panelCount === 3) {
        if (layoutType === 'stack') score += 70;
        if (layoutType === 'grid3x3' && numCols === 3) score += 95; // Strongly prefer 3 columns for 3 panels
        if (layoutType === 'grid2x2') score += 60; // 2x2 with one below is okay
        if (layoutType === 'grid4xn') score -= 30;
    } else if (panelCount === 4) {
        if (layoutType === 'grid2x2' && numCols === 2) score += 100; // Optimal for 4 panels
        if (layoutType === 'grid4xn' && numCols === 4) score += 80; // Good for 4 panels
        if (layoutType === 'stack') score += 50;
        if (layoutType === 'grid3x3') score -= 10; // Less ideal for 4 panels
    } else if (panelCount >= 5 && panelCount <= 6) {
        if (layoutType === 'grid3x3' && numCols === 3) score += 90; // Good for 5-6 panels
        if (layoutType === 'grid2x2' && numCols === 2) score += 70;
        if (layoutType === 'grid4xn' && numCols === 4) score += 50;
    } else if (panelCount >= 7 && panelCount <= 9) {
        if (layoutType === 'grid3x3' && numCols === 3) score += 80;
        if (layoutType === 'grid4xn' && numCols === 4) score += 90; // Often better for more panels
    } else if (panelCount >= 10 && panelCount <= 12) {
        if (layoutType === 'grid4xn' && numCols === 4) score += 85;
        if (layoutType === 'grid3x3' && numCols === 3) score += 70;
    } else if (panelCount > 12) {
        if (layoutType === 'grid4xn' && numCols === 4) score += 80;
        if (layoutType === 'grid3x3' && numCols === 3) score += 60;
    }

    // Penalize layouts that are too wide or too tall
    // These values are based on an ideal aesthetic, adjust as needed.
    const aspectRatio = canvasWidth / 800; // Assuming ~800px is a reference width for visual comparison
    if (numCols > panelCount && panelCount > 1) { // Penalize excessively wide grids for few panels
        score -= (numCols - panelCount) * 10;
    }

    return score;
}

// Helper function to assign intelligent spans based on panel aspect ratios
export function assignIntelligentSpans(panels, numCols) {
    if (numCols <= 1) return; // No spanning for single column layouts

    // Reset all spans to default first
    panels.forEach(panel => {
        panel.edits.layoutSpan = { colspan: 1, rowspan: 1 };
    });

    // Only apply intelligent spanning for layouts with more panels where it makes sense
    // For 4 panels or fewer, keep clean grid layout without spanning
    if (panels.length <= 4) {
        return; // No spanning for 4 panels or fewer
    }

    // Apply intelligent spanning only for 5+ panels
    panels.forEach((panel, index) => {
        const aspectRatio = panel.originalWidth / panel.originalHeight;

        // For the first panel (Panel A), make it 2x2 if we have enough columns and panels
        if (index === 0 && numCols >= 2 && panels.length >= 5) {
            panel.edits.layoutSpan = { colspan: Math.min(2, numCols), rowspan: 2 };
        }
        // For wide panels (aspect ratio > 1.8), span 2 columns if possible
        else if (aspectRatio > 1.8 && numCols >= 2) {
            panel.edits.layoutSpan = { colspan: Math.min(2, numCols), rowspan: 1 };
        }
        // For very tall panels (aspect ratio < 0.6), span 2 rows if it's a grid layout
        else if (aspectRatio < 0.6 && numCols >= 2) {
            panel.edits.layoutSpan = { colspan: 1, rowspan: 2 };
        }

        // Default case remains 1x1
    });
}

export async function selectSmartLayout(panels, settings, journalRules) {
    if (!panels || panels.length === 0) {
        return { panels: [], effectiveLayout: 'stack' };
    }

    // Define candidate numCols values to test
    const candidateNumCols = [1, 2, 3, 4];
    const candidateLayouts = [];

    // Prepare layout options similar to renderFigure
    const spacing = parseInt(settings.spacing);
    const font = `${settings.labelFontWeight} ${settings.labelFontSize * state.PT_TO_PX}px ${settings.labelFontFamily}`;

    // Create temporary context for text metrics
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = font;
    const textMetrics = tempCtx.measureText('A');
    const labelHeight = (textMetrics.fontBoundingBoxAscent || (settings.labelFontSize * state.PT_TO_PX)) * 1.2;
    const labelWidth = textMetrics.width * 2;

    const layoutOptions = {
        spacing: spacing,
        labelPosition: settings.labelPosition,
        labelWidth: labelWidth,
        labelHeight: labelHeight,
        maintainAspectRatio: settings.maintainAspectRatio
    };

    // Calculate canvas width with improved logic for visual consistency
    let baseCanvasWidthMM = settings.targetWidth !== null ? settings.targetWidth : journalRules.doubleColumnWidth_mm;

    // Apply minimum width constraint and scaling for narrow journals
    if (settings.targetWidth === null) { // Only apply to journal-preset widths, not custom widths
        if (baseCanvasWidthMM < state.MIN_CANVAS_WIDTH_MM) {
            // For very narrow journals like Science, scale up for better visual experience
            baseCanvasWidthMM = Math.max(state.MIN_CANVAS_WIDTH_MM, baseCanvasWidthMM * state.JOURNAL_SCALE_FACTOR);
        }
    }

    const baseCanvasWidthPx = baseCanvasWidthMM * state.PIXELS_PER_MM;

    // Simulate layouts and collect metrics
    for (const numCols of candidateNumCols) {
        // Create deep copy of panels for simulation
        const panelsCopyForSimulation = JSON.parse(JSON.stringify(panels));

        // Restore image references (JSON.stringify loses them)
        panelsCopyForSimulation.forEach((panel, index) => {
            panel.image = panels[index].image;
        });

        // Determine effective layout type
        let effectiveLayoutType;
        if (numCols === 1) {
            effectiveLayoutType = 'stack';
        } else if (numCols === 2) {
            effectiveLayoutType = 'grid2x2';
        } else if (numCols === 3) {
            effectiveLayoutType = 'grid3x3';
        } else if (numCols === 4) {
            effectiveLayoutType = 'grid4xn';
        }

        // Apply intelligent spanning for grid layouts
        if (effectiveLayoutType.startsWith('grid')) {
            assignIntelligentSpans(panelsCopyForSimulation, numCols);
        }

        // Calculate panel sizing for this layout
        let canvasWidthForSizing = baseCanvasWidthPx;
        let panelAreaWidth, colWidth;

        if (effectiveLayoutType.startsWith('grid')) {
            panelAreaWidth = canvasWidthForSizing - ((numCols + 1) * spacing);
            colWidth = panelAreaWidth / numCols;
        } else {
            if (layoutOptions.labelPosition === 'left') {
                canvasWidthForSizing -= (numCols * layoutOptions.labelWidth);
            }
            panelAreaWidth = canvasWidthForSizing - ((numCols + 1) * spacing);
            colWidth = panelAreaWidth / numCols;
        }

        // Set initial panel display dimensions
        panelsCopyForSimulation.forEach(panel => {
            const scale = colWidth / panel.originalWidth;
            panel.displayWidth = colWidth;
            panel.displayHeight = panel.originalHeight * scale;
        });

        // Call appropriate layout function
        let layoutDimensions;
        switch (effectiveLayoutType) {
            case 'stack':
                layoutDimensions = layoutVerticalStack(panelsCopyForSimulation, layoutOptions);
                break;
            case 'grid2x2':
                layoutOptions.baseCanvasWidth = baseCanvasWidthPx;
                layoutDimensions = layoutSpanningGrid(panelsCopyForSimulation, 2, layoutOptions);
                break;
            case 'grid3x3':
                layoutOptions.baseCanvasWidth = baseCanvasWidthPx;
                layoutDimensions = layoutSpanningGrid(panelsCopyForSimulation, 3, layoutOptions);
                break;
            case 'grid4xn':
                layoutOptions.baseCanvasWidth = baseCanvasWidthPx;
                layoutDimensions = layoutSpanningGrid(panelsCopyForSimulation, 4, layoutOptions);
                break;
            default:
                layoutDimensions = layoutVerticalStack(panelsCopyForSimulation, layoutOptions);
                break;
        }

        // Calculate minimum DPI for this layout
        let minDPI = Infinity;
        panelsCopyForSimulation.forEach(panel => {
            const displayWidthInMm = panel.displayWidth / state.PIXELS_PER_MM;
            const displayWidthInInches = displayWidthInMm * state.INCHES_PER_MM;
            const effectiveDpi = panel.originalWidth / displayWidthInInches;
            minDPI = Math.min(minDPI, effectiveDpi);
        });

        // Store candidate result
        candidateLayouts.push({
            layoutType: effectiveLayoutType,
            numCols: numCols,
            width: layoutDimensions.width,
            height: layoutDimensions.height,
            minDPI: minDPI,
            panelsData: panelsCopyForSimulation
        });
    }

    // Selection logic
    const targetWidthPx = baseCanvasWidthPx;

    // Filter by width - first try single column width
    let filteredLayouts = candidateLayouts.filter(layout => layout.width <= targetWidthPx);

    // If no layouts fit single column, try double column if available
    if (filteredLayouts.length === 0 && journalRules.doubleColumnWidth_mm) {
        const doubleColumnWidthPx = journalRules.doubleColumnWidth_mm * state.PIXELS_PER_MM;
        filteredLayouts = candidateLayouts.filter(layout => layout.width <= doubleColumnWidthPx);
    }

    // If still no layouts fit, keep all as fallback
    if (filteredLayouts.length === 0) {
        filteredLayouts = candidateLayouts;
    }

    // Sort candidates by:
    // 1. Highest layout preference score first
    // 2. Then by highest minDPI
    // 3. Then by smallest height
    // 4. Finally by smallest width
    filteredLayouts.sort((a, b) => {
        const scoreA = getLayoutPreferenceScore(a.layoutType, a.numCols, panels.length, a.width); // Pass calculated width
        const scoreB = getLayoutPreferenceScore(b.layoutType, b.numCols, panels.length, b.width); // Pass calculated width

        if (scoreA !== scoreB) return scoreB - scoreA; // Highest score first

        if (b.minDPI !== a.minDPI) return b.minDPI - a.minDPI; // Highest DPI first

        // Penalize layouts that make the canvas excessively tall for the width
        const aspectRatioA = a.width / a.height;
        const aspectRatioB = b.width / b.height;
        // Prefer squarer or slightly wider aspects over very tall ones, unless it's a stack
        if (aspectRatioA > 0.5 && aspectRatioB > 0.5) { // Only apply if not already extremely tall
            if (Math.abs(aspectRatioA - 1) !== Math.abs(aspectRatioB - 1)) {
                return Math.abs(aspectRatioA - 1) - Math.abs(aspectRatioB - 1); // Closer to 1 (square) is better
            }
        }

        if (a.height !== b.height) return a.height - b.height; // Smallest height second

        return a.width - b.width; // Smallest width third
    });

    // Select best layout
    const bestLayout = filteredLayouts[0] || {
        layoutType: 'stack',
        panelsData: panels
    };

    return {
        panels: bestLayout.panelsData,
        effectiveLayout: bestLayout.layoutType,
        report: {
            width: Math.round(bestLayout.width / state.PIXELS_PER_MM), // in mm
            height: Math.round(bestLayout.height / state.PIXELS_PER_MM), // in mm
            minDPI: Math.round(bestLayout.minDPI),
            chosenType: bestLayout.layoutType // e.g., 'grid2x2'
        }
    };
} 