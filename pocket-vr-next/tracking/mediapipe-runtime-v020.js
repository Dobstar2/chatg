import { HandTrackingManagerV2 } from './hand-tracking-v020.js';

HandTrackingManagerV2.prototype.initialize = async function initializeMediaPipe01035() {
  if (this.landmarker) {
    this.dispatchEvent(new CustomEvent('status', { detail: 'ready-cached' }));
    return;
  }

  this.dispatchEvent(new CustomEvent('status', { detail: 'loading-model' }));
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm');
  const fileset = await vision.FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
  );

  const options = (delegate) => ({
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      ...(delegate ? { delegate } : {}),
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.38,
    minHandPresenceConfidence: 0.38,
    minTrackingConfidence: 0.42,
  });

  try {
    this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options('GPU'));
    this.dispatchEvent(new CustomEvent('status', { detail: 'ready-gpu' }));
  } catch (_) {
    this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options(null));
    this.dispatchEvent(new CustomEvent('status', { detail: 'ready-cpu' }));
  }

  this.metrics.model = '@mediapipe/tasks-vision HandLandmarker 0.10.35';
};
