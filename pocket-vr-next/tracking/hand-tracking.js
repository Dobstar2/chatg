import { clamp, expSmoothing, v3Lerp } from '../core/math.js';
import { GestureDetector } from './gesture-detector.js';

const SIDES = ['left', 'right'];

function distance2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeLabel(category) {
  const label = (category?.categoryName || category?.displayName || category?.label || '').toLowerCase();
  if (label.includes('left')) return 'left';
  if (label.includes('right')) return 'right';
  return 'unknown';
}

function makeHandState(side) {
  return {
    side,
    tracked: false,
    interacting: false,
    confidence: 0,
    fade: 0,
    lastSeenAt: 0,
    lostSince: 0,
    imageWrist: null,
    depthMeters: 0.55,
    rawDepthMeters: 0.55,
    jointsCamera: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    jointsWorld: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    gesture: {
      name: 'none',
      pinchPhase: 'open',
      pinchStrength: 0,
      pinchSerial: 0,
      fingers: {},
    },
    target: null,
    interactionMode: 'none',
    grabObjectId: null,
    velocity: { x: 0, y: 0, z: 0 },
    previousWristCamera: null,
  };
}

export class HandTrackingManager extends EventTarget {
  constructor(video, cameraManager) {
    super();
    this.video = video;
    this.cameraManager = cameraManager;
    this.landmarker = null;
    this.running = false;
    this.timer = null;
    this.lastVideoTime = -1;
    this.lastInferenceAt = 0;
    this.inferenceIntervalMs = 66;
    this.inferenceMs = 0;
    this.trackingFps = 0;
    this.frameCounter = 0;
    this.fpsWindowStart = performance.now();
    this.gestures = new GestureDetector();
    this.hands = {
      left: makeHandState('left'),
      right: makeHandState('right'),
    };
    this.calibration = {
      palmWidthMeters: 0.085,
      depthScale: 1,
      neutralDepthMeters: 0.55,
    };
  }

  async initialize() {
    if (this.landmarker) {
      this.dispatchEvent(new CustomEvent('status', { detail: 'ready-cached' }));
      return;
    }
    this.dispatchEvent(new CustomEvent('status', { detail: 'loading-model' }));
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    const options = (delegate) => ({
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        ...(delegate ? { delegate } : {}),
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.35,
      minHandPresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    });

    try {
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options('GPU'));
      this.dispatchEvent(new CustomEvent('status', { detail: 'ready-gpu' }));
    } catch (_) {
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options(null));
      this.dispatchEvent(new CustomEvent('status', { detail: 'ready-cpu' }));
    }
  }

  start() {
    if (this.running || !this.landmarker) return;
    this.running = true;
    this._schedule(20);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
  }

  getHands() {
    return this.hands;
  }

  recalibrateHands() {
    const visible = SIDES.map((side) => this.hands[side]).filter((hand) => hand.tracked);
    if (!visible.length) return false;
    const averageRaw = visible.reduce((sum, hand) => sum + hand.rawDepthMeters, 0) / visible.length;
    this.calibration.depthScale = clamp(this.calibration.neutralDepthMeters / Math.max(averageRaw, 0.1), 0.55, 1.8);
    this.dispatchEvent(new CustomEvent('calibrated', { detail: { ...this.calibration } }));
    return true;
  }

  updateLoss(now = performance.now()) {
    for (const side of SIDES) {
      const hand = this.hands[side];
      const age = now - hand.lastSeenAt;
      if (age <= 120) {
        hand.interacting = hand.tracked && !hand.lostSince;
        hand.fade = Math.min(1, hand.fade + 0.2);
      } else if (age <= 420) {
        hand.interacting = false;
        hand.fade = clamp(1 - (age - 120) / 300, 0, 1);
      } else {
        hand.tracked = false;
        hand.interacting = false;
        hand.fade = 0;
        hand.target = null;
        hand.interactionMode = 'none';
        hand.grabObjectId = null;
      }
    }
  }

  _schedule(delay = this.inferenceIntervalMs) {
    clearTimeout(this.timer);
    if (this.running) this.timer = setTimeout(() => this._processFrame(), delay);
  }

  _processFrame() {
    if (!this.running || !this.landmarker) return;
    if (document.hidden || this.video.readyState < 2 || this.video.videoWidth < 2) {
      this._schedule(120);
      return;
    }
    if (this.video.currentTime === this.lastVideoTime) {
      this._schedule(22);
      return;
    }
    this.lastVideoTime = this.video.currentTime;

    const started = performance.now();
    try {
      const result = this.landmarker.detectForVideo(this.video, started);
      this._consumeResult(result, started);
      this.frameCounter += 1;
      const elapsed = started - this.fpsWindowStart;
      if (elapsed >= 1000) {
        this.trackingFps = (this.frameCounter * 1000) / elapsed;
        this.frameCounter = 0;
        this.fpsWindowStart = started;
      }
    } catch (error) {
      this.dispatchEvent(new CustomEvent('error', { detail: error }));
    }

    this.inferenceMs = performance.now() - started;
    this.inferenceIntervalMs = clamp(Math.round(this.inferenceMs * 1.35 + 22), 48, 110);
    this._schedule(this.inferenceIntervalMs);
  }

  _consumeResult(result, now) {
    const handednessGroups = result.handednesses || result.handedness || [];
    const detections = (result.landmarks || []).map((landmarks, index) => {
      const categories = handednessGroups[index] || [];
      const category = categories[0] || {};
      return {
        landmarks,
        worldLandmarks: result.worldLandmarks?.[index] || null,
        label: normalizeLabel(category),
        score: Number.isFinite(category.score) ? category.score : 0.5,
        wrist: { x: landmarks[0].x, y: landmarks[0].y },
      };
    });

    const assignments = this._assignDetections(detections, now);
    const assignedSides = new Set();
    for (const { side, detection } of assignments) {
      assignedSides.add(side);
      this._updateHand(this.hands[side], detection, now);
    }

    for (const side of SIDES) {
      if (!assignedSides.has(side)) {
        const hand = this.hands[side];
        if (!hand.lostSince) hand.lostSince = now;
        hand.interacting = false;
        hand.target = null;
        hand.interactionMode = 'none';
        this.gestures.reset(side);
      }
    }

    this.updateLoss(now);
    this.dispatchEvent(new CustomEvent('frame', { detail: this.hands }));
  }

  _assignDetections(detections, now) {
    if (!detections.length) return [];
    const cost = (side, detection) => {
      const hand = this.hands[side];
      let value = 0;
      if (detection.label !== 'unknown' && detection.label !== side) value += 0.9 * detection.score;
      if (hand.imageWrist && now - hand.lastSeenAt < 650) {
        value += distance2(hand.imageWrist, detection.wrist) * 2.2;
      } else {
        const expectedX = side === 'left' ? 0.35 : 0.65;
        value += Math.abs(detection.wrist.x - expectedX) * 0.25;
      }
      return value;
    };

    if (detections.length === 1) {
      const detection = detections[0];
      const leftCost = cost('left', detection);
      const rightCost = cost('right', detection);
      return [{ side: leftCost <= rightCost ? 'left' : 'right', detection }];
    }

    const a = detections[0];
    const b = detections[1];
    const direct = cost('left', a) + cost('right', b);
    const swapped = cost('left', b) + cost('right', a);
    return direct <= swapped
      ? [{ side: 'left', detection: a }, { side: 'right', detection: b }]
      : [{ side: 'left', detection: b }, { side: 'right', detection: a }];
  }

  _updateHand(hand, detection, now) {
    const landmarks = detection.landmarks;
    const videoWidth = Math.max(1, this.video.videoWidth);
    const videoHeight = Math.max(1, this.video.videoHeight);
    const hFov = this.cameraManager.horizontalFovDeg * Math.PI / 180;
    const vFov = 2 * Math.atan(Math.tan(hFov / 2) / (videoWidth / videoHeight));
    const palmPixels = Math.max(8, distance2(landmarks[5], landmarks[17]) * videoWidth);
    const focalPixels = videoWidth / (2 * Math.tan(hFov / 2));
    const rawDepth = clamp((focalPixels * this.calibration.palmWidthMeters) / palmPixels, 0.22, 1.45);
    const depth = clamp(rawDepth * this.calibration.depthScale, 0.22, 1.45);

    const elapsed = hand.lastSeenAt ? now - hand.lastSeenAt : 66;
    const depthAlpha = expSmoothing(elapsed, Math.abs(depth - hand.depthMeters) > 0.18 ? 55 : 85);
    hand.rawDepthMeters = rawDepth;
    hand.depthMeters += (depth - hand.depthMeters) * depthAlpha;

    const frameWidthMeters = 2 * hand.depthMeters * Math.tan(hFov / 2);
    const frameHeightMeters = 2 * hand.depthMeters * Math.tan(vFov / 2);
    const jointAlpha = expSmoothing(elapsed, 42);
    const nextJoints = landmarks.map((landmark) => {
      const zOffset = clamp(-landmark.z * frameWidthMeters, -0.16, 0.16);
      return {
        x: (landmark.x - 0.5) * frameWidthMeters,
        y: -(landmark.y - 0.5) * frameHeightMeters,
        z: -hand.depthMeters + zOffset,
      };
    });

    const previousWrist = hand.jointsCamera[0];
    for (let i = 0; i < 21; i += 1) {
      hand.jointsCamera[i] = v3Lerp(hand.jointsCamera[i], nextJoints[i], jointAlpha);
    }
    const dtSeconds = Math.max(0.016, elapsed / 1000);
    hand.velocity = {
      x: (hand.jointsCamera[0].x - previousWrist.x) / dtSeconds,
      y: (hand.jointsCamera[0].y - previousWrist.y) / dtSeconds,
      z: (hand.jointsCamera[0].z - previousWrist.z) / dtSeconds,
    };

    hand.gesture = this.gestures.process(hand.side, landmarks);
    hand.confidence = detection.score;
    hand.imageWrist = detection.wrist;
    hand.lastSeenAt = now;
    hand.lostSince = 0;
    hand.tracked = true;
    hand.interacting = true;
    hand.fade = Math.max(hand.fade, 0.35);
  }
}
