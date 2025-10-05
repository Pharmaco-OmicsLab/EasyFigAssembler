// js/initialization.js

import { initializeAnnotationEventListeners } from './annotation.js';
import * as api from './api.js';
import { attachEditModalListeners } from './editModal.js';
import { initializeAppEventListeners, initializeMainEventListeners, initializeSidebarEventListeners } from './events.js';
import { initializeFeedbackEventListeners } from './feedback.js';
import { initializeNewProject, populateJournalSelector } from './figure.js';
import { initializeFloatingPreview } from './floatingPreview.js';
import { initializeEditModalPreviewEventListeners, initializePreviewEventListeners } from './preview.js';
import * as ui from './ui.js';
import { fitToPage } from './view.js';

export let app_prefix = '';

/**
 * The main application initialization function.
 * This is the only exported function from this file.
 */
export function initializeApp() {
    // This event listener ensures all HTML is loaded before the script runs.
    document.addEventListener('DOMContentLoaded', () => {
        const body = document.body;
        app_prefix = body.dataset.appPrefix.replace(/\/$/, '');
        
        // This function orchestrates the entire application startup.
        async function startup() {
            try {
                // 1. Load essential data from the backend.
                await api.loadJournalRules();
                
                // 2. Initialize the project state and UI.
                populateJournalSelector();
                initializeNewProject();

                // 3. Set up the initial view.
                const container = document.getElementById('figure-canvas-container');
                if (container) {
                    container.classList.add('auto-size');
                }
                
                                            // 4. Initialize all event listeners.
                            attachEditModalListeners();
                            initializeAnnotationEventListeners();
                            initializeAppEventListeners();
                            initializeMainEventListeners();
                            initializeSidebarEventListeners();
                            initializePreviewEventListeners();
                            initializeEditModalPreviewEventListeners();
                            initializeFeedbackEventListeners();
                            initializeFloatingPreview();

                // 5. Perform final UI adjustments after a brief delay.
                setTimeout(() => {
                    if (ui.figureCanvas && ui.figureCanvas.width && ui.figureCanvas.height) {
                        fitToPage();
                    }
                }, 200);

                console.log("Easy Figure Assembler Initialized! ✨");

            } catch (error) {
                console.error("Failed to initialize the application:", error);
                // Optionally display an error message to the user.
            }
        }

        startup();
    });
}