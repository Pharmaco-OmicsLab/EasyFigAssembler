/**
 * Feedback modal functionality for the EasyFigAssembler application
 * Handles feedback submission, rating selection, and modal interactions
 */

import * as api from './api.js';
import { state } from './state.js';
import * as ui from './ui.js';

/**
 * Initialize feedback modal event listeners
 */
export function initializeFeedbackEventListeners() {
    console.log('Initializing feedback event listeners...');
    
    // Feedback modal listeners
    if (ui.feedbackCloseBtn) {
        ui.feedbackCloseBtn.addEventListener('click', closeFeedbackModal);
        console.log('Feedback close button listener attached');
    } else {
        console.warn('Feedback close button not found');
    }

    if (ui.feedbackModal) {
        ui.feedbackModal.addEventListener('click', (e) => {
            if (e.target === ui.feedbackModal) {
                closeFeedbackModal();
            }
        });
        console.log('Feedback modal overlay listener attached');
    } else {
        console.warn('Feedback modal not found');
    }

    // Emoji rating listeners
    if (ui.emojiButtons && ui.emojiButtons.length > 0) {
        ui.emojiButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove selected class from all buttons
                ui.emojiButtons.forEach(b => b.classList.remove('selected'));
                // Add selected class to clicked button
                e.target.classList.add('selected');
                state.selectedRating = parseInt(e.target.dataset.rating);
                console.log('Rating selected:', state.selectedRating);
            });
        });
        console.log('Emoji rating listeners attached to', ui.emojiButtons.length, 'buttons');
    } else {
        console.warn('No emoji buttons found');
    }

    // Feedback submit listener
    if (ui.feedbackSubmitBtn) {
        ui.feedbackSubmitBtn.addEventListener('click', api.submitFeedback);
        console.log('Feedback submit button listener attached');
    } else {
        console.warn('Feedback submit button not found');
    }
    
    console.log('Feedback event listeners initialization complete');
}

/**
 * Show feedback modal and reset form
 */
export function showFeedbackModal() {
    console.log('Showing feedback modal...');
    
    // Reset form
    state.selectedRating = null;
    if (ui.emojiButtons && ui.emojiButtons.length > 0) {
        ui.emojiButtons.forEach(btn => btn.classList.remove('selected'));
    }
    if (ui.feedbackText) ui.feedbackText.value = '';
    if (ui.feedbackSubmitBtn) {
        ui.feedbackSubmitBtn.disabled = false;
        ui.feedbackSubmitBtn.textContent = 'Submit';
    }

    if (ui.feedbackModal) {
        ui.feedbackModal.classList.remove('hidden');
        console.log('Feedback modal shown');
    } else {
        console.error('Feedback modal element not found');
    }
}

/**
 * Close feedback modal
 */
export function closeFeedbackModal() {
    if (ui.feedbackModal) {
        ui.feedbackModal.classList.add('hidden');
    }
} 