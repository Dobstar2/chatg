const BUILD_ID = 'v0.7.0';
const BUILD_TIME = '10 Aug 2026 17:22 BST';

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
if (installHint) installHint.hidden = isStandalone();

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const expSmoothing = (dtMs, timeConstantMs) => 1 - Math.exp(-dtMs / timeConstantMs);

let baselineQuat = null;
let currentQuat = null;
let targetPose = { yaw: 0, pitch: 0, roll: 0 };
let smoothPose = { yaw: 0, pitch: 0, roll: 0 };
let gyroRate = { yaw: 0, pitch: 0, roll: 0 };
let gyroAvailable = false;
let motionEnabled = false;
let lastFrameAt = 0;
let renderLoopActive = true;

let stream = null;
let handWorker = null;
let handWorkerReady = false;
let handFrameInFlight = false;
let handTrackingActive = false;
let lastHandSubmitAt = 0;
let handFrameIntervalMs = 45;
let videoFrameHandle = null;

let targetPointer = { x: 0.5, y: 0.5 };
let smoothPointer = { x: 0.5, y: 0.5 };
let pointerVelocity = { x: 0, y: 0 };
let lastPointerSampleAt = 0;
let handVisible = false;
let pinchDown = false;
let wasPinching = false;
let mirrorHand = true;
let passthrough = false;
let lastSelectionAt = 0;
let hoveredAction = null;
let cursorSizes = shells.map(() => ({ width: 1, height: 1 }));

function updateCursorSizes() {
  cursorSizes = shells.map((shell) => ({
    width: Math.max(1, shell?.clientWidth || 1),
    height: Math.max(1, shell?.clientHeight || 1),
  }));
}

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
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
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

function screenAngleDegrees() {
  const angle = screen.orientation?.angle;
  if (Number.isFinite(angle)) return ((angle % 360) + 360) % 360;
  if (Number.isFinite(window.orientation)) return ((Number(window.orientation) % 360) + 360) % 360;
  return 0;
}

function deviceQuaternion(alpha, beta, gamma) {
  const euler = qFromEulerYXZ(beta * DEG, alpha * DEG, -gamma * DEG);
  const cameraCorrection = qAxisAngle(1, 0, 0, -Math.PI / 2);
  const screenCorrection = qAxisAngle(0, 0, 1, -screenAngleDegrees() * DEG);
  return qNormalize(qMultiply(qMultiply(euler, cameraCorrection), screenCorrection));
}

function relativePose(base, current) {
  const relative = qNormalize(qMultiply(qConjugate(base), current));
  const forward = qRotateVector(relative, { x: 0, y: 0, z: -1 });
  const up = qRotateVector(relative, { x: 0, y: 1, z: 0 });
  return {
    yaw: clamp(Math.atan2(forward.x, -forward.z) * RAD, -48, 48),
    pitch: clamp(Math.asin(clamp(forward.y, -1, 1)) * RAD, -36, 36),
    roll: clamp(Math.atan2(up.x, up.y) * RAD, -24, 24),
  };
}

function remapGyro(rotationRate) {
  const alpha = Number.isFinite(rotationRate?.alpha) ? rotationRate.alpha : 0;
  const beta = Number.isFinite(rotationRate?.beta) ? rotationRate.beta : 0;
  const gamma = Number.isFinite(rotationRate?.gamma) ? rotationRate.gamma : 0;
  const angle = screenAngleDegrees();

  if (angle === 90) return { yaw: -beta, pitch: gamma, roll: alpha };
  if (angle === 270) return { yaw: beta, pitch: -gamma, roll: alpha };
  if (angle === 180) return { yaw: -gamma, pitch: -beta, roll: alpha };
  return { yaw: gamma, pitch: beta, roll: alpha };
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
  targetPose.yaw = Math.abs(pose.yaw) < 0.08 ? 0 : pose.yaw;
  targetPose.pitch = Math.abs(pose.pitch) < 0.08 ? 0 : pose.pitch;
  targetPose.roll = Math.abs(pose.roll) < 0.12 ? 0 : pose.roll;

  if (!motionEnabled) {
    motionEnabled = true;
    motionState.textContent = gyroAvailable ? 'HEAD: GYRO' : 'HEAD: ON';
  }
}

function onMotion(event) {
  const mapped = remapGyro(event.rotationRate);
  const a = 0.48;
  gyroRate.yaw += (mapped.yaw - gyroRate.yaw) * a;
  gyroRate.pitch += (mapped.pitch - gyroRate.pitch) * a;
  gyroRate.roll += (mapped.roll - gyroRate.roll) * a;

  if (!gyroAvailable && (Math.abs(mapped.yaw) + Math.abs(mapped.pitch) + Math.abs(mapped.roll) > 0.01)) {
    gyroAvailable = true;
    motionState.textContent = 'HEAD: GYRO';
  }
}

function renderFrame(now) {
  if (!renderLoopActive) return;
  const dt = clamp(lastFrameAt ? now - lastFrameAt : 16.7, 7, 40);
  lastFrameAt = now;

  const gyroSpeed = Math.hypot(gyroRate.yaw, gyroRate.pitch, gyroRate.roll);
  const predictionSeconds = gyroAvailable ? 0.026 : 0;
  const predicted = {
    yaw: clamp(targetPose.yaw + gyroRate.yaw * predictionSeconds, -50, 50),
    pitch: clamp(targetPose.pitch + gyroRate.pitch * predictionSeconds, -38, 38),
    roll: clamp(targetPose.roll + gyroRate.roll * predictionSeconds, -26, 26),
  };

  const headTimeConstant = gyroSpeed > 70 ? 10 : gyroSpeed > 20 ? 16 : 28;
  const h = expSmoothing(dt, headTimeConstant);
  smoothPose.yaw += (predicted.yaw - smoothPose.yaw) * h;
  smoothPose.pitch += (predicted.pitch - smoothPose.pitch) * h;
  smoothPose.roll += (predicted.roll - smoothPose.roll) * h;

  shells.forEach((shell, index) => {
    if (!shell) return;
    const eyeOffset = index === 0 ? 4 : -4;
    const tx = (-smoothPose.yaw * 2.7) + eyeOffset;
    const ty = smoothPose.pitch * 1.8;
    shell.style.transform = `translate3d(calc(-50% + ${tx.toFixed(2)}px), calc(-50% + ${ty.toFixed(2)}px), 0) rotateZ(${(smoothPose.roll * -0.065).toFixed(2)}deg) rotateY(${(smoothPose.yaw * 0.14).toFixed(2)}deg) rotateX(${(smoothPose.pitch * -0.10).toFixed(2)}deg)`;
  });

  if (lookState) {
    const horizontal = smoothPose.yaw > 1 ? 'RIGHT' : smoothPose.yaw < -1 ? 'LEFT' : 'CENTER';
    const vertical = smoothPose.pitch > 1 ? 'UP' : smoothPose.pitch < -1 ? 'DOWN' : '';
    lookState.textContent = `LOOK: ${horizontal}${vertical ? ` + ${vertical}` : ''}`;
  }

  const handAge = lastPointerSampleAt ? Math.min(now - lastPointerSampleAt, 70) : 0;
  const predictedPointer = {
    x: clamp(targetPointer.x + pointerVelocity.x * handAge, 0.03, 0.97),
    y: clamp(targetPointer.y + pointerVelocity.y * handAge, 0.04, 0.96),
  };
  const pointerSpeed = Math.hypot(pointerVelocity.x, pointerVelocity.y) * 1000;
  const p = expSmoothing(dt, pointerSpeed > 0.8 ? 18 : 34);
  smoothPointer.x += (predictedPointer.x - smoothPointer.x) * p;
  smoothPointer.y += (predictedPointer.y - smoothPointer.y) * p;

  cursors.forEach((cursor, index) => {
    if (!cursor) return;
    const size = cursorSizes[index] || cursorSizes[0];
    const px = smoothPointer.x * size.width;
    const py = smoothPointer.y * size.height;
    cursor.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0) translate(-50%, -50%)`;
    cursor.style.opacity = handVisible ? '1' : '0.2';
    cursor.classList.toggle('pinching', pinchDown);
    cursor.classList.toggle('targeted', Boolean(hoveredAction));
  });

  requestAnimationFrame(renderFrame);
}

async function enableMotion() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Motion permission was not granted.');
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Orientation permission was not granted.');
    }

    window.addEventListener('deviceorientation', onOrientation, { capture: true, passive: true });
    window.addEventListener('devicemotion', onMotion, { capture: true, passive: true });
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
  frameRate: { ideal: 30, max: 30 },
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
        frameRate: { ideal: 30, max: 30 },
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
  if (now - lastSelectionAt < 300) return;
  lastSelectionAt = now;
  if (navigator.vibrate) navigator.vibrate(12);

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
      setPanel('SpatialHands VR', `Build ${BUILD_ID}. Gyro prediction is active when HEAD: GYRO is shown.`);
      break;
    case 'home':
    default:
      setPanel('Home', 'Point with your index finger. Touch thumb + index together to click.');
      break;
  }
}

function applyWorkerHand(hand, receivedAt) {
  if (!hand) {
    handVisible = false;
    pinchDown = false;
    wasPinching = false;
    pointerVelocity = { x: 0, y: 0 };
    handState.textContent = 'HAND: SEARCH';
    refreshInteractionTarget();
    return;
  }

  const palmScale = Math.max(distance(hand.wrist, hand.middleMcp), 0.025);
  const pinchRatio = distance(hand.thumbTip, hand.indexTip) / palmScale;
  const nextPinch = pinchDown ? pinchRatio < 0.58 : pinchRatio < 0.36;
  const nextX = clamp(mirrorHand ? 1 - hand.indexTip.x : hand.indexTip.x, 0.03, 0.97);
  const nextY = clamp(hand.indexTip.y, 0.04, 0.96);

  if (lastPointerSampleAt) {
    const sampleDt = Math.max(12, receivedAt - lastPointerSampleAt);
    const measuredVX = clamp((nextX - targetPointer.x) / sampleDt, -0.0035, 0.0035);
    const measuredVY = clamp((nextY - targetPointer.y) / sampleDt, -0.0035, 0.0035);
    pointerVelocity.x = pointerVelocity.x * 0.52 + measuredVX * 0.48;
    pointerVelocity.y = pointerVelocity.y * 0.52 + measuredVY * 0.48;
  }

  targetPointer.x = nextX;
  targetPointer.y = nextY;
  lastPointerSampleAt = receivedAt;
  handVisible = true;
  pinchDown = nextPinch;
  handState.textContent = nextPinch ? 'HAND: PINCH' : 'HAND: LIVE';

  const target = refreshInteractionTarget();
  if (nextPinch && !wasPinching && target) triggerAction(target.dataset.action);
  wasPinching = nextPinch;
}

function initializeHandWorker() {
  if (!window.Worker || !window.createImageBitmap) return false;

  try {
    handWorker = new Worker(new URL('hand-worker.js', import.meta.url), { type: 'module' });
    handWorker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'ready') {
        handWorkerReady = true;
        handState.textContent = 'HAND: READY';
        setGestureGuide('SHOW YOUR INDEX FINGER', 'Then pinch thumb + index to click');
        return;
      }
      if (data.type === 'error') {
        handWorkerReady = false;
        handState.textContent = 'HAND: WORKER ERR';
        return;
      }
      if (data.type === 'frame') {
        handFrameInFlight = false;
        if (Number.isFinite(data.inferenceMs)) {
          handFrameIntervalMs = clamp(Math.round(data.inferenceMs * 1.15), 38, 95);
        }
        applyWorkerHand(data.hand, performance.now());
      }
    };
    handWorker.onerror = () => {
      handWorkerReady = false;
      handFrameInFlight = false;
      handState.textContent = 'HAND: WORKER ERR';
    };
    handWorker.postMessage({ type: 'init' });
    return true;
  } catch (_) {
    handWorker = null;
    return false;
  }
}

async function submitHandFrame(now) {
  if (!handTrackingActive || !handWorkerReady || handFrameInFlight || document.hidden || camera.readyState < 2) return;
  if (now - lastHandSubmitAt < handFrameIntervalMs) return;

  handFrameInFlight = true;
  lastHandSubmitAt = now;
  try {
    let bitmap;
    try {
      bitmap = await createImageBitmap(camera, { resizeWidth: 320, resizeHeight: 180, resizeQuality: 'low' });
    } catch (_) {
      bitmap = await createImageBitmap(camera);
    }
    handWorker.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
  } catch (_) {
    handFrameInFlight = false;
  }
}

function videoFramePump(now) {
  if (!handTrackingActive) return;
  submitHandFrame(now);
  if (typeof camera.requestVideoFrameCallback === 'function') {
    videoFrameHandle = camera.requestVideoFrameCallback(videoFramePump);
  } else {
    setTimeout(() => videoFramePump(performance.now()), 34);
  }
}

async function enableHandTracking() {
  if (!stream) return;
  handState.textContent = 'HAND: STARTING';
  const started = initializeHandWorker();
  if (!started) {
    handState.textContent = 'HAND: UNSUPPORTED';
    setGestureGuide('HAND WORKER UNSUPPORTED', 'Touch controls still work');
    return;
  }
  handTrackingActive = true;
  videoFramePump(performance.now());
}

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
  startStatus.textContent = `Starting real-time build ${BUILD_ID}…`;

  await enableMotion();
  const cameraOkay = await enableCamera();
  if (cameraOkay) await enableHandTracking();
  await requestImmersiveMode();

  startScreen.classList.add('hidden');
  requestAnimationFrame(() => {
    updateCursorSizes();
    recenter();
  });

  setPanel(
    cameraOkay ? 'Real-time mode active' : 'Head tracking active',
    cameraOkay
      ? 'Gyro-first head tracking + worker hand tracking. Point with INDEX, pinch thumb + index to select.'
      : 'Move your head to test tracking. Rear camera is unavailable for hand input.'
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

window.addEventListener('resize', () => requestAnimationFrame(updateCursorSizes), { passive: true });
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    updateCursorSizes();
    recenter();
  }, 180);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    gyroRate = { yaw: 0, pitch: 0, roll: 0 };
  }
});

window.addEventListener('pagehide', () => {
  renderLoopActive = false;
  handTrackingActive = false;
  if (videoFrameHandle && typeof camera.cancelVideoFrameCallback === 'function') camera.cancelVideoFrameCallback(videoFrameHandle);
  handWorker?.terminate();
  stream?.getTracks().forEach((track) => track.stop());
});

requestAnimationFrame(renderFrame);
