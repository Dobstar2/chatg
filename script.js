const camera = document.getElementById('camera');
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const startStatus = document.getElementById('startStatus');
const motionState = document.getElementById('motionState');
const handState = document.getElementById('handState');
const cameraState = document.getElementById('cameraState');
const recenterButton = document.getElementById('recenterButton');
const worldTemplate = document.getElementById('worldTemplate');

const worlds = [...document.querySelectorAll('.world')];
worlds.forEach((world) => world.appendChild(worldTemplate.content.cloneNode(true)));

const shells = worlds.map((world) => world.querySelector('.shell'));
const cursors = worlds.map((world) => world.querySelector('.cursor'));
const leftShell = shells[0];
const leftButtons = [...worlds[0].querySelectorAll('button[data-action]')];

let baseline = null;
let latestOrientation = { alpha: 0, beta: 0, gamma: 0 };
let targetPose = { yaw: 0, pitch: 0, roll: 0 };
let smoothPose = { yaw: 0, pitch: 0, roll: 0 };
let motionEnabled = false;
let lastFrameAt = 0;
let renderLoopActive = true;

let stream = null;
let handLandmarker = null;
let handLoopActive = false;
let lastVideoTime = -1;
let handIntervalMs = 100;
let handTimer = null;

let targetPointer = { x: 0.5, y: 0.5 };
let smoothPointer = { x: 0.5, y: 0.5 };
let handVisible = false;
let pinchDown = false;
let mirrorHand = true;
let passthrough = false;
let lastSelectionAt = 0;
let hitRects = [];
let lastHoverAction = null;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const angleDelta = (a, b) => ((a - b + 540) % 360) - 180;
const expSmoothing = (dtMs, timeConstantMs) => 1 - Math.exp(-dtMs / timeConstantMs);

function setPanel(title, message) {
  worlds.forEach((world) => {
    const panel = world.querySelector('[data-panel="message"]');
    if (panel) panel.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  });
}

function recenter() {
  baseline = { ...latestOrientation };
  targetPose = { yaw: 0, pitch: 0, roll: 0 };
  smoothPose = { yaw: 0, pitch: 0, roll: 0 };
  setPanel('Recentered', 'Forward direction reset to your current head position.');
}

function updateTargetPose() {
  if (!baseline) return;

  const yaw = clamp(angleDelta(latestOrientation.alpha, baseline.alpha), -36, 36);
  const pitch = clamp(latestOrientation.beta - baseline.beta, -26, 26);
  const roll = clamp(latestOrientation.gamma - baseline.gamma, -20, 20);

  targetPose.yaw = Math.abs(yaw) < 0.16 ? 0 : yaw;
  targetPose.pitch = Math.abs(pitch) < 0.16 ? 0 : pitch;
  targetPose.roll = Math.abs(roll) < 0.2 ? 0 : roll;
}

function onOrientation(event) {
  latestOrientation = {
    alpha: Number.isFinite(event.alpha) ? event.alpha : latestOrientation.alpha,
    beta: Number.isFinite(event.beta) ? event.beta : latestOrientation.beta,
    gamma: Number.isFinite(event.gamma) ? event.gamma : latestOrientation.gamma,
  };

  if (!baseline) baseline = { ...latestOrientation };
  updateTargetPose();

  if (!motionEnabled) {
    motionEnabled = true;
    motionState.textContent = 'HEAD: ON';
  }
}

function renderFrame(now) {
  if (!renderLoopActive) return;

  const dt = clamp(lastFrameAt ? now - lastFrameAt : 16.7, 8, 50);
  lastFrameAt = now;

  if (motionEnabled && baseline) {
    const headAlpha = expSmoothing(dt, 52);
    smoothPose.yaw += (targetPose.yaw - smoothPose.yaw) * headAlpha;
    smoothPose.pitch += (targetPose.pitch - smoothPose.pitch) * headAlpha;
    smoothPose.roll += (targetPose.roll - smoothPose.roll) * headAlpha;

    shells.forEach((shell, index) => {
      const eyeOffset = index === 0 ? 4 : -4;
      const tx = (-smoothPose.yaw * 1.72) + eyeOffset;
      const ty = smoothPose.pitch * 1.12;
      shell.style.transform = `translate3d(calc(-50% + ${tx.toFixed(2)}px), calc(-50% + ${ty.toFixed(2)}px), 0) rotateZ(${(smoothPose.roll * -0.045).toFixed(2)}deg) rotateY(${(smoothPose.yaw * 0.085).toFixed(2)}deg) rotateX(${(smoothPose.pitch * -0.06).toFixed(2)}deg)`;
    });
  }

  const pointerAlpha = expSmoothing(dt, handVisible ? 72 : 120);
  smoothPointer.x += (targetPointer.x - smoothPointer.x) * pointerAlpha;
  smoothPointer.y += (targetPointer.y - smoothPointer.y) * pointerAlpha;

  cursors.forEach((cursor) => {
    cursor.style.left = `${(smoothPointer.x * 100).toFixed(2)}%`;
    cursor.style.top = `${(smoothPointer.y * 100).toFixed(2)}%`;
    cursor.style.opacity = handVisible ? '1' : '0.35';
    cursor.classList.toggle('pinching', pinchDown);
  });

  updateHoverFromCachedRects();
  requestAnimationFrame(renderFrame);
}

async function enableMotion() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Motion permission was not granted.');
    }
    window.addEventListener('deviceorientation', onOrientation, { capture: true, passive: true });
    motionState.textContent = 'HEAD: READY';
  } catch (error) {
    motionState.textContent = 'HEAD: BLOCKED';
    setPanel('Head tracking unavailable', error.message || 'Motion access is blocked.');
  }
}

function cameraScore(device) {
  const label = (device.label || '').toLowerCase();
  if (/front|user|facetime|selfie/.test(label)) return -1000;

  let score = 0;
  if (/ultra[ -]?wide|0\.5|0,5/.test(label)) score += 200;
  if (/back|rear|environment/.test(label)) score += 100;
  if (/triple|dual wide|dual/.test(label)) score += 40;
  if (/wide/.test(label)) score += 15;
  return score;
}

function isDefinitelyFrontTrack(track) {
  const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
  const label = (track.label || '').toLowerCase();
  return settings.facingMode === 'user' || /front|user|facetime|selfie/.test(label);
}

const rearConstraints = {
  facingMode: { exact: 'environment' },
  width: { ideal: 640, max: 960 },
  height: { ideal: 360, max: 540 },
  frameRate: { ideal: 24, max: 30 },
};

async function openRearByFacingMode() {
  return navigator.mediaDevices.getUserMedia({ video: rearConstraints, audio: false });
}

async function selectBestRearCamera() {
  let initial;

  try {
    initial = await openRearByFacingMode();
  } catch (_) {
    initial = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const preferred = devices
    .filter((device) => device.kind === 'videoinput')
    .map((device) => ({ device, score: cameraScore(device) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.device;

  if (preferred) {
    initial.getTracks().forEach((track) => track.stop());
    const selected = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: preferred.deviceId },
        width: { ideal: 640, max: 960 },
        height: { ideal: 360, max: 540 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });

    if (isDefinitelyFrontTrack(selected.getVideoTracks()[0])) {
      selected.getTracks().forEach((track) => track.stop());
      throw new Error('Front camera rejected.');
    }
    return selected;
  }

  const initialTrack = initial.getVideoTracks()[0];
  if (isDefinitelyFrontTrack(initialTrack)) {
    initial.getTracks().forEach((track) => track.stop());
    const rear = await openRearByFacingMode();
    if (isDefinitelyFrontTrack(rear.getVideoTracks()[0])) {
      rear.getTracks().forEach((track) => track.stop());
      throw new Error('No rear camera was exposed to Safari.');
    }
    return rear;
  }

  return initial;
}

async function enableCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraState.textContent = 'CAMERA: UNSUPPORTED';
    return false;
  }

  try {
    stream = await selectBestRearCamera();
    const track = stream.getVideoTracks()[0];

    if (!track || isDefinitelyFrontTrack(track)) {
      stream?.getTracks().forEach((item) => item.stop());
      stream = null;
      throw new Error('Front camera rejected.');
    }

    camera.srcObject = stream;
    await camera.play();

    const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    if (caps.zoom && typeof track.applyConstraints === 'function') {
      try {
        await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
      } catch (_) {}
    }

    const label = track.label || '';
    cameraState.textContent = /ultra[ -]?wide|0\.5|0,5/i.test(label) ? 'CAMERA: REAR 0.5X' : 'CAMERA: REAR';
    return true;
  } catch (_) {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    camera.srcObject = null;
    cameraState.textContent = 'CAMERA: REAR REQUIRED';
    setPanel('Rear camera unavailable', 'The selfie camera is blocked. SpatialHands will only continue with a rear camera.');
    return false;
  }
}

async function enableHandTracking() {
  if (!stream) return;

  try {
    handState.textContent = 'HAND: LOADING';
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });

    handState.textContent = 'HAND: READY';
    handLoopActive = true;
    scheduleHandFrame(80);
  } catch (_) {
    handState.textContent = 'HAND: FALLBACK';
    setPanel('Hand model unavailable', 'Head tracking still works. Touch controls remain available.');
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cacheHitRects() {
  if (!leftShell) return;
  hitRects = leftButtons.map((button) => ({
    action: button.dataset.action,
    left: button.offsetLeft,
    top: button.offsetTop,
    right: button.offsetLeft + button.offsetWidth,
    bottom: button.offsetTop + button.offsetHeight,
  }));
}

function actionAtPointer() {
  if (!leftShell) return null;
  const x = smoothPointer.x * leftShell.clientWidth;
  const y = smoothPointer.y * leftShell.clientHeight;
  return hitRects.find((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)?.action || null;
}

function updateHoverFromCachedRects() {
  const action = handVisible ? actionAtPointer() : null;
  if (action === lastHoverAction) return;
  lastHoverAction = action;

  worlds.forEach((world) => {
    world.querySelectorAll('button[data-action]').forEach((button) => {
      button.classList.toggle('hovered', Boolean(action && button.dataset.action === action));
    });
  });
}

function triggerAction(action) {
  const now = performance.now();
  if (now - lastSelectionAt < 380) return;
  lastSelectionAt = now;

  if (navigator.vibrate) navigator.vibrate(18);

  switch (action) {
    case 'passthrough':
      passthrough = !passthrough;
      document.body.classList.toggle('passthrough', passthrough);
      setPanel('Passthrough', passthrough ? 'Rear-camera view enabled behind the stereo shell.' : 'Virtual background restored.');
      break;
    case 'settings':
      mirrorHand = !mirrorHand;
      setPanel('Tracking', `Horizontal hand mapping: ${mirrorHand ? 'mirrored' : 'direct'}. Pinch Tracking again to switch.`);
      break;
    case 'recenter':
      recenter();
      break;
    case 'browser':
      setPanel('Browser', 'Web surface selected.');
      break;
    case 'media':
      setPanel('Media', 'Media surface selected.');
      break;
    case 'info':
      setPanel('SpatialHands VR', 'Optimized stereo web prototype with filtered motion and adaptive hand tracking.');
      break;
    case 'home':
    default:
      setPanel('Home', 'Look around, point with your index finger, and pinch to select.');
      break;
  }
}

function scheduleHandFrame(delay = handIntervalMs) {
  clearTimeout(handTimer);
  if (!handLoopActive) return;
  handTimer = setTimeout(processHandFrame, delay);
}

function processHandFrame() {
  if (!handLoopActive) return;

  if (document.hidden || !handLandmarker || camera.readyState < 2) {
    scheduleHandFrame(140);
    return;
  }

  if (camera.currentTime === lastVideoTime) {
    scheduleHandFrame(40);
    return;
  }
  lastVideoTime = camera.currentTime;

  const started = performance.now();
  try {
    const result = handLandmarker.detectForVideo(camera, started);
    const landmarks = result.landmarks?.[0];

    if (landmarks) {
      const wrist = landmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleMcp = landmarks[9];
      const palmScale = Math.max(distance(wrist, middleMcp), 0.025);
      const pinchRatio = distance(thumbTip, indexTip) / palmScale;
      const nextPinch = pinchDown ? pinchRatio < 0.58 : pinchRatio < 0.36;

      targetPointer.x = clamp(mirrorHand ? 1 - indexTip.x : indexTip.x, 0.04, 0.96);
      targetPointer.y = clamp(indexTip.y, 0.05, 0.95);
      handVisible = true;
      handState.textContent = nextPinch ? 'HAND: PINCH' : 'HAND: ON';

      if (nextPinch && !pinchDown) {
        const action = actionAtPointer();
        if (action) triggerAction(action);
      }
      pinchDown = nextPinch;
    } else {
      handVisible = false;
      pinchDown = false;
      handState.textContent = 'HAND: SEARCH';
    }
  } catch (_) {
    handState.textContent = 'HAND: RETRY';
  }

  const workMs = performance.now() - started;
  handIntervalMs = clamp(Math.round(workMs * 2.4), 85, 165);
  scheduleHandFrame(handIntervalMs);
}

async function requestFullscreenAndLandscape() {
  try {
    if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch (_) {}

  try {
    if (screen.orientation?.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
}

async function startVR() {
  startButton.disabled = true;
  startStatus.textContent = 'Starting optimized tracking…';

  await enableMotion();
  const cameraOkay = await enableCamera();
  if (cameraOkay) await enableHandTracking();
  await requestFullscreenAndLandscape();

  startScreen.classList.add('hidden');
  requestAnimationFrame(() => {
    cacheHitRects();
    recenter();
  });

  setPanel(
    cameraOkay ? 'SpatialHands active' : 'Head tracking active',
    cameraOkay ? 'Smooth mode active: filtered head motion and adaptive hand tracking.' : 'Rear camera unavailable, so hand tracking is off.'
  );
}

startButton.addEventListener('click', startVR);
recenterButton.addEventListener('click', recenter);

worlds.forEach((world) => {
  world.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) triggerAction(button.dataset.action);
  });
});

window.addEventListener('resize', () => requestAnimationFrame(cacheHitRects), { passive: true });
window.addEventListener('orientationchange', () => setTimeout(cacheHitRects, 250), { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && handLoopActive) scheduleHandFrame(60);
});

window.addEventListener('pagehide', () => {
  renderLoopActive = false;
  handLoopActive = false;
  clearTimeout(handTimer);
  stream?.getTracks().forEach((track) => track.stop());
});

requestAnimationFrame(renderFrame);
