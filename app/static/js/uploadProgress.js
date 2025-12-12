// Upload Progress Modal Management
class UploadProgressManager {
    constructor() {
        this.modal = document.getElementById('upload-progress-modal');
        this.progressFill = document.getElementById('upload-progress-fill');
        this.progressPercentage = document.getElementById('upload-progress-percentage');
        this.progressTime = document.getElementById('upload-progress-time');
        this.stageText = document.getElementById('upload-stage-text');
        this.stageDetail = document.getElementById('upload-stage-detail');

        this.filesCountEl = document.getElementById('upload-files-count');
        this.totalSizeEl = document.getElementById('upload-total-size');
        this.currentFileEl = document.getElementById('upload-current-file');
        this.currentIndexEl = document.getElementById('upload-current-index');
        this.currentSizeEl = document.getElementById('upload-current-size');

        this.closeBtn = null; // removed close button
        this.cancelBtn = document.getElementById('upload-progress-cancel');
        this.forceCloseBtn = document.getElementById('upload-progress-force-close');

        this.startTime = null;
        this.totalFiles = 0;
        this.totalBytes = 0;
        this.currentFileIndex = 0; // 1-based
        this.currentFileBytes = 0;
        this.currentUploadedBytes = 0;

        this._abortController = null; // Provided by caller
        this._onCancel = null;
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.cancelBtn) this.cancelBtn.addEventListener('click', () => this.cancel());
        if (this.forceCloseBtn) this.forceCloseBtn.addEventListener('click', () => this.forceClose());
    }

    bytesToHuman(bytes) {
        if (!bytes && bytes !== 0) return '—';
        const units = ['B','KB','MB','GB','TB'];
        let i = 0; let val = bytes;
        while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
        return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
    }

    show(totalFiles, totalBytes, options = {}) {
        this.totalFiles = totalFiles;
        this.totalBytes = totalBytes || 0;
        this.currentFileIndex = 0;
        this.currentUploadedBytes = 0;
        this.startTime = Date.now();
        this._abortController = options.abortController || null;
        this._onCancel = typeof options.onCancel === 'function' ? options.onCancel : null;

        this.filesCountEl.textContent = String(totalFiles);
        this.totalSizeEl.textContent = this.bytesToHuman(this.totalBytes);
        this.updateStage('Preparing upload...', 'Reading files');
        this.updateProgress(0);

        this.modal.classList.remove('hidden');
        if (this.cancelBtn) this.cancelBtn.removeAttribute('disabled');
        if (this.forceCloseBtn) this.forceCloseBtn.classList.add('hidden');
    }

    hide() {
        if (this._cancelTimeout) {
            clearTimeout(this._cancelTimeout);
            this._cancelTimeout = null;
        }
        this.modal.classList.add('hidden');
    }

    startFile(indexOneBased, name, sizeBytes) {
        this.currentFileIndex = indexOneBased;
        this.currentFileBytes = sizeBytes || 0;
        this.currentUploadedBytes = 0;
        this.currentIndexEl.textContent = `${indexOneBased} / ${this.totalFiles}`;
        this.currentFileEl.textContent = name || '—';
        this.currentSizeEl.textContent = this.bytesToHuman(this.currentFileBytes);
        this.updateStage(`Uploading file ${indexOneBased}/${this.totalFiles}...`, 'Starting upload');
    }

    updateUploadProgress(loadedBytes, totalBytes) {
        this.currentUploadedBytes = loadedBytes || 0;
        const perFileFraction = totalBytes ? Math.min(1, loadedBytes / totalBytes) : 0;
        const overallFraction = ((this.currentFileIndex - 1) + perFileFraction) / Math.max(1, this.totalFiles);
        this.updateProgress(overallFraction * 100);
        this.stageDetail.textContent = `Uploaded ${this.bytesToHuman(loadedBytes)} / ${this.bytesToHuman(totalBytes || this.currentFileBytes)}`;
    }

    updateProcessing(text) {
        this.updateStage(text || 'Processing on server...', 'Converting to PNG');
    }

    updateProgress(percentage) {
        const clamped = Math.max(0, Math.min(100, percentage));
        this.progressFill.style.width = `${clamped}%`;
        this.progressPercentage.textContent = `${Math.round(clamped)}%`;
        if (this.startTime && clamped > 0) {
            const elapsed = Date.now() - this.startTime;
            const estTotal = (elapsed / clamped) * 100;
            const remaining = estTotal - elapsed;
            this.progressTime.textContent = remaining > 0 ? `Estimated time: ${this.formatTime(remaining)}` : 'Almost done...';
        } else {
            this.progressTime.textContent = 'Calculating...';
        }
    }

    updateStage(stageText, stageDetail) {
        this.stageText.textContent = stageText;
        this.stageDetail.textContent = stageDetail;
    }

    completeAll() {
        this.updateProgress(100);
        this.updateStage('Upload complete!', 'All files processed');
        setTimeout(() => this.hide(), 800);
    }

    error(message) {
        this.updateStage('Upload failed', message || 'Unexpected error');
        this.progressTime.textContent = 'Please try again';
    }

    cancel() {
        if (this.cancelBtn) this.cancelBtn.setAttribute('disabled', 'true');
        this.updateStage('Cancelling...', 'Stopping current uploads');
        try { if (this._abortController) this._abortController.abort(); } catch (e) {}
        try { if (this._onCancel) this._onCancel('cancel'); } catch (e) {}
        if (this.forceCloseBtn) this.forceCloseBtn.classList.remove('hidden');
        if (!this._cancelTimeout) {
            this._cancelTimeout = setTimeout(() => {
                this.forceClose('Cancelled (timeout). Restoring previous state...');
            }, 8000);
        }
    }

    forceClose(message) {
        if (this.cancelBtn) this.cancelBtn.setAttribute('disabled', 'true');
        if (message) this.updateStage('Cancelling...', message);
        try { if (this._abortController) this._abortController.abort(); } catch (e) {}
        try { if (this._onCancel) this._onCancel('force'); } catch (e) {}
        this.hide();
    }

    formatTime(ms) {
        const s = Math.ceil(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const rs = s % 60;
        return `${m}m ${rs}s`;
    }
}

const uploadProgress = new UploadProgressManager();
export default uploadProgress;


