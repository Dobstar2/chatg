const BUILD_ID = 'v0.8.0';
const BUILD_TIME = '10 Aug 2026 17:32 BST';

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
const handCanvases = worlds.map((world) => world.querySelector('.hand-layer'));
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

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];
const PALM = [0,1,5,9,13,17];

let baselineQuat = null;
let currentQuat = null;
let targetPose = { yaw: 0, pitch: 0, roll: 0 };
let smoothPose = { yaw: 0, pitch: 0, roll: 0 };
let motionEnabled = false;
let lastFrameAt = 0;
let renderLoopActive = true;

let stream = null;
let handLandmarker = null;
let handTrackingActive = false;
let handTimer = null;
let lastVideoTime = -1;
let lastHandSeenAt = 0;
let handIntervalMs = 78;

let targetHand = null;
let smoothHand = null;
let handVisible = false;
let handOpacity = 0;

let targetPointer = { x: 0.5, y: 0.5 };
let smoothPointer = { x: 0.5, y: 0.5 };
let pointerVelocity = { x: 0, y: 0 };
let lastPointerSampleAt = 0;
let pinchDown = false;
let wasPinching = false;
let mirrorHand = false;
let passthrough = false;
let hoveredAction = null;
let lastSelectionAt = 0;
let lastHitTestAt = 0;
let overlaySizes = worlds.map(() => ({ width: 1, height: 1, dpr: 1 }));

function setPanel(title, message) {
  worlds.forEach((world) => {
    const panel = world.querySelector('[data-panel="message"]');
    if (panel) panel.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  });
}

function setGestureGuide(state, target = '') {
  gestureStates.forEach((node) => { if (node) node.textContent = state; });
  targetStates.forEach((node) => { if (node) node.textContent = target; });
}

function qNormalize(q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function qMultiply(a, b) {
  return {
    x: a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
    y: a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
    z: a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w,
    w: a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
  };
}

function qConjugate(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function qAxisAngle(x, y, z, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: x*s, y: y*s, z: z*s, w: Math.cos(half) };
}

function qFromEulerYXZ(x, y, z) {
  const c1 = Math.cos(x/2), c2 = Math.cos(y/2), c3 = Math.cos(z/2);
  const s1 = Math.sin(x/2), s2 = Math.sin(y/2), s3 = Math.sin(z/2);
  return {
    x: s1*c2*c3 + c1*s2*s3,
    y: c1*s2*c3 - s1*c2*s3,
    z: c1*c2*s3 - s1*s2*c3,
    w: c1*c2*c3 + s1*s2*s3,
  };
}

function qRotateVector(q, v) {
  const qv = { x: v.x, y: v.y, z: v.z, w: 0 };
  const r = qMultiply(qMultiply(q, qv), qConjugate(q));
  return { x: r.x, y: r.y, z: r.z };
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
    yaw: clamp(Math.atan2(-forward.x, -forward.z) * RAD, -50, 50),
    pitch: clamp(Math.asin(clamp(forward.y, -1, 1)) * RAD, -38, 38),
    roll: clamp(Math.atan2(up.x, up.y) * RAD, -26, 26),
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

  if (!motionEnabled) {
    motionEnabled = true;
    motionState.textContent = 'HEAD: LIVE';
  }
}

async function enableMotion() {
  try {
    const requests = [];
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      requests.push(DeviceMotionEvent.requestPermission());
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      requests.push(DeviceOrientationEvent.requestPermission());
    }

    const results = await Promise.all(requests);
    if (results.some((result) => result !== 'granted')) {
      throw new Error('Motion and orientation permission are required.');
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

async function openRearByFacingMode() {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { exact: 'environment' },
      width: { ideal: 480, max: 640 },
      height: { ideal: 270, max: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
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
        width: { ideal: 480, max: 640 },
        height: { ideal: 270, max: 480 },
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

  if (isDefinitelyFrontTrack(initial.getVideoTracks()[0])) {
    initial.getTracks().forEach((track) => track.stop());
    return openRearByFacingMode();
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
    if (!track || isDefinitelyFrontTrack(track)) throw new Error('Rear camera required.');

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
    setPanel('Rear camera unavailable', 'SpatialHands only uses a rear camera.');
    return false;
  }
}

async function createLandmarker(vision, fileset, useGpu) {
  return vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      ...(useGpu ? { delegate: 'GPU' } : {}),
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.38,
    minHandPresenceConfidence: 0.38,
    minTrackingConfidence: 0.38,
  });
}

async function enableHandTracking() {
  if (!stream) return;

  try {
    handState.textContent = 'HAND: LOADING';
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    try {
      handLandmarker = await createLandmarker(vision, fileset, true);
      handState.textContent = 'HAND: GPU';
    } catch (_) {
      handLandmarker = await createLandmarker(vision, fileset, false);
      handState.textContent = 'HAND: CPU';
    }

    handTrackingActive = true;
    setGestureGuide('SHOW ONE HAND', 'INDEX = POINTER · PINCH = CLICK');
    scheduleHandFrame(50);
  } catch (error) {
    handState.textContent = 'HAND: ERROR';
    setGestureGuide('HAND TRACKER FAILED', 'Reload and allow camera access');
    setPanel('Hand tracking error', error?.message || 'The hand model could not start.');
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mapHandX(x) {
  const mapped = mirrorHand ? 1 - x : x;
  return clamp(0.5 + (mapped - 0.5) * 1.35, 0.02, 0.98);
}

function mapHandY(y) {
  return clamp(0.5 + (y - 0.5) * 1.3, 0.02, 0.98);
}

function updatePointerFromLandmarks(landmarks, now) {
  const indexTip = landmarks[8];
  const next = { x: mapHandX(indexTip.x), y: mapHandY(indexTip.y) };

  if (lastPointerSampleAt) {
    const dt = Math.max(16, now - lastPointerSampleAt);
    pointerVelocity.x = (next.x - targetPointer.x) / dt;
    pointerVelocity.y = (next.y - targetPointer.y) / dt;
  }

  targetPointer = next;
  lastPointerSampleAt = now;
}

function processDetectedHand(landmarks, now) {
  targetHand = landmarks.map((point) => ({ x: point.x, y: point.y }));
  if (!smoothHand) smoothHand = targetHand.map((point) => ({ ...point }));

  updatePointerFromLandmarks(landmarks, now);
  lastHandSeenAt = now;
  handVisible = true;

  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const palmScale = Math.max(distance(wrist, middleMcp), 0.025);
  const pinchRatio = distance(thumbTip, indexTip) / palmScale;
  const nextPinch = pinchDown ? pinchRatio < 0.58 : pinchRatio < 0.36;

  pinchDown = nextPinch;
  handState.textContent = nextPinch ? 'HAND: PINCH' : 'HAND: LIVE';

  if (nextPinch && !wasPinching && hoveredAction) {
    triggerAction(hoveredAction);
  }
  wasPinching = nextPinch;
}

function scheduleHandFrame(delay = handIntervalMs) {
  clearTimeout(handTimer);
  if (handTrackingActive) handTimer = setTimeout(processHandFrame, delay);
}

function processHandFrame() {
  if (!handTrackingActive || !handLandmarker) return;

  if (document.hidden || camera.readyState < 2) {
    scheduleHandFrame(130);
    return;
  }

  if (camera.currentTime === lastVideoTime) {
    scheduleHandFrame(28);
    return;
  }
  lastVideoTime = camera.currentTime;

  const started = performance.now();
  try {
    const result = handLandmarker.detectForVideo(camera, started);
    const landmarks = result.landmarks?.[0];

    if (landmarks) {
      processDetectedHand(landmarks, started);
    } else if (started - lastHandSeenAt > 220) {
      handVisible = false;
      pinchDown = false;
      wasPinching = false;
      handState.textContent = 'HAND: SEARCH';
      setGestureGuide('SHOW ONE HAND', 'INDEX = POINTER · PINCH = CLICK');
    }
  } catch (_) {
    handState.textContent = 'HAND: RETRY';
  }

  const workMs = performance.now() - started;
  handIntervalMs = clamp(Math.round(workMs * 1.7 + 38), 62, 120);
  scheduleHandFrame(handIntervalMs);
}

function resizeOverlays() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  overlaySizes = handCanvases.map((canvas, index) => {
    const world = worlds[index];
    const width = Math.max(1, world.clientWidth);
    const height = Math.max(1, world.clientHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    return { width, height, dpr };
  });
}

function handPoint(point, size) {
  const x = mapHandX(point.x) * size.width;
  const y = mapHandY(point.y) * size.height;
  return { x, y };
}

function drawHand(canvas, size, alpha) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  if (!smoothHand || alpha < 0.02) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const palmPoints = PALM.map((index) => handPoint(smoothHand[index], size));
  ctx.beginPath();
  palmPoints.forEach((p, index) => index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = 'rgba(116, 246, 194, 0.16)';
  ctx.fill();

  ctx.strokeStyle = 'rgba(116, 246, 194, 0.78)';
  ctx.lineWidth = 7;
  HAND_CONNECTIONS.forEach(([a, b]) => {
    const p1 = handPoint(smoothHand[a], size);
    const p2 = handPoint(smoothHand[b], size);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(230, 255, 247, 0.92)';
  smoothHand.forEach((point, index) => {
    const p = handPoint(point, size);
    ctx.beginPath();
    ctx.arc(p.x, p.y, index === 8 ? 5.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();
  });

  const tip = handPoint(smoothHand[8], size);
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function buttonUnderLeftCursor() {
  if (!handVisible || !cursors[0]) return null;
  const rect = cursors[0].getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const element = document.elementFromPoint(x, y);
  return element?.closest?.('button[data-action]') || null;
}

function updateInteraction(now) {
  if (now - lastHitTestAt < 32) return;
  lastHitTestAt = now;

  const target = buttonUnderLeftCursor();
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
    setGestureGuide('SHOW ONE HAND', 'INDEX = POINTER · PINCH = CLICK');
  } else if (pinchDown) {
    setGestureGuide('✓ PINCH DETECTED', target ? `CLICK ${target.textContent.trim()}` : 'Move ring onto a tile');
  } else if (target) {
    setGestureGuide('👌 PINCH TO CLICK', target.textContent.trim());
  } else {
    setGestureGuide('☝ INDEX CONTROLS RING', 'Move green ring onto a tile');
  }
}

function triggerAction(action) {
  const now = performance.now();
  if (now - lastSelectionAt < 350) return;
  lastSelectionAt = now;
  if (navigator.vibrate) navigator.vibrate(18);

  switch (action) {
    case 'passthrough':
      passthrough = !passthrough;
      document.body.classList.toggle('passthrough', passthrough);
      setPanel('Passthrough', passthrough ? 'Rear camera view enabled.' : 'Virtual background restored.');
      break;
    case 'settings':
      mirrorHand = !mirrorHand;
      setPanel('Hand direction', mirrorHand ? 'Pointer direction flipped.' : 'Pointer direction set to camera direction.');
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
      setPanel('SpatialHands VR', `Build ${BUILD_ID}. Green ring = index fingertip. Thumb + index pinch = click.`);
      break;
    case 'home':
    default:
      setPanel('Home', 'Use your index fingertip to move the green ring. Pinch thumb + index to click.');
      break;
  }
}

function renderFrame(now) {
  if (!renderLoopActive) return;
  const dt = clamp(lastFrameAt ? now - lastFrameAt : 16.7, 7, 40);
  lastFrameAt = now;

  if (motionEnabled && baselineQuat) {
    const h = expSmoothing(dt, 20);
    smoothPose.yaw += (targetPose.yaw - smoothPose.yaw) * h;
    smoothPose.pitch += (targetPose.pitch - smoothPose.pitch) * h;
    smoothPose.roll += (targetPose.roll - smoothPose.roll) * h;

    shells.forEach((shell, index) => {
      const eyeOffset = index === 0 ? 4 : -4;
      const tx = (-smoothPose.yaw * 3.25) + eyeOffset;
      const ty = smoothPose.pitch * 2.1;
      shell.style.transform = `translate3d(calc(-50% + ${tx.toFixed(2)}px), calc(-50% + ${ty.toFixed(2)}px), 0) rotateZ(${(-smoothPose.roll * 0.08).toFixed(2)}deg) rotateY(${(smoothPose.yaw * 0.16).toFixed(2)}deg) rotateX(${(-smoothPose.pitch * 0.11).toFixed(2)}deg)`;
    });

    if (lookState) {
      const horizontal = smoothPose.yaw > 1 ? 'RIGHT' : smoothPose.yaw < -1 ? 'LEFT' : 'CENTER';
      const vertical = smoothPose.pitch > 1 ? 'UP' : smoothPose.pitch < -1 ? 'DOWN' : '';
      lookState.textContent = `LOOK: ${horizontal}${vertical ? ` + ${vertical}` : ''}`;
    }
  }

  if (targetHand && smoothHand) {
    const a = expSmoothing(dt, 46);
    for (let i = 0; i < smoothHand.length; i += 1) {
      smoothHand[i].x += (targetHand[i].x - smoothHand[i].x) * a;
      smoothHand[i].y += (targetHand[i].y - smoothHand[i].y) * a;
    }
  }

  handOpacity += ((handVisible ? 1 : 0) - handOpacity) * expSmoothing(dt, handVisible ? 55 : 110);

  const age = lastPointerSampleAt ? Math.min(now - lastPointerSampleAt, 80) : 0;
  const predictedPointer = {
    x: clamp(targetPointer.x + pointerVelocity.x * age, 0.02, 0.98),
    y: clamp(targetPointer.y + pointerVelocity.y * age, 0.02, 0.98),
  };
  const p = expSmoothing(dt, 30);
  smoothPointer.x += (predictedPointer.x - smoothPointer.x) * p;
  smoothPointer.y += (predictedPointer.y - smoothPointer.y) * p;

  worlds.forEach((world, index) => {
    const size = overlaySizes[index];
    const cursor = cursors[index];
    const px = smoothPointer.x * size.width;
    const py = smoothPointer.y * size.height;
    cursor.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`;
    cursor.style.opacity = handVisible ? '1' : '0.18';
    cursor.classList.toggle('pinching', pinchDown);
    cursor.classList.toggle('targeted', Boolean(hoveredAction));
    drawHand(handCanvases[index], size, handOpacity);
  });

  updateInteraction(now);
  requestAnimationFrame(renderFrame);
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
  startStatus.textContent = `Starting ${BUILD_ID}…`;

  await enableMotion();
  const cameraOkay = await enableCamera();
  if (cameraOkay) await enableHandTracking();
  await requestImmersiveMode();

  startScreen.classList.add('hidden');
  requestAnimationFrame(() => {
    resizeOverlays();
    recenter();
  });

  setPanel(
    cameraOkay ? 'Tracking active' : 'Head tracking active',
    cameraOkay
      ? 'Green hand = detected hand. Green ring = index fingertip. Pinch thumb + index to click.'
      : 'Rear camera unavailable, so hand control is disabled.'
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

window.addEventListener('resize', () => requestAnimationFrame(resizeOverlays), { passive: true });
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    resizeOverlays();
    if (currentQuat) recenter();
  }, 220);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && handTrackingActive) scheduleHandFrame(40);
});

window.addEventListener('pagehide', () => {
  renderLoopActive = false;
  handTrackingActive = false;
  clearTimeout(handTimer);
  stream?.getTracks().forEach((track) => track.stop());
});

resizeOverlays();
requestAnimationFrame(renderFrame);
