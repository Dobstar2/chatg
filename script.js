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

let baseline = null;
let latestOrientation = { alpha: 0, beta: 0, gamma: 0 };
let motionEnabled = false;
let stream = null;
let handLandmarker = null;
let handLoopActive = false;
let lastHandTime = 0;
let pointer = { x: 0.5, y: 0.5 };
let smoothedPointer = { x: 0.5, y: 0.5 };
let pinchDown = false;
let mirrorHand = true;
let passthrough = false;
let lastSelectionAt = 0;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const angleDelta = (a, b) => ((a - b + 540) % 360) - 180;

function setPanel(title, message) {
  worlds.forEach((world) => {
    const panel = world.querySelector('[data-panel="message"]');
    if (!panel) return;
    panel.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  });
}

function recenter() {
  baseline = { ...latestOrientation };
  setPanel('Recentered', 'Forward direction reset to your current head position.');
}

function renderHeadPose() {
  if (!motionEnabled || !baseline) return;

  const yaw = clamp(angleDelta(latestOrientation.alpha, baseline.alpha), -38, 38);
  const pitch = clamp(latestOrientation.beta - baseline.beta, -28, 28);
  const roll = clamp(latestOrientation.gamma - baseline.gamma, -22, 22);

  worlds.forEach((world) => {
    const shell = world.querySelector('.shell');
    const eyeOffset = world.dataset.eye === 'left' ? 4 : -4;
    const tx = (-yaw * 2.1) + eyeOffset;
    const ty = pitch * 1.45;
    shell.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotateZ(${roll * -0.08}deg) rotateY(${yaw * 0.12}deg) rotateX(${pitch * -0.09}deg)`;
  });
}

function onOrientation(event) {
  latestOrientation = {
    alpha: Number.isFinite(event.alpha) ? event.alpha : 0,
    beta: Number.isFinite(event.beta) ? event.beta : 0,
    gamma: Number.isFinite(event.gamma) ? event.gamma : 0,
  };
  if (!baseline) baseline = { ...latestOrientation };
  motionEnabled = true;
  motionState.textContent = 'HEAD: ON';
  renderHeadPose();
}

async function enableMotion() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Motion permission was not granted.');
    }
    window.addEventListener('deviceorientation', onOrientation, true);
    motionState.textContent = 'HEAD: READY';
  } catch (error) {
    motionState.textContent = 'HEAD: BLOCKED';
    setPanel('Head tracking unavailable', error.message || 'Motion access is blocked.');
  }
}

async function selectBestRearCamera() {
  // Open once so iOS can expose camera labels, then prefer an ultra-wide/0.5x-like device if the browser exposes one.
  const initial = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter((device) => device.kind === 'videoinput');
  const preferred = videoDevices.find((device) => /ultra|0\.5|triple|back.*wide/i.test(device.label));

  if (!preferred) return initial;

  initial.getTracks().forEach((track) => track.stop());
  return navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: preferred.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}

async function enableCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraState.textContent = 'CAMERA: UNSUPPORTED';
    return false;
  }

  try {
    stream = await selectBestRearCamera();
    camera.srcObject = stream;
    await camera.play();

    const track = stream.getVideoTracks()[0];
    const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    if (caps.zoom && typeof track.applyConstraints === 'function') {
      try {
        await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
      } catch (_) {
        // Some iOS/Safari camera tracks expose zoom metadata but reject manual zoom constraints.
      }
    }

    const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
    const label = track.label || 'rear camera';
    cameraState.textContent = `CAMERA: ${/ultra|0\.5/i.test(label) ? '0.5X' : 'REAR'}`;
    camera.dataset.width = settings.width || camera.videoWidth;
    camera.dataset.height = settings.height || camera.videoHeight;
    return true;
  } catch (error) {
    cameraState.textContent = 'CAMERA: BLOCKED';
    setPanel('Camera unavailable', 'Allow camera access in Safari, then reload the page.');
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
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });

    handState.textContent = 'HAND: READY';
    handLoopActive = true;
    requestAnimationFrame(handLoop);
  } catch (error) {
    handState.textContent = 'HAND: FALLBACK';
    setPanel('Hand model unavailable', 'Head tracking still works. Touch controls remain available.');
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function updatePointer(x, y, isPinching) {
  pointer.x = clamp(x, 0.04, 0.96);
  pointer.y = clamp(y, 0.05, 0.95);
  const smoothing = 0.34;
  smoothedPointer.x += (pointer.x - smoothedPointer.x) * smoothing;
  smoothedPointer.y += (pointer.y - smoothedPointer.y) * smoothing;

  worlds.forEach((world) => {
    const cursor = world.querySelector('.cursor');
    cursor.style.left = `${smoothedPointer.x * 100}%`;
    cursor.style.top = `${smoothedPointer.y * 100}%`;
    cursor.classList.toggle('pinching', isPinching);
  });

  updateHover();
}

function buttonAtPointer() {
  const leftEye = document.getElementById('leftEye');
  const rect = leftEye.getBoundingClientRect();
  const px = rect.left + smoothedPointer.x * rect.width;
  const py = rect.top + smoothedPointer.y * rect.height;
  const buttons = [...leftEye.querySelectorAll('button[data-action]')];
  return buttons.find((button) => {
    const r = button.getBoundingClientRect();
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  }) || null;
}

function updateHover() {
  const hovered = buttonAtPointer();
  const action = hovered?.dataset.action;
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

  if (navigator.vibrate) navigator.vibrate(25);

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
      setPanel('Browser', 'Web surface selected. This prototype keeps navigation inside the spatial shell.');
      break;
    case 'media':
      setPanel('Media', 'Media surface selected. Touch or pinch another tile to continue.');
      break;
    case 'info':
      setPanel('SpatialHands VR', 'Stereo web prototype using iPhone motion sensors plus on-device browser hand landmarks.');
      break;
    case 'home':
    default:
      setPanel('Home', 'Look around, point with your index finger, and pinch to select.');
      break;
  }
}

async function handLoop(now) {
  if (!handLoopActive) return;

  if (handLandmarker && camera.readyState >= 2 && now - lastHandTime > 42) {
    lastHandTime = now;
    try {
      const result = handLandmarker.detectForVideo(camera, now);
      const landmarks = result.landmarks?.[0];
      if (landmarks) {
        const wrist = landmarks[0];
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleMcp = landmarks[9];
        const palmScale = Math.max(distance(wrist, middleMcp), 0.025);
        const pinchRatio = distance(thumbTip, indexTip) / palmScale;
        const nextPinch = pinchDown ? pinchRatio < 0.56 : pinchRatio < 0.38;

        const x = mirrorHand ? 1 - indexTip.x : indexTip.x;
        updatePointer(x, indexTip.y, nextPinch);
        handState.textContent = nextPinch ? 'HAND: PINCH' : 'HAND: ON';

        if (nextPinch && !pinchDown) {
          const target = buttonAtPointer();
          if (target) triggerAction(target.dataset.action);
        }
        pinchDown = nextPinch;
      } else {
        handState.textContent = 'HAND: SEARCH';
        pinchDown = false;
      }
    } catch (_) {
      // Keep the render loop alive if one camera frame cannot be processed.
    }
  }

  requestAnimationFrame(handLoop);
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
  startStatus.textContent = 'Starting motion, camera and hand tracking…';

  await enableMotion();
  const cameraOkay = await enableCamera();
  if (cameraOkay) await enableHandTracking();
  await requestFullscreenAndLandscape();

  startScreen.classList.add('hidden');
  setPanel('SpatialHands active', 'Move your head to look, then point and pinch. Use ◎ to recenter.');
}

startButton.addEventListener('click', startVR);
recenterButton.addEventListener('click', recenter);

worlds.forEach((world) => {
  world.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) triggerAction(button.dataset.action);
  });
});

window.addEventListener('pagehide', () => {
  handLoopActive = false;
  stream?.getTracks().forEach((track) => track.stop());
});
