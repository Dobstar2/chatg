import { HandTrackingManagerV2 } from './hand-tracking-v020.js';

const mainInitialize = HandTrackingManagerV2.prototype.initialize;
const mainStart = HandTrackingManagerV2.prototype.start;
const mainStop = HandTrackingManagerV2.prototype.stop;
const mainPause = HandTrackingManagerV2.prototype.pause;
const mainResume = HandTrackingManagerV2.prototype.resume;

function isAppleWebKit() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua)
    || touchMac
    || (/AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(ua));
}

function supportsWorkerFrames(manager) {
  // MediaStreamTrackProcessor + transferable VideoFrame is not reliable enough
  // on current iPhone WebKit for the authoritative controller path. In
  // particular, the processor can produce a valid first frame and then end its
  // reader. That looked like a hand appearing briefly and disappearing forever.
  // Keep iPhone Safari on the proven requestVideoFrameCallback/main-thread path.
  if (isAppleWebKit()) return false;
  return typeof Worker !== 'undefined'
    && typeof MediaStreamTrackProcessor !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && Boolean(manager.cameraManager?.track);
}

function captureAgeForFrame(frame) {
  try {
    const metadata = typeof frame.metadata === 'function' ? frame.metadata() : null;
    if (Number.isFinite(metadata?.captureTime)) {
      return Math.max(0, performance.now() - metadata.captureTime);
    }
  } catch (_) {}
  return 0;
}

HandTrackingManagerV2.prototype.initialize = async function initializeWithWorkerFastPath() {
  if (this._workerReady) {
    this.dispatchEvent(new CustomEvent('status', { detail: this._workerDelegate === 'GPU' ? 'ready-gpu' : 'ready-cpu' }));
    return;
  }
  if (!supportsWorkerFrames(this)) {
    return mainInitialize.call(this);
  }

  try {
    const worker = new Worker(new URL('./hand-worker-v020.js', import.meta.url), { type: 'module' });
    this._trackingWorker = worker;
    this._workerBusy = false;
    this._workerFrameErrors = 0;
    this._workerToken = 0;
    this._workerSentAt = new Map();

    const ready = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tracking worker startup timeout.')), 5500);
      const onMessage = (event) => {
        const data = event.data || {};
        if (data.type === 'ready') {
          clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          resolve(data.delegate || 'CPU');
        } else if (data.type === 'init-error') {
          clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          reject(new Error(data.message || 'Tracking worker failed to initialize.'));
        }
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Tracking worker failed to load.'));
      }, { once: true });
      worker.postMessage({ type: 'init' });
    });

    this._workerDelegate = ready;
    this._workerReady = true;
    this.metrics.model = `@mediapipe/tasks-vision HandLandmarker 0.10.35 · worker ${ready}`;
    worker.addEventListener('message', (event) => this._handleWorkerMessage(event));
    worker.addEventListener('error', () => this._fallbackFromWorker('worker-error'));
    this.dispatchEvent(new CustomEvent('status', { detail: ready === 'GPU' ? 'ready-gpu' : 'ready-cpu' }));
  } catch (error) {
    try { this._trackingWorker?.terminate(); } catch (_) {}
    this._trackingWorker = null;
    this._workerReady = false;
    this._workerBusy = false;
    return mainInitialize.call(this);
  }
};

HandTrackingManagerV2.prototype.start = function startWorkerOrMain() {
  if (!this._workerReady) return mainStart.call(this);
  if (this.running) return;
  this.running = true;
  this.paused = false;
  this.lastVideoTime = -1;
  this._startTrackProcessorLoop();
};

HandTrackingManagerV2.prototype.stop = function stopWorkerOrMain() {
  if (!this._workerReady) return mainStop.call(this);
  this.running = false;
  this.paused = false;
  this._workerBusy = false;
  this._stopTrackProcessor();
};

HandTrackingManagerV2.prototype.pause = function pauseWorkerOrMain() {
  if (!this._workerReady) return mainPause.call(this);
  if (!this.running) return;
  this.paused = true;
};

HandTrackingManagerV2.prototype.resume = function resumeWorkerOrMain() {
  if (!this._workerReady) return mainResume.call(this);
  if (!this.running || !this.paused) return;
  this.paused = false;
};

HandTrackingManagerV2.prototype._startTrackProcessorLoop = function startTrackProcessorLoop() {
  this._stopTrackProcessor();
  try {
    const processor = new MediaStreamTrackProcessor({ track: this.cameraManager.track });
    this._trackReader = processor.readable.getReader();
    this._readNewestFrames();
  } catch (_) {
    this._fallbackFromWorker('track-processor-start');
  }
};

HandTrackingManagerV2.prototype._stopTrackProcessor = function stopTrackProcessor() {
  const reader = this._trackReader;
  this._trackReader = null;
  if (reader) {
    try { reader.cancel(); } catch (_) {}
    try { reader.releaseLock(); } catch (_) {}
  }
};

HandTrackingManagerV2.prototype._readNewestFrames = async function readNewestFrames() {
  const reader = this._trackReader;
  if (!reader) return;

  while (this.running && reader === this._trackReader) {
    let packet;
    try {
      packet = await reader.read();
    } catch (_) {
      if (this.running) this._fallbackFromWorker('track-reader-error');
      return;
    }

    // An ended processor while the app is still running is not a successful
    // completion. Switch back to the reliable main tracker immediately.
    if (!packet || packet.done) {
      if (this.running && !this.paused && reader === this._trackReader) {
        this._fallbackFromWorker('track-reader-ended');
      }
      return;
    }

    const frame = packet.value;
    if (!frame) continue;

    if (this.paused || document.hidden || this._workerBusy) {
      this.metrics.droppedTrackingFrames += 1;
      try { frame.close(); } catch (_) {}
      continue;
    }

    const now = performance.now();
    if (now - this.lastInferenceAt < this.inferenceIntervalMs) {
      try { frame.close(); } catch (_) {}
      continue;
    }

    this.lastInferenceAt = now;
    this._workerBusy = true;
    const token = ++this._workerToken;
    const captureAgeMs = captureAgeForFrame(frame);
    const modelTimestamp = Math.max(now, this.lastModelTimestamp + 0.01);
    this.lastModelTimestamp = modelTimestamp;
    this._workerSentAt.set(token, now);
    this.metrics.frameFreshnessMs = captureAgeMs;
    this.metrics.cameraResolution = `${frame.displayWidth || frame.codedWidth || this.video.videoWidth}x${frame.displayHeight || this.video.videoHeight}`;

    try {
      this._trackingWorker.postMessage({
        type: 'frame',
        token,
        frame,
        timestamp: modelTimestamp,
        captureAgeMs,
        sentAt: now,
      }, [frame]);
    } catch (_) {
      this._workerBusy = false;
      this._workerSentAt.delete(token);
      try { frame.close(); } catch (_) {}
      this._fallbackFromWorker('frame-transfer-error');
      return;
    }
  }
};

HandTrackingManagerV2.prototype._handleWorkerMessage = function handleWorkerMessage(event) {
  const data = event.data || {};
  if (data.type === 'result') {
    const completed = performance.now();
    const sentAt = this._workerSentAt.get(data.token) || data.sentAt || completed;
    this._workerSentAt.delete(data.token);
    this._workerBusy = false;
    this._workerFrameErrors = 0;

    this._consumeResult(data.result, completed);
    const inferenceMs = Number.isFinite(data.inferenceMs) ? data.inferenceMs : completed - sentAt;
    this.metrics.inferenceMs = this.metrics.inferenceMs
      ? this.metrics.inferenceMs * 0.82 + inferenceMs * 0.18
      : inferenceMs;
    this.metrics.frameFreshnessMs = Number.isFinite(data.captureAgeMs) ? data.captureAgeMs : this.metrics.frameFreshnessMs;
    this.metrics.estimatedTrackingLatencyMs = this.metrics.frameFreshnessMs + Math.max(0, completed - sentAt);
    this.metrics.lastInferenceCompletedAt = completed;
    this.metrics.completedFrames += 1;
    this.metrics.frameCounter += 1;

    const elapsed = completed - this.metrics.fpsWindowStart;
    if (elapsed >= 1000) {
      this.metrics.trackingFps = this.metrics.frameCounter * 1000 / elapsed;
      this.metrics.frameCounter = 0;
      this.metrics.fpsWindowStart = completed;
    }
    this.inferenceIntervalMs = Math.max(38, Math.min(82, Math.round(this.metrics.inferenceMs * 1.08 + 9)));
    return;
  }

  if (data.type === 'frame-error') {
    this._workerBusy = false;
    this._workerSentAt.delete(data.token);
    this._workerFrameErrors = (this._workerFrameErrors || 0) + 1;
    if (this._workerFrameErrors >= 2) this._fallbackFromWorker('worker-frame-error');
  }
};

HandTrackingManagerV2.prototype._fallbackFromWorker = async function fallbackFromWorker(reason) {
  if (this._workerFallbackActive || !this._workerReady) return;
  this._workerFallbackActive = true;
  const restart = this.running;

  this.running = false;
  this.paused = false;
  this._stopTrackProcessor();
  try { this._trackingWorker?.terminate(); } catch (_) {}
  this._trackingWorker = null;
  this._workerReady = false;
  this._workerBusy = false;
  this._workerSentAt?.clear?.();

  try {
    await mainInitialize.call(this);
    this.metrics.model = `@mediapipe/tasks-vision HandLandmarker main fallback (${reason})`;
    if (restart) mainStart.call(this);
  } catch (error) {
    this.dispatchEvent(new CustomEvent('error', { detail: error }));
  } finally {
    this._workerFallbackActive = false;
  }
};
