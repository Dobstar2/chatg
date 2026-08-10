let landmarker = null;
let delegate = 'CPU';

function copyCategory(category) {
  return {
    index: Number.isFinite(category?.index) ? category.index : 0,
    score: Number.isFinite(category?.score) ? category.score : 0,
    categoryName: category?.categoryName || category?.displayName || '',
    displayName: category?.displayName || '',
  };
}

function copyPoint(point) {
  return {
    x: Number(point?.x || 0),
    y: Number(point?.y || 0),
    z: Number(point?.z || 0),
    visibility: Number.isFinite(point?.visibility) ? point.visibility : undefined,
    presence: Number.isFinite(point?.presence) ? point.presence : undefined,
  };
}

function copyResult(result) {
  const handedness = result?.handedness || result?.handednesses || [];
  return {
    handedness: handedness.map((group) => group.map(copyCategory)),
    landmarks: (result?.landmarks || []).map((group) => group.map(copyPoint)),
    worldLandmarks: (result?.worldLandmarks || []).map((group) => group.map(copyPoint)),
  };
}

async function initialize() {
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm');
  const fileset = await vision.FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
  );

  const options = (wantedDelegate) => ({
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      ...(wantedDelegate ? { delegate: wantedDelegate } : {}),
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.38,
    minHandPresenceConfidence: 0.38,
    minTrackingConfidence: 0.42,
  });

  try {
    landmarker = await vision.HandLandmarker.createFromOptions(fileset, options('GPU'));
    delegate = 'GPU';
  } catch (_) {
    landmarker = await vision.HandLandmarker.createFromOptions(fileset, options(null));
    delegate = 'CPU';
  }
}

self.onmessage = async (event) => {
  const data = event.data || {};

  if (data.type === 'init') {
    try {
      if (!landmarker) await initialize();
      self.postMessage({ type: 'ready', delegate });
    } catch (error) {
      self.postMessage({ type: 'init-error', message: error?.message || 'Worker initialization failed.' });
    }
    return;
  }

  if (data.type !== 'frame') return;
  const frame = data.frame;
  if (!frame || !landmarker) {
    try { frame?.close?.(); } catch (_) {}
    self.postMessage({ type: 'frame-error', token: data.token, message: 'Worker is not ready.' });
    return;
  }

  const started = performance.now();
  try {
    const result = landmarker.detectForVideo(frame, data.timestamp);
    const payload = copyResult(result);
    const inferenceMs = performance.now() - started;
    try { frame.close?.(); } catch (_) {}
    self.postMessage({
      type: 'result',
      token: data.token,
      result: payload,
      inferenceMs,
      captureAgeMs: data.captureAgeMs || 0,
      sentAt: data.sentAt || started,
    });
  } catch (error) {
    try { frame.close?.(); } catch (_) {}
    self.postMessage({
      type: 'frame-error',
      token: data.token,
      message: error?.message || 'Worker inference failed.',
    });
  }
};
