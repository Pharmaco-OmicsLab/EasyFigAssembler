// Export Progress Modal Management
class ExportProgressManager {
    constructor() {
        this.modal = document.getElementById('export-progress-modal');
        this.progressFill = document.getElementById('export-progress-fill');
        this.progressPercentage = document.getElementById('export-progress-percentage');
        this.progressTime = document.getElementById('export-progress-time');
        this.stageText = document.getElementById('export-stage-text');
        this.stageDetail = document.getElementById('export-stage-detail');
        this.formatValue = document.getElementById('export-format-value');
        this.resolutionValue = document.getElementById('export-resolution-value');
        this.panelsValue = document.getElementById('export-panels-value');
        this.closeBtn = document.getElementById('export-progress-close');
        this.cancelBtn = document.getElementById('export-progress-cancel');
        
        this.startTime = null;
        this.isCancelled = false;
        this.currentStage = 0;
        this.totalStages = 3;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.closeBtn.addEventListener('click', () => this.hide());
        this.cancelBtn.addEventListener('click', () => this.cancel());
        
        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
    }
    
    show(format, resolution, panelsCount) {
        this.isCancelled = false;
        this.startTime = Date.now();
        this.currentStage = 0;
        
        // Update modal content
        this.formatValue.textContent = format.toUpperCase();
        this.resolutionValue.textContent = `${resolution} DPI`;
        this.panelsValue.textContent = panelsCount;
        
        // Reset progress
        this.updateProgress(0);
        this.updateStage('Processing panels...', 'Preparing high-resolution images');
        
        // Show modal
        this.modal.classList.remove('hidden');
        
        // Focus management
        this.cancelBtn.focus();
    }
    
    hide() {
        this.modal.classList.add('hidden');
        this.isCancelled = false;
    }
    
    cancel() {
        this.isCancelled = true;
        this.updateStage('Cancelling...', 'Please wait');
        // The actual cancellation will be handled by the export function
    }
    
    updateProgress(percentage) {
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        this.progressFill.style.width = `${clampedPercentage}%`;
        this.progressPercentage.textContent = `${Math.round(clampedPercentage)}%`;
        
        // Update time estimation
        if (this.startTime && clampedPercentage > 0) {
            const elapsed = Date.now() - this.startTime;
            const estimatedTotal = (elapsed / clampedPercentage) * 100;
            const remaining = estimatedTotal - elapsed;
            
            if (remaining > 0) {
                this.progressTime.textContent = `Estimated time: ${this.formatTime(remaining)}`;
            } else {
                this.progressTime.textContent = 'Almost done...';
            }
        } else {
            this.progressTime.textContent = 'Calculating...';
        }
    }
    
    updateStage(stageText, stageDetail) {
        this.stageText.textContent = stageText;
        this.stageDetail.textContent = stageDetail;
        this.currentStage++;
        
        // Update progress based on stage
        const stageProgress = (this.currentStage / this.totalStages) * 100;
        this.updateProgress(stageProgress);
    }
    
    updatePanelProgress(currentPanel, totalPanels) {
        const panelProgress = (currentPanel / totalPanels) * 100;
        const stageProgress = ((this.currentStage - 1) / this.totalStages) * 100;
        const stageWeight = 100 / this.totalStages;
        const totalProgress = stageProgress + (panelProgress * stageWeight / 100);
        
        this.updateProgress(totalProgress);
        this.updateStage(`Processing panel ${currentPanel} of ${totalPanels}...`, 'Generating high-resolution images');
    }
    
    complete() {
        this.updateProgress(100);
        this.updateStage('Export complete!', 'Your file is ready for download');
        
        // Auto-hide after 2 seconds
        setTimeout(() => {
            this.hide();
        }, 2000);
    }
    
    error(message) {
        this.updateStage('Export failed', message);
        this.progressTime.textContent = 'Please try again';
        
        // Change button to retry
        this.cancelBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span>Try Again';
        this.cancelBtn.onclick = () => {
            this.hide();
            // Trigger retry (this will be handled by the calling code)
        };
    }
    
    formatTime(milliseconds) {
        const seconds = Math.ceil(milliseconds / 1000);
        if (seconds < 60) {
            return `${seconds}s`;
        } else {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        }
    }
    
    checkCancelled() {
        return this.isCancelled;
    }
}

// Create and export the singleton instance
const exportProgress = new ExportProgressManager();
export default exportProgress;
