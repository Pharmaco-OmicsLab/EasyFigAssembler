// app/static/js/svgExport.js
import { renderFigure } from './canvas.js';
import { generateEditedImage } from './editModal.js';
import { state } from './state.js';

/**
 * Convert RGB color string to hex format for SVG
 */
function colorToHex(color) {
    if (color.startsWith('#')) return color;
    if (color.startsWith('rgb')) {
        const matches = color.match(/\d+/g);
        if (matches && matches.length >= 3) {
            const r = parseInt(matches[0]).toString(16).padStart(2, '0');
            const g = parseInt(matches[1]).toString(16).padStart(2, '0');
            const b = parseInt(matches[2]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
    }
    return '#000000'; // Default to black
}

/**
 * Convert arrow annotation to SVG path
 */
function arrowToSVGPath(x1, y1, x2, y2, headlen = 10) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    
    // Main line
    let path = `M ${x1} ${y1} L ${x2} ${y2} `;
    
    // Arrow head
    const headX1 = x2 - headlen * Math.cos(angle - Math.PI / 6);
    const headY1 = y2 - headlen * Math.sin(angle - Math.PI / 6);
    const headX2 = x2 - headlen * Math.cos(angle + Math.PI / 6);
    const headY2 = y2 - headlen * Math.sin(angle + Math.PI / 6);
    
    path += `M ${x2} ${y2} L ${headX1} ${headY1} `;
    path += `M ${x2} ${y2} L ${headX2} ${headY2}`;
    
    return path;
}

/**
 * Transform annotation coordinates from original image space to final figure space
 * This accounts for: crop, scale, rotation, and panel position
 */
function transformAnnotationCoords(annotation, panel, panelImageX, panelImageY, panelDisplayWidth, panelDisplayHeight) {
    const edits = panel.edits;
    const crop = edits.crop || { x: 0, y: 0, width: panel.originalWidth, height: panel.originalHeight };
    
    // Get the processed image dimensions (after crop and scale)
    // We need to know the actual processed image size
    // For now, we'll use the display dimensions as a proxy
    // The actual scale factor depends on how generateEditedImage processed it
    
    // Calculate scale factors
    // The processed image is cropped and scaled to fit displayWidth x displayHeight
    const cropWidth = crop.width || panel.originalWidth;
    const cropHeight = crop.height || panel.originalHeight;
    
    // Scale from original to display size
    const scaleX = panelDisplayWidth / cropWidth;
    const scaleY = panelDisplayHeight / cropHeight;
    
    // Transform coordinates: subtract crop offset, then scale
    let x1, y1, x2, y2, x, y;
    
    if (annotation.type === 'rect' || annotation.type === 'arrow') {
        x1 = (annotation.x1 - crop.x) * scaleX + panelImageX;
        y1 = (annotation.y1 - crop.y) * scaleY + panelImageY;
        x2 = (annotation.x2 - crop.x) * scaleX + panelImageX;
        y2 = (annotation.y2 - crop.y) * scaleY + panelImageY;
        
        // Apply rotation if needed
        if (edits.rotation && edits.rotation !== 0) {
            const centerX = panelImageX + panelDisplayWidth / 2;
            const centerY = panelImageY + panelDisplayHeight / 2;
            const angle = (edits.rotation * Math.PI) / 180;
            
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            // Rotate around center
            const relX1 = x1 - centerX;
            const relY1 = y1 - centerY;
            const relX2 = x2 - centerX;
            const relY2 = y2 - centerY;
            
            x1 = centerX + relX1 * cos - relY1 * sin;
            y1 = centerY + relX1 * sin + relY1 * cos;
            x2 = centerX + relX2 * cos - relY2 * sin;
            y2 = centerY + relX2 * sin + relY2 * cos;
        }
        
        return { x1, y1, x2, y2 };
    } else if (annotation.type === 'text') {
        x = (annotation.x - crop.x) * scaleX + panelImageX;
        y = (annotation.y - crop.y) * scaleY + panelImageY;
        
        // Apply rotation if needed
        if (edits.rotation && edits.rotation !== 0) {
            const centerX = panelImageX + panelDisplayWidth / 2;
            const centerY = panelImageY + panelDisplayHeight / 2;
            const angle = (edits.rotation * Math.PI) / 180;
            
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            const relX = x - centerX;
            const relY = y - centerY;
            
            x = centerX + relX * cos - relY * sin;
            y = centerY + relX * sin + relY * cos;
        }
        
        return { x, y };
    }
    
    return null;
}

/**
 * Generate SVG for a single annotation
 */
function annotationToSVG(annotation, panel, panelImageX, panelImageY, panelDisplayWidth, panelDisplayHeight) {
    const coords = transformAnnotationCoords(annotation, panel, panelImageX, panelImageY, panelDisplayWidth, panelDisplayHeight);
    if (!coords) return '';
    
    const color = colorToHex(annotation.color || '#000000');
    const lineWidth = annotation.lineWidth || 2;
    
    switch (annotation.type) {
        case 'rect':
            return `<rect x="${Math.min(coords.x1, coords.x2)}" 
                          y="${Math.min(coords.y1, coords.y2)}" 
                          width="${Math.abs(coords.x2 - coords.x1)}" 
                          height="${Math.abs(coords.y2 - coords.y1)}" 
                          fill="none" 
                          stroke="${color}" 
                          stroke-width="${lineWidth}"/>`;
        
        case 'arrow':
            const path = arrowToSVGPath(coords.x1, coords.y1, coords.x2, coords.y2);
            return `<path d="${path}" 
                          fill="none" 
                          stroke="${color}" 
                          stroke-width="${lineWidth}" 
                          stroke-linecap="round"/>`;
        
        case 'text':
            const fontFamily = annotation.fontFamily || 'Arial';
            const fontWeight = annotation.fontWeight || 'normal';
            const fontStyle = annotation.fontStyle || 'normal';
            const fontSize = annotation.size || 16;
            
            // Calculate font size scaling based on panel scale
            const scaleFactor = Math.min(
                panelDisplayWidth / (panel.originalWidth || 1),
                panelDisplayHeight / (panel.originalHeight || 1)
            );
            const scaledFontSize = fontSize * scaleFactor;
            
            return `<text x="${coords.x}" 
                          y="${coords.y}" 
                          font-family="${fontFamily}" 
                          font-size="${scaledFontSize}" 
                          font-weight="${fontWeight}" 
                          font-style="${fontStyle}" 
                          fill="${color}">${escapeXml(annotation.text || '')}</text>`;
        
        default:
            return '';
    }
}

/**
 * Escape XML special characters
 */
function escapeXml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Process panel image and return as data URL
 * This applies all edits (brightness, contrast, greyscale, rotation, crop)
 */
async function processPanelImageForSVG(panel) {
    // Use the existing generateEditedImage function
    // We'll use scale=1 for SVG (we want the actual processed image, not scaled)
    const processedCanvas = await generateEditedImage(panel.pristineSrc, panel.edits, 1);
    
    // Convert canvas to data URL
    if (processedCanvas instanceof HTMLCanvasElement) {
        return processedCanvas.toDataURL('image/png');
    } else if (typeof processedCanvas === 'string') {
        // Legacy support - already a data URL
        return processedCanvas;
    }
    
    // Fallback to pristine source
    return panel.pristineSrc;
}

/**
 * Main function to export figure as SVG
 */
export async function exportToSVG() {
    if (state.activeFigureIndex === -1) {
        throw new Error('No active figure');
    }
    
    const activeFigure = state.project.figures[state.activeFigureIndex];
    const settings = activeFigure.settings;
    
    if (!activeFigure.panels || activeFigure.panels.length === 0) {
        throw new Error('No panels to export');
    }
    
    // First, render the figure to calculate all positions
    // This ensures panel.imageX, panel.imageY, panel.labelX, panel.labelY are set
    await renderFigure(true); // skipCentering = true
    
    // Get dimensions from the canvas
    const canvas = document.getElementById('figure-canvas');
    if (!canvas) {
        throw new Error('Figure canvas not found');
    }
    
    const svgWidth = canvas.width;
    const svgHeight = canvas.height;
    
    // Sort panels by order
    const sortedPanels = [...activeFigure.panels].sort((a, b) => a.order - b.order);
    
    // Start building SVG
    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" 
                 xmlns:xlink="http://www.w3.org/1999/xlink"
                 width="${svgWidth}" 
                 height="${svgHeight}" 
                 viewBox="0 0 ${svgWidth} ${svgHeight}">\n`;
    
    // White background
    svg += `  <rect width="${svgWidth}" height="${svgHeight}" fill="white"/>\n`;
    
    // Process each panel
    for (const panel of sortedPanels) {
        // Process the panel image (apply edits)
        const imageDataUrl = await processPanelImageForSVG(panel);
        
        // Embed the processed image
        svg += `  <image x="${panel.imageX}" 
                          y="${panel.imageY}" 
                          width="${panel.displayWidth}" 
                          height="${panel.displayHeight}" 
                          href="${imageDataUrl}"/>\n`;
        
        // Add annotations as vector elements
        if (panel.edits && panel.edits.annotations && panel.edits.annotations.length > 0) {
            for (const annotation of panel.edits.annotations) {
                const annotationSVG = annotationToSVG(
                    annotation,
                    panel,
                    panel.imageX,
                    panel.imageY,
                    panel.displayWidth,
                    panel.displayHeight
                );
                if (annotationSVG) {
                    svg += `  ${annotationSVG}\n`;
                }
            }
        }
        
        // Add text label
        let labelText = panel.label;
        if (settings.labelStyle !== 'custom') {
            if (settings.labelStyle === 'ABC_paren') labelText += ')';
            else if (settings.labelStyle === 'ABC_period') labelText += '.';
            else if (settings.labelStyle === 'abc') labelText = labelText.toLowerCase();
        }
        
        const fontSize = settings.labelFontSize * state.PT_TO_PX;
        svg += `  <text x="${panel.labelX}" 
                         y="${panel.labelY}" 
                         font-family="${settings.labelFontFamily}" 
                         font-size="${fontSize}" 
                         font-weight="${settings.labelFontWeight}" 
                         fill="black">${escapeXml(labelText)}</text>\n`;
    }
    
    svg += `</svg>`;
    
    return svg;
}

/**
 * Download SVG as file
 */
export async function downloadSVG() {
    try {
        const svgContent = await exportToSVG();
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'figure.svg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error('SVG export failed:', error);
        throw error;
    }
}