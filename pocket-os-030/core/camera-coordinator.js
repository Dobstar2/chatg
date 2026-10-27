import { bounded } from './async.js';

export const CAMERA_STATES = Object.freeze({
  NONE: 'NONE',
  TRACKING: 'TRACKING_CAMERA',
  PASSTHROUGH: 'REAR_PASSTHROUGH',
  TRANSITIONING: 'TRANSITIONING',
  ERROR: 'ERROR',
});

// The candidate owns one stream. Late permission results are stopped before

// attaching them to video, including after timeout, exit and pagehide.

export class CameraCoordinator extends EventTarget {
  constructor(video, { timeoutMs = 10000 } = {}) {
    super();

    this.video = video;
    this.timeoutMs = timeoutMs;

    this.camera = { stream: null, track: null, horizontalFovDeg: 78 };

    this.state = CAMERA_STATES.NONE;

    this.generation = 0;

    this.pending = null;

    this.passthrough = false;
  }

  async startTracking() {
    if (this.camera.track?.readyState === 'live') return this.info;

    if (this.pending) return this.pending;

    const generation = ++this.generation;

    this.state = CAMERA_STATES.TRANSITIONING;

    this._emit();

    const operation = async () => {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Camera unavailable. Use touch instead.');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640, max: 960 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });

      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('Camera request cancelled');
      }

      this.camera.stream = stream;

      this.camera.track = stream.getVideoTracks()[0];

      this.video.srcObject = stream;

      await bounded(this.video.play(), 4000, 'Camera did not start. Retry camera.');

      if (generation !== this.generation) throw new Error('Camera request cancelled');

      this.camera.track.addEventListener('ended', () => {
        if (generation === this.generation) {
          this.stop();
          this.state = CAMERA_STATES.ERROR;
          this._emit(new Error('Camera interrupted. Retry to reconnect.'));
        }
      });

      this.info = {
        lens: this.camera.track.getSettings?.().facingMode || 'camera',
        label: this.camera.track.label,
        horizontalFovDeg: 78,
      };

      this.state = CAMERA_STATES.TRACKING;

      this._emit();

      return this.info;
    };

    this.pending = bounded(
      operation(),
      this.timeoutMs,
      'Camera permission is still waiting. Retry when ready.',
    )
      .catch((error) => {
        if (generation === this.generation) {
          this.stop();
          this.state = CAMERA_STATES.ERROR;
          this._emit(error);
        }

        throw error;
      })
      .finally(() => {
        if (generation === this.generation) this.pending = null;
      });

    return this.pending;
  }

  async enterPassthrough() {
    await this.startTracking();

    this.passthrough = true;

    this.state = CAMERA_STATES.PASSTHROUGH;

    this._emit();

    return this.info;
  }

  exitPassthrough() {
    this.passthrough = false;
    this.state = this.camera.stream ? CAMERA_STATES.TRACKING : CAMERA_STATES.NONE;
    this._emit();
  }

  stop() {
    ++this.generation;

    this.pending = null;

    this.camera.stream?.getTracks().forEach((t) => t.stop());

    this.camera.stream = this.camera.track = null;

    this.video.srcObject = null;

    this.passthrough = false;

    this.state = CAMERA_STATES.NONE;

    this.info = null;

    this._emit();
  }

  _emit(error = null) {
    this.dispatchEvent(
      new CustomEvent('change', { detail: { state: this.state, info: this.info, error } }),
    );
  }
}
