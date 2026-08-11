import { CameraManager } from '../../pocket-vr-next/tracking/camera-manager.js?v=030';

export const CAMERA_STATES = Object.freeze({
  NONE: 'NONE',
  TRACKING: 'TRACKING_CAMERA',
  PASSTHROUGH: 'REAR_PASSTHROUGH',
  CAMERA_APP: 'REAR_CAMERA',
  TRANSITIONING: 'TRANSITIONING',
  ERROR: 'ERROR',
});

export class CameraCoordinator extends EventTarget {
  constructor(video) {
    super();
    this.video = video;
    this.camera = new CameraManager(video);
    this.state = CAMERA_STATES.NONE;
    this.info = null;
    this.passthrough = false;
    this.camera.addEventListener('status', (event) => {
      this.dispatchEvent(new CustomEvent('status', { detail: { state: this.state, cameraStatus: event.detail } }));
    });
  }

  async startTracking() {
    if (this.camera.stream && this.video.srcObject) {
      this.state = CAMERA_STATES.TRACKING;
      return this.info;
    }
    this.state = CAMERA_STATES.TRANSITIONING;
    this._emit();
    try {
      this.info = await this.camera.start();
      this.state = CAMERA_STATES.TRACKING;
      this._emit();
      return this.info;
    } catch (error) {
      this.state = CAMERA_STATES.ERROR;
      this._emit(error);
      throw error;
    }
  }

  async enterPassthrough() {
    this.state = CAMERA_STATES.TRANSITIONING;
    this._emit();
    if (!this.camera.stream) await this.startTracking();
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
    this.passthrough = false;
    this.camera.stop();
    this.state = CAMERA_STATES.NONE;
    this.info = null;
    this._emit();
  }

  _emit(error = null) {
    this.dispatchEvent(new CustomEvent('change', { detail: { state: this.state, info: this.info, error } }));
  }
}
