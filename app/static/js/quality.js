import { state } from './state.js';
import * as ui from './ui.js';

// --- QUALITY CHECK LOGIC ---
// FIX: Remove local variable and use global state
// let qualityCheckTimeout;

export function runQualityChecks(smartLayoutReport = null) {
    clearTimeout(state.qualityCheckTimeout);
    state.qualityCheckTimeout = setTimeout(() => {
        if (state.activeFigureIndex === -1 || !state.project.figures[state.activeFigureIndex]) return;
        const activeFigure = state.project.figures[state.activeFigureIndex];

        ui.feedbackList.innerHTML = '<li><i>Running quality checks...</i></li>';
        
        // Safety check: ensure allJournalRules is loaded
        if (!state.allJournalRules) {
            ui.feedbackList.innerHTML = '<li class="error">Journal rules not loaded. Please refresh the page.</li>';
            return;
        }
        
        const rules = state.allJournalRules[activeFigure.settings.journal] || state.allJournalRules['Default'];
        const checkPromises = activeFigure.panels.map(panel => getPanelFeedback(panel, rules));

        Promise.all(checkPromises).then(feedbackResults => {
            // Arrays to organize feedback by priority
            const topMessages = [];
            const panelFeedbacks = [];
            const generalGuidance = [];

            // Add smart layout report to top messages if available
            if (activeFigure.settings.layout === 'auto' && smartLayoutReport) {
                topMessages.push(`<li class="info"><strong>(🧠 Smart Layout Chosen: ${smartLayoutReport.chosenType})</strong><br>Figure Size: ${smartLayoutReport.width}x${smartLayoutReport.height}mm | Min Panel DPI: ${smartLayoutReport.minDPI}</li>`);
            }

            // Add text size guide to top messages
            if (rules.font_min_pt) {
                topMessages.push(`<li class="good">(ℹ️ Text Size Guide) Journal recommends text at least ${rules.font_min_pt}pt. Compare to: <span style="font-size: ${rules.font_min_pt}pt; border: 1px solid #ccc; padding: 0 4px;">Sample Text</span></li>`);
            }

            // Group panel feedback with distinct colors
            feedbackResults.forEach((panelFeedback, index) => {
                const colorClass = `panel-color-${index % 6}`; // Cycle through 6 colors
                panelFeedbacks.push(`<div class="panel-feedback-group ${colorClass}">${panelFeedback}</div>`);
            });

            // Add figure width check to general guidance
            const maxAllowedWidth = (activeFigure.settings.targetWidth || rules.doubleColumnWidth_mm) * state.PIXELS_PER_MM;
            if (ui.figureCanvas.width > maxAllowedWidth) {
                generalGuidance.push(`<li class="error">(❌ Figure Too Wide) Current width (${Math.round(ui.figureCanvas.width / state.PIXELS_PER_MM)}mm) exceeds limit of ${Math.round(maxAllowedWidth / state.PIXELS_PER_MM)}mm.</li>`);
            }

            // Add external editing guidance
            generalGuidance.push(`<li class="info">(💡 External Editing Tip) For issues like low resolution or small text within panels, you can: 1) Download individual panels (from "Export Individual Panels" card), 2) Edit their content (e.g., increase font sizes, simplify graphics) in an external image editor, and 3) Re-upload the improved panels to EasyFigAssembler.</li>`);

            // Assemble final HTML in the desired order
            const finalHTML = topMessages.join('') + panelFeedbacks.join('') + generalGuidance.join('');
            ui.feedbackList.innerHTML = finalHTML;
        }).catch(error => {
            console.error('Quality check error:', error);
            ui.feedbackList.innerHTML = '<li class="error">Quality check failed. Please try again.</li>';
        });
    }, 300);
}

async function getPanelFeedback(panel, rules) {
    const requiredDpi = rules.dpi_halftone || 300;
    const displayWidthInMm = panel.displayWidth / state.PIXELS_PER_MM;
    const displayWidthInInches = displayWidthInMm * state.INCHES_PER_MM;
    const displayHeightInInches = panel.displayHeight / state.PIXELS_PER_MM * state.INCHES_PER_MM;
    const effectiveDpi = panel.originalWidth / displayWidthInInches;

    let dpiStatusClass = 'good';
    let dpiMessage = `Panel ${panel.label}: Effective resolution is <strong>${Math.round(effectiveDpi)} DPI</strong>. `;
    if (effectiveDpi >= requiredDpi) { dpiMessage += `(✅ Good)`; }
    else if (effectiveDpi >= requiredDpi * 0.8) { dpiMessage += `(⚠️ Acceptable)`; dpiStatusClass = 'warning'; }
    else { dpiMessage += `(❌ Low Resolution)`; dpiStatusClass = 'error'; }
    const dpiFeedback = `<li class="${dpiStatusClass}">${dpiMessage}</li>`;

    // Calculate ideal source dimensions
    const idealOriginalWidth = displayWidthInInches * requiredDpi;
    const idealOriginalHeight = displayHeightInInches * requiredDpi;

    // Determine if there's a significant difference from the ideal
    let dimensionStatusClass = 'good';
    let dimensionMessage = `Panel ${panel.label}: Current display size is <strong>${Math.round(panel.displayWidth / state.PIXELS_PER_MM)}x${Math.round(panel.displayHeight / state.PIXELS_PER_MM)} mm</strong>. `;

    // Check if the current panel's original resolution is too low relative to its displayed size for the target DPI
    if (panel.originalWidth < idealOriginalWidth * 0.9 || panel.originalHeight < idealOriginalHeight * 0.9) { // 90% tolerance
        dimensionMessage += `To meet the journal's ${requiredDpi} DPI at this display size, its source should ideally be <strong>${Math.round(idealOriginalWidth)} x ${Math.round(idealOriginalHeight)} pixels</strong> or higher.`;
        dimensionStatusClass = 'warning';
    } else {
        dimensionMessage += `Source resolution is adequate for ${requiredDpi} DPI at this display size.`;
    }

    const dimensionFeedback = `<li class="${dimensionStatusClass}">${dimensionMessage}</li>`;

    const colorFeedbackResult = await analyzePanelColors(panel);
    const colorFeedback = `<li class="${colorFeedbackResult.statusClass}">${colorFeedbackResult.message}</li>`;
    return dpiFeedback + dimensionFeedback + colorFeedback;
}

function analyzePanelColors(panel) {
    return new Promise((resolve) => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        const analysisWidth = 100;
        tempCanvas.width = analysisWidth;
        tempCanvas.height = panel.image.height * (analysisWidth / panel.image.width);
        tempCtx.drawImage(panel.image, 0, 0, tempCanvas.width, tempCanvas.height);
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        let hasRed = false; let hasGreen = false;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i]; const g = data[i+1]; const b = data[i+2];
            if (r > 120 && g < 100 && b < 100) hasRed = true;
            if (g > 120 && r < 100 && b < 100) hasGreen = true;
            if (hasRed && hasGreen) break;
        }
        if (hasRed && hasGreen) {
            const colorblindSafePalettes = [
                '#1f77b4, #ff7f0e, #2ca02c', // Blue, Orange, Green
                '#d62728, #9467bd, #8c564b', // Red, Purple, Brown
                '#e377c2, #7f7f7f, #bcbd22'  // Pink, Gray, Olive
            ];
            const suggestion = colorblindSafePalettes[Math.floor(Math.random() * colorblindSafePalettes.length)];
            resolve({ 
                message: `Panel ${panel.label}: (⚠️ Advisory) Uses red & green. Consider colorblind-safe alternatives: ${suggestion}`, 
                statusClass: 'warning' 
            });
        } else {
            resolve({ message: `Panel ${panel.label}: (✅ Colors friendly)`, statusClass: 'good' });
        }
    });
} 