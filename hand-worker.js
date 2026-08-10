let handLandmarker = null;
let ready = false;

async function initialize() {
  try {
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });

    ready = true;
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || 'Hand worker failed to initialize.' });
  }
}

function compactLandmarks(landmarks) {
  if (!landmarks) return null;
  const pick = (index) => ({ x: landmarks[index].x, y: landmarks[index].y });
  return {
    wrist: pick(0),
    thumbTip: pick(4),
    indexTip: pick(8),
    middleMcp: pick(9),
  };
}

self.onmessage = async (event) => {
  const data = event.data || {};

  if (data.type === 'init') {
    if (ready) self.postMessage({ type: 'ready' });
    else await initialize();
    return;
  }

  if (data.type !== 'frame') return;

  const bitmap = data.bitmap;
  if (!bitmap) return;

  if (!ready || !handLandmarker) {
    bitmap.close?.();
    self.postMessage({ type: 'frame', hand: null, inferenceMs: 0 });
    return;
  }

  const started = performance.now();
  try {
    const result = handLandmarker.detectForVideo(bitmap, data.timestamp || started);
    const hand = compactLandmarks(result.landmarks?.[0]);
    bitmap.close?.();
    self.postMessage({
      type: 'frame',
      hand,
      inferenceMs: performance.now() - started,
    });
  } catch (error) {
    bitmap.close?.();
    self.postMessage({
      type: 'frame',
      hand: null,
      inferenceMs: performance.now() - started,
      error: error?.message || 'Frame failed',
    });
  }
};
