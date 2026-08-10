const BUILD_ID = 'v0.6.0';
const BUILD_TIME = '10 Aug 2026 17:14 BST';

const camera = document.getElementById('camera');
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const startStatus = document.getElementById('startStatus');
const motionState = document.getElementById('motionState');
const handState = document.getElementById('handState');
const cameraState = document.getElementById('cameraState');
const lookState = document.getElementById('lookState');
const buildState = document.getElementById('buildState');
const startBuild = document.getElementById('startBuild');
const installHint = document.getElementById('installHint');
const recenterButton = document.getElementById('recenterButton');
const worldTemplate = document.getElementById('worldTemplate');

const worlds = [...document.querySelectorAll('.world')];
worlds.forEach((world) => world.appendChild(worldTemplate.content.cloneNode(true)));

const shells = worlds.map((world) => world.querySelector('.shell'));
const cursors = worlds.map((world) => world.querySelector('.cursor'));
const gestureStates = worlds.map((world) => world.querySelector('[data-gesture-state]'));
const targetStates = worlds.map((world) => world.querySelector('[data-target-state]'));

if (buildState) buildState.textContent = `BUILD ${BUILD_ID}`;
if (startBuild) startBuild.textContent = `BUILD ${BUILD_ID} • ${BUILD_TIME}`;

document.documentElement.dataset.build = BUILD_ID;

const isStandalone = () => Boolean(
  window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches
);

if (installHint) {
  installHint.hidden = isStandalone();
}

let baselineQuat = null;
let currentQuat = null;
let targetPose = { yaw: 0, pitch: 0, roll: 0 };
let smoothPose = { yaw: 0, pitch: 0, roll: 0 };
let motionEnabled = false;
let motionSamples = 0;
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
let hoveredAction = null;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const expSmoothing = (dtMs, timeConstantMs) => 1 - Math.exp(-dtMs / timeConstantMs);

function setPanel(title, message) {
  worlds.forEach((world) => {
    const panel = world.querySelector('[data-panel="message"]');
    if (panel) panel.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  });
}

function setGestureGuide(state, target = '') {
  gestureStates.forEach((node) => {
    if (node) node.textContent = state;
  });
  targetStates.forEach((node) => {
    if (node) node.textContent = target;
  });
}

function qNormalize(q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function qMultiply(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function qConjugate(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function qAxisAngle(x, y, z, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(half) };
}

function qFromEulerYXZ(x, y, z) {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);

  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  };
}

function qRotateVector(q, v) {
  const qv = { x: v.x, y: v.y, z: v.z, w: 0 };
  const result = qMultiply(qMultiply(q, qv), qConjugate(q));
  return { x: result.x, y: result.y, z: result.z };
}

function screenAngleRadians() {
  const screenAngle = screen.orientation?.angle;
  if (Number.isFinite(screenAngle)) return screenAngle * DEG;
  if (Number.isFinite(window.orientation)) return Number(window.orientation) * DEG;
  return 0;
}

function deviceQuaternion(alpha, beta, gamma) {
  const euler = qFromEulerYXZ(beta * DEG, alpha * DEG, -gamma * DEG);
  const cameraCorrection = qAxisAngle(1, 0, 0, -Math.PI / 2);
  const screenCorrection = qAxisAngle(0, 0, 1, -screenAngleRadians());
  return qNormalize(qMultiply(qMultiply(euler, cameraCorrection), screenCorrection));
}

function relativePose(base, current) {
  const relative = qNormalize(qMultiply(qConjugate(base), current));
  const forward = qRotateVector(relative, { x: 0, y: 0, z: -1 });
  const up = qRotateVector(relative, { x: 0, y: 1, z: 0 });

  const yaw = Math.atan2(forward.x, -forward.z) * RAD;
  const pitch = Math.asin(clamp(forward.y, -1, 1)) * RAD;
  const roll = Math.atan2(up.x, up.y) * RAD;

  return {
    yaw: clamp(yaw, -44, 44),
    pitch: clamp(pitch, -32, 32),
    roll: clamp(roll, -22, 22),
  };
}

function recenter() {
  if (currentQuat) baselineQuat = { ...currentQuat };
  targetPose = { yaw: 0, pitch: 0, roll: 0 };
  smoothPose = { yaw: 0, pitch: 0, roll: 0 };
  setPanel('Recentered', 'Forward is now your current headset direction.');
}

function onOrientation(event) {
  const alpha = Number.isFinite(event.alpha) ? event.alpha : 0;
  const beta = Number.isFinite(event.beta) ? event.beta : 0;
  const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;

  currentQuat = deviceQuaternion(alpha, beta, gamma);
  if (!baselineQuat) baselineQuat = { ...currentQuat };

  const pose = relativePose(baselineQuat, currentQuat);
  targetPose.yaw = Math.abs(pose.yaw) < 0.12 ? 0 : pose.yaw;
  targetPose.pitch = Math.abs(pose.pitch) < 0.12 ? 0 : pose.pitch;
  targetPose.roll = Math.abs(pose.roll) < 0.18 ? 0 : pose.roll;

  motionSamples += 1;
  if (!motionEnabled) {
    motionEnabled = true;
    motionState.textContent = 'HEAD: ON';
  }
}

function renderFrame(now) {
  if (!renderLoopActive) return;

  const dt = clamp(lastFrameAt ? now - lastFrameAt : 16.7, 8, 50);
  lastFrameAt = now;

  if (motionEnabled && baselineQuat) {
    const a = expSmoothing(dt, 46);
    smoothPose.yaw += (targetPose.yaw - smoothPose.yaw) * a;
    smoothPose.pitch += (targetPose.pitch - smoothPose.pitch) * a;
    smoothPose.roll += (targetPose.roll - smoothPose.roll) * a;

    shells.forEach((shell, index) => {
      const eyeOffset = index === 0 ? 4 : -4;
      const tx = (-smoothPose.yaw * 2.05) + eyeOffset;
      const ty = smoothPose.pitch * 1.45;
      shell.style.transform = `translate3d(calc(-50% + ${tx.toFixed(2)}px), calc(-50% + ${ty.toFixed(2)}px), 0) rotateZ(${(smoothPose.roll * -0.055).toFixed(2)}deg) rotateY(${(smoothPose.yaw * 0.10).toFixed(2)}deg) rotateX(${(smoothPose.pitch * -0.075).toFixed(2)}deg)`;
    });

    if (lookState) {
      const horizontal = smoothPose.yaw > 1 ? 'RIGHT' : smoothPose.yaw < -1 ? 'LEFT' : 'CENTER';
      const vertical = smoothPose.pitch > 1 ? 'UP' : smoothPose.pitch < -1 ? 'DOWN' : '';
      lookState.textContent = `LOOK: ${horizontal}${vertical ? ` + ${vertical}` : ''}`;
    }
  }

  const p = expSmoothing(dt, handVisible ? 68 : 120);
  smoothPointer.x += (targetPointer.x - smoothPointer.x) * p;
  smoothPointer.y += (targetPointer.y - smoothPointer.y) * p;

  cursors.forEach((cursor) => {
    cursor.style.left = `${(smoothPointer.x * 100).toFixed(2)}%`;
    cursor.style.top = `${(smoothPointer.y * 100).toFixed(2)}%`;
    cursor.style.opacity = handVisible ? '1' : '0.25';
    cursor.classList.toggle('pinching', pinchDown);
    cursor.classList.toggle('targeted', Boolean(hoveredAction));
  });

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
      throw new Error('No rear camera exposed to Safari.');
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
    if (!track || isDefinitelyFrontTrack(track)) throw new Error('Front camera rejected.');

    camera.srcObject = stream;
    await camera.play();

    const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    if (caps.zoom && typeof track.applyConstraints === 'function') {
      try { await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] }); } catch (_) {}
    }

    const label = track.label || '';
    cameraState.textContent = /ultra[ -]?wide|0\.5|0,5/i.test(label) ? 'CAMERA: REAR 0.5X' : 'CAMERA: REAR';
    return true;
  } catch (_) {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    camera.srcObject = null;
    cameraState.textContent = 'CAMERA: REAR REQUIRED';
    setPanel('Rear camera unavailable', 'The selfie camera is blocked. SpatialHands only uses a rear camera.');
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
    setGestureGuide('SHOW YOUR INDEX FINGER', 'Then pinch thumb + index to click');
    handLoopActive = true;
    scheduleHandFrame(80);
  } catch (_) {
    handState.textContent = 'HAND: FALLBACK';
    setGestureGuide('HAND MODEL OFF', 'Touch controls still work');
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buttonUnderCursor() {
  const cursor = cursors[0];
  if (!cursor || !handVisible) return null;
  const rect = cursor.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const element = document.elementFromPoint(x, y);
  return element?.closest?.('button[data-action]') || null;
}

function refreshInteractionTarget() {
  const target = buttonUnderCursor();
  const nextAction = target?.dataset.action || null;

  if (nextAction !== hoveredAction) {
    hoveredAction = nextAction;
    worlds.forEach((world) => {
      world.querySelectorAll('button[data-action]').forEach((button) => {
        button.classList.toggle('hovered', Boolean(nextAction && button.dataset.action === nextAction));
      });
    });
  }

  if (!handVisible) {
    setGestureGuide('SHOW HAND TO REAR CAMERA', 'Index finger moves the ring');
  } else if (pinchDown) {
    setGestureGuide('✓ PINCH DETECTED', target ? `Selecting ${target.textContent.trim()}` : 'Move onto a tile');
  } else if (target) {
    setGestureGuide('👌 PINCH TO SELECT', target.textContent.trim());
  } else {
    setGestureGuide('☝ POINT WITH INDEX', 'Move the ring onto a tile');
  }

  return target;
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
      setPanel('Passthrough', passthrough ? 'Rear-camera view enabled.' : 'Virtual background restored.');
      break;
    case 'settings':
      mirrorHand = !mirrorHand;
      setPanel('Tracking', `Finger movement is now ${mirrorHand ? 'mirrored' : 'direct'}.`);
      break;
    case 'recenter':
      recenter();
      break;
    case 'browser':
      setPanel('Browser', 'Browser surface selected.');
      break;
    case 'media':
      setPanel('Media', 'Media surface selected.');
      break;
    case 'info':
      setPanel('SpatialHands VR', `Build ${BUILD_ID}. Headset movement uses landscape-corrected relative orientation.`);
      break;
    case 'home':
    default:
      setPanel('Home', 'Point with your index finger. Touch thumb + index together to click.');
      break;
  }
}

function scheduleHandFrame(delay = handIntervalMs) {
  clearTimeout(handTimer);
  if (handLoopActive) handTimer = setTimeout(processHandFrame, delay);
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

      pinchDown = nextPinch;
      const target = refreshInteractionTarget();
      if (nextPinch && !processHandFrame.wasPinching && target) {
        triggerAction(target.dataset.action);
      }
      processHandFrame.wasPinching = nextPinch;
    } else {
      handVisible = false;
      pinchDown = false;
      processHandFrame.wasPinching = false;
      handState.textContent = 'HAND: SEARCH';
      refreshInteractionTarget();
    }
  } catch (_) {
    handState.textContent = 'HAND: RETRY';
  }

  const workMs = performance.now() - started;
  handIntervalMs = clamp(Math.round(workMs * 2.4), 85, 165);
  scheduleHandFrame(handIntervalMs);
}
processHandFrame.wasPinching = false;

async function requestImmersiveMode() {
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch (_) {}

  try {
    if (screen.orientation?.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
}

async function startVR() {
  startButton.disabled = true;
  startStatus.textContent = 'Starting build ' + BUILD_ID + '…';

  await enableMotion();
  const cameraOkay = await enableCamera();
  if (cameraOkay) await enableHandTracking();
  await requestImmersiveMode();

  startScreen.classList.add('hidden');
  requestAnimationFrame(() => recenter());

  setPanel(
    cameraOkay ? 'SpatialHands active' : 'Head tracking active',
    cameraOkay
      ? 'Move your head. Point with your INDEX finger. PINCH thumb + index to select.'
      : 'Move your head to test tracking. Rear camera is unavailable for hand input.'
  );

  if (!isStandalone() && installHint) installHint.hidden = false;
}

startButton.addEventListener('click', startVR);
recenterButton.addEventListener('click', recenter);

worlds.forEach((world) => {
  world.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) triggerAction(button.dataset.action);
  });
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (currentQuat) recenter();
  }, 220);
}, { passive: true });

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
