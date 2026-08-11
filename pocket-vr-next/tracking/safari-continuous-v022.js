import { HandTrackingManagerV2 } from './hand-tracking-v020.js';

const proto = HandTrackingManagerV2.prototype;
const originalStart = proto.start;
const originalStop = proto.stop;
const originalPause = proto.pause;
const originalResume = proto.resume;

function clearPresentationCallback(manager) {
  if (manager.frameCallbackId != null && typeof manager.video?.cancelVideoFrameCallback === 'function') {
    try { manager.video.cancelVideoFrameCallback(manager.frameCallbackId); } catch (_) {}
  }
  manager.frameCallbackId = null;
}

function clearTimer(manager) {
  if (manager.timer != null) {
    clearTimeout(manager.timer);
    manager.timer = null;
  }
}

function scheduleTimerFrame(manager, delay = 22) {
  clearTimer(manager);
  clearPresentationCallback(manager);
  if (!manager.running || manager.paused) return;

  manager.timer = setTimeout(() => {
    manager.timer = null;
    if (!manager.running || manager.paused) return;

    const video = manager.video;
    if (!video || document.hidden || video.readyState < 2 || video.videoWidth < 2) {
      scheduleTimerFrame(manager, 70);
      return;
    }

    const mediaTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    manager._onFreshVideoFrame(performance.now(), { mediaTime });
  }, delay);
}

// iPhone Safari can stop requestVideoFrameCallback() callbacks for a video that
// is intentionally off-screen/transparent even while its getUserMedia stream is
// still producing frames. Hand tracking must follow the camera stream, not the
// browser compositor, so the production path uses media-time polling instead.
proto._scheduleFreshFrame = function scheduleSafariContinuousFrame() {
  scheduleTimerFrame(this, 22);
};

proto.start = function startSafariContinuous() {
  originalStart.call(this);
  if (!this.running) return;

  this._safariTrackingStartedAt = performance.now();
  this._safariLastMediaTime = -1;
  this._safariMediaStallSince = 0;

  clearInterval(this._safariTrackingWatchdog);
  this._safariTrackingWatchdog = setInterval(() => {
    if (!this.running || this.paused || document.hidden) return;
    const video = this.video;
    if (!video || video.readyState < 2 || video.videoWidth < 2) return;

    const now = performance.now();
    const mediaTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

    if (mediaTime !== this._safariLastMediaTime) {
      this._safariLastMediaTime = mediaTime;
      this._safariMediaStallSince = 0;
    } else if (!this._safariMediaStallSince) {
      this._safariMediaStallSince = now;
    }

    const lastComplete = this.metrics?.lastInferenceCompletedAt || 0;
    const sinceComplete = lastComplete > 0
      ? now - lastComplete
      : now - (this._safariTrackingStartedAt || now);

    // If the ML loop goes silent while camera media is alive, restart only the
    // scheduler. This does not recreate MediaPipe or discard hand calibration.
    if (sinceComplete > 650) {
      this.lastVideoTime = -1;
      this.lastInferenceAt = 0;
      clearTimer(this);
      clearPresentationCallback(this);
      scheduleTimerFrame(this, 0);
      this._safariWatchdogRestarts = (this._safariWatchdogRestarts || 0) + 1;
    }

    // If currentTime itself is frozen for a sustained period, play() can wake a
    // camera-backed video element that WebKit temporarily stopped presenting.
    if (this._safariMediaStallSince && now - this._safariMediaStallSince > 900) {
      try {
        const playResult = video.play();
        playResult?.catch?.(() => {});
      } catch (_) {}
      this._safariMediaStallSince = now;
    }
  }, 250);
};

proto.stop = function stopSafariContinuous() {
  clearInterval(this._safariTrackingWatchdog);
  this._safariTrackingWatchdog = null;
  clearTimer(this);
  clearPresentationCallback(this);
  originalStop.call(this);
};

proto.pause = function pauseSafariContinuous() {
  originalPause.call(this);
  clearTimer(this);
  clearPresentationCallback(this);
};

proto.resume = function resumeSafariContinuous() {
  originalResume.call(this);
  if (this.running && !this.paused) {
    this.lastVideoTime = -1;
    this.lastInferenceAt = 0;
    scheduleTimerFrame(this, 0);
  }
};

const originalGetMetrics = proto.getMetrics;
proto.getMetrics = function getMetricsWithSafariWatchdog() {
  const metrics = originalGetMetrics.call(this);
  return {
    ...metrics,
    scheduler: 'media-time timer',
    watchdogRestarts: this._safariWatchdogRestarts || 0,
  };
};
