import { clamp } from '../core/math.js';

function labelOf(deviceOrTrack) {
  return (deviceOrTrack?.label || '').toLowerCase();
}

function isFront(deviceOrTrack) {
  const settings = deviceOrTrack?.getSettings?.() || {};
  return settings.facingMode === 'user' || /front|user|facetime|selfie/.test(labelOf(deviceOrTrack));
}

function isUltraWide(deviceOrTrack) {
  return /ultra[ -]?wide|0\.5|0,5/.test(labelOf(deviceOrTrack));
}

function cameraScore(device) {
  const label = labelOf(device);
  if (/front|user|facetime|selfie/.test(label)) return -10000;
  let score = 0;
  if (/ultra[ -]?wide|0\.5|0,5/.test(label)) score += 5000;
  if (/dual[ -]?wide|triple/.test(label)) score += 2400;
  if (/back|rear|environment/.test(label)) score += 900;
  if (/tele|telephoto/.test(label)) score -= 1800;
  return score;
}

export class CameraManager extends EventTarget {
  constructor(video) {
    super();
    this.video = video;
    this.stream = null;
    this.track = null;
    this.status = 'idle';
    this.lens = 'unknown';
    this.horizontalFovDeg = 78;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera capture is not supported by this browser.');
    }
    this._setStatus('permission');

    let permissionStream;
    try {
      permissionStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: 'environment' },
          width: { ideal: 640, max: 960 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
    } catch (_) {
      permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    this._setStatus('selecting');
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === 'videoinput')
      .map((device) => ({ device, score: cameraScore(device) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    let selectedStream = permissionStream;
    const permissionTrack = permissionStream.getVideoTracks()[0];
    const currentId = permissionTrack?.getSettings?.().deviceId;
    const preferred = devices[0]?.device || null;

    if (preferred && preferred.deviceId && preferred.deviceId !== currentId) {
      // iPhone Safari is more reliable when only one rear-camera stream is open.
      permissionStream.getTracks().forEach((item) => item.stop());
      selectedStream = null;
      try {
        selectedStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: preferred.deviceId },
            width: { ideal: 640, max: 960 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
      } catch (_) {
        // Reopen a strict rear stream if the named physical lens cannot be opened.
        selectedStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 640, max: 960 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
      }
    }

    const selectedTrack = selectedStream?.getVideoTracks?.()[0];
    if (!selectedTrack || isFront(selectedTrack)) {
      selectedStream?.getTracks().forEach((item) => item.stop());
      throw new Error('Safari did not expose a rear camera.');
    }

    this.stream = selectedStream;
    this.track = selectedStream.getVideoTracks()[0];
    this.video.srcObject = selectedStream;
    await this.video.play();

    const zoomApplied = await this._requestHalfZoom(this.track);
    const settings = this.track.getSettings?.() || {};
    const confirmedHalf = isUltraWide(this.track) || (Number.isFinite(settings.zoom) && settings.zoom <= 0.62);
    const capabilities = this.track.getCapabilities?.() || {};
    const supportsSubOne = Number.isFinite(capabilities.zoom?.min) && capabilities.zoom.min < 1;

    if (confirmedHalf) {
      this.lens = 'rear-0.5';
      this.horizontalFovDeg = 110;
    } else if (zoomApplied || supportsSubOne || /dual[ -]?wide|triple/.test(labelOf(this.track))) {
      this.lens = 'rear-wide-requested';
      this.horizontalFovDeg = 100;
    } else {
      this.lens = 'rear';
      this.horizontalFovDeg = 78;
    }

    this._setStatus('ready');
    return {
      lens: this.lens,
      label: this.track.label || 'Rear camera',
      settings: this.track.getSettings?.() || {},
      horizontalFovDeg: this.horizontalFovDeg,
    };
  }

  async _requestHalfZoom(track) {
    const capabilities = track?.getCapabilities?.();
    if (!capabilities?.zoom || typeof track.applyConstraints !== 'function') return false;
    const min = Number.isFinite(capabilities.zoom.min) ? capabilities.zoom.min : 1;
    const max = Number.isFinite(capabilities.zoom.max) ? capabilities.zoom.max : 1;
    const target = min <= 0.5 && max >= 0.5 ? 0.5 : (min < 1 ? min : null);
    if (target == null) return false;
    try {
      await track.applyConstraints({ advanced: [{ zoom: clamp(target, min, max) }] });
      return true;
    } catch (_) {
      return false;
    }
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.track = null;
    this.video.srcObject = null;
    this._setStatus('stopped');
  }

  _setStatus(status) {
    this.status = status;
    this.dispatchEvent(new CustomEvent('status', { detail: status }));
  }
}
