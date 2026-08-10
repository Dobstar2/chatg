import {
  clamp,
  v3Add,
  v3Cross,
  v3Distance,
  v3Normalize,
  v3Scale,
  v3Sub,
} from '../core/math.js';
import {
  AdaptiveVec3Filter,
  RobustDepthFilter,
  VelocityEstimator,
  median,
} from './filters-v020.js';
import { GestureDetectorV2 } from './gesture-detector-v020.js';

const SIDES = ['left', 'right'];
const PALM_IDS = [0, 5, 9, 13, 17];
const TIP_IDS = new Set([4, 8, 12, 16, 20]);
const ROOT_IDS = new Set([0, 5, 9, 13, 17]);

function distance2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function pixelDistance(a, b, width, height) {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

function averagePoints(points) {
  const count = Math.max(1, points.length);
  return points.reduce((sum, point) => ({
    x: sum.x + point.x / count,
    y: sum.y + point.y / count,
    z: sum.z + (point.z || 0) / count,
  }), { x: 0, y: 0, z: 0 });
}

function normalizeLabel(category) {
  const label = (category?.categoryName || category?.displayName || category?.label || '').toLowerCase();
  if (label.includes('left')) return 'left';
  if (label.includes('right')) return 'right';
  return 'unknown';
}

function qualityLabel(score, tracked) {
  if (!tracked) return 'Lost';
  if (score >= 0.78) return 'Excellent';
  if (score >= 0.58) return 'Good';
  if (score >= 0.40) return 'Limited';
  return 'Lost';
}

function makeJointFilter(index) {
  if (TIP_IDS.has(index)) {
    return new AdaptiveVec3Filter({
      xy: { minCutoff: 2.15, beta: 0.62, derivativeCutoff: 1.5 },
      z: { minCutoff: 1.05, beta: 0.34, derivativeCutoff: 1.0 },
    });
  }
  if (ROOT_IDS.has(index)) {
    return new AdaptiveVec3Filter({
      xy: { minCutoff: 1.10, beta: 0.34, derivativeCutoff: 1.0 },
      z: { minCutoff: 0.72, beta: 0.20, derivativeCutoff: 0.8 },
    });
  }
  return new AdaptiveVec3Filter({
    xy: { minCutoff: 1.55, beta: 0.46, derivativeCutoff: 1.2 },
    z: { minCutoff: 0.88, beta: 0.26, derivativeCutoff: 0.9 },
  });
}

function makeCalibration() {
  return {
    ready: false,
    palmWidthMeters: 0.085,
    palmLengthMeters: 0.090,
    samples: [],
  };
}

function makeHandState(side) {
  return {
    side,
    tracked: false,
    interacting: false,
    interactionSafe: false,
    confidence: 0,
    handednessConfidence: 0,
    quality: 'Lost',
    fade: 0,
    lastSeenAt: 0,
    lostSince: 0,
    imageWrist: null,
    imageVelocity: { x: 0, y: 0 },
    rawDepthMeters: 0.55,
    depthMeters: 0.55,
    filteredDepthMeters: 0.55,
    handScale: 1,
    rawLandmarksImage: null,
    rawWorldLandmarks: null,
    rawJointsCamera: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    filteredJointsCamera: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    jointsInteractionCamera: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    jointsCamera: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    rawJointsWorld: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    jointsInteractionWorld: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    jointsWorld: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: -0.55 })),
    localJoints: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
    rootTransform: {
      position: { x: 0, y: 0, z: -0.55 },
      side: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      forward: { x: 0, y: 0, z: 1 },
      scale: 1,
    },
    rayOriginCamera: { x: 0, y: 0, z: -0.55 },
    rayDirectionCamera: { x: 0, y: 0, z: -1 },
    rayOriginWorld: { x: 0, y: 0, z: -0.55 },
    rayDirectionWorld: { x: 0, y: 0, z: -1 },
    gesture: {
      name: 'none',
      pinchPhase: 'open',
      pinchStrength: 0,
      pinchRatio: 1,
      pinchSerial: 0,
      fingers: {},
    },
    target: null,
    reticleState: 'NO TARGET',
    interactionMode: 'none',
    interactionState: 'UNTRACKED',
    grabObjectId: null,
    velocity: { x: 0, y: 0, z: 0 },
    velocityWorld: { x: 0, y: 0, z: 0 },
    jointVelocities: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
    filters: Array.from({ length: 21 }, (_, index) => makeJointFilter(index)),
    depthFilter: new RobustDepthFilter(),
    velocityEstimator: new VelocityEstimator({ windowSize: 5, maxSpeed: 3.0 }),
    rayOriginFilter: new AdaptiveVec3Filter({
      xy: { minCutoff: 1.25, beta: 0.34, derivativeCutoff: 1.0 },
      z: { minCutoff: 0.8, beta: 0.22, derivativeCutoff: 0.8 },
    }),
    rayDirectionFilter: new AdaptiveVec3Filter({
      xy: { minCutoff: 1.0, beta: 0.30, derivativeCutoff: 1.0 },
      z: { minCutoff: 1.0, beta: 0.30, derivativeCutoff: 1.0 },
    }),
    calibration: makeCalibration(),
    previousFiltered: null,
  };
}

export class HandTrackingManagerV2 extends EventTarget {
  constructor(video, cameraManager) {
    super();
    this.video = video;
    this.cameraManager = cameraManager;
    this.landmarker = null;
    this.running = false;
    this.paused = false;
    this.frameCallbackId = null;
    this.timer = null;
    this.lastVideoTime = -1;
    this.lastModelTimestamp = 0;
    this.lastInferenceAt = 0;
    this.inferenceIntervalMs = 50;
    this.gestures = new GestureDetectorV2();
    this.hands = { left: makeHandState('left'), right: makeHandState('right') };
    this.metrics = {
      model: '@mediapipe/tasks-vision HandLandmarker 0.10.14',
      trackingFps: 0,
      inferenceMs: 0,
      frameFreshnessMs: 0,
      estimatedTrackingLatencyMs: 0,
      droppedTrackingFrames: 0,
      completedFrames: 0,
      frameCounter: 0,
      fpsWindowStart: performance.now(),
      lastFrameCallbackAt: 0,
      lastInferenceCompletedAt: 0,
      cameraResolution: '0x0',
    };
    this.lastPresentedFrames = null;
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
  }

  start() {
    if (this.running || !this.landmarker) return;
    this.running = true;
    this.paused = false;
    this.lastVideoTime = -1;
    this._scheduleFreshFrame();
  }

  stop() {
    this.running = false;
    this.paused = false;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.frameCallbackId != null && typeof this.video.cancelVideoFrameCallback === 'function') {
      try { this.video.cancelVideoFrameCallback(this.frameCallbackId); } catch (_) {}
    }
    this.frameCallbackId = null;
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    clearTimeout(this.timer);
    if (this.frameCallbackId != null && typeof this.video.cancelVideoFrameCallback === 'function') {
      try { this.video.cancelVideoFrameCallback(this.frameCallbackId); } catch (_) {}
    }
    this.frameCallbackId = null;
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.lastVideoTime = -1;
    this.lastInferenceAt = 0;
    this._scheduleFreshFrame();
  }

  getHands() {
    return this.hands;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  recalibrateHands() {
    const visible = SIDES.filter((side) => this.hands[side].tracked);
    if (!visible.length) return false;
    for (const side of visible) {
      this.hands[side].calibration.ready = false;
      this.hands[side].calibration.samples = [];
      this.hands[side].interactionState = 'CALIBRATING';
      this.hands[side].interacting = false;
    }
    this.dispatchEvent(new CustomEvent('calibration-start', { detail: { sides: visible } }));
    return true;
  }

  sampleForRender(now = performance.now()) {
    this.updateLoss(now);
    for (const side of SIDES) {
      const hand = this.hands[side];
      const predictionMs = hand.interactionSafe
        ? clamp(now - hand.lastSeenAt, 0, 32)
        : 0;
      const predictionSeconds = predictionMs / 1000;

      for (let i = 0; i < 21; i += 1) {
        const base = hand.filteredJointsCamera[i];
        const velocity = hand.jointVelocities[i];
        const amount = TIP_IDS.has(i) ? 1 : (ROOT_IDS.has(i) ? 0.55 : 0.75);
        const maxPrediction = TIP_IDS.has(i) ? 0.035 : 0.025;
        const predictedDelta = {
          x: clamp(velocity.x * predictionSeconds * amount, -maxPrediction, maxPrediction),
          y: clamp(velocity.y * predictionSeconds * amount, -maxPrediction, maxPrediction),
          z: clamp(velocity.z * predictionSeconds * amount, -maxPrediction, maxPrediction),
        };
        hand.jointsCamera[i] = v3Add(base, predictedDelta);
        hand.jointsInteractionCamera[i] = { ...base };
      }
    }
    return this.hands;
  }

  updateLoss(now = performance.now()) {
    for (const side of SIDES) {
      const hand = this.hands[side];
      const age = now - hand.lastSeenAt;
      if (age <= 105) {
        hand.fade = Math.min(1, hand.fade + 0.22);
      } else if (age <= 360) {
        hand.interactionSafe = false;
        hand.interacting = false;
        hand.target = null;
        hand.reticleState = 'DISABLED';
        hand.fade = clamp(1 - (age - 105) / 255, 0, 1);
      } else {
        hand.tracked = false;
        hand.interactionSafe = false;
        hand.interacting = false;
        hand.fade = 0;
        hand.target = null;
        hand.reticleState = 'DISABLED';
        hand.interactionMode = 'none';
        hand.interactionState = 'UNTRACKED';
        hand.grabObjectId = null;
      }
      hand.quality = qualityLabel(hand.confidence, hand.tracked);
    }
  }

  _scheduleFreshFrame() {
    if (!this.running || this.paused) return;

    if (typeof this.video.requestVideoFrameCallback === 'function') {
      this.frameCallbackId = this.video.requestVideoFrameCallback((now, metadata) => {
        this.frameCallbackId = null;
        this._onFreshVideoFrame(now, metadata || {});
      });
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      const mediaTime = this.video.currentTime;
      this._onFreshVideoFrame(performance.now(), { mediaTime });
    }, 24);
  }

  _onFreshVideoFrame(callbackNow, metadata) {
    if (!this.running || this.paused) return;
    if (document.hidden || this.video.readyState < 2 || this.video.videoWidth < 2) {
      this.timer = setTimeout(() => this._scheduleFreshFrame(), 100);
      return;
    }

    const mediaTime = Number.isFinite(metadata.mediaTime) ? metadata.mediaTime : this.video.currentTime;
    if (mediaTime === this.lastVideoTime) {
      this._scheduleFreshFrame();
      return;
    }
    this.lastVideoTime = mediaTime;

    if (Number.isFinite(metadata.presentedFrames)) {
      if (this.lastPresentedFrames != null && metadata.presentedFrames > this.lastPresentedFrames + 1) {
        this.metrics.droppedTrackingFrames += metadata.presentedFrames - this.lastPresentedFrames - 1;
      }
      this.lastPresentedFrames = metadata.presentedFrames;
    }

    const now = performance.now();
    this.metrics.lastFrameCallbackAt = now;
    this.metrics.cameraResolution = `${this.video.videoWidth}x${this.video.videoHeight}`;
    if (Number.isFinite(metadata.presentationTime)) {
      this.metrics.frameFreshnessMs = Math.max(0, now - metadata.presentationTime);
    } else {
      this.metrics.frameFreshnessMs = 0;
    }

    if (now - this.lastInferenceAt >= this.inferenceIntervalMs) {
      this._runInference(now);
    }
    this._scheduleFreshFrame();
  }

  _runInference(frameReadyAt) {
    this.lastInferenceAt = frameReadyAt;
    const modelTimestamp = Math.max(frameReadyAt, this.lastModelTimestamp + 0.01);
    this.lastModelTimestamp = modelTimestamp;
    const started = performance.now();

    try {
      const result = this.landmarker.detectForVideo(this.video, modelTimestamp);
      const completed = performance.now();
      this._consumeResult(result, completed);

      const inferenceMs = completed - started;
      this.metrics.inferenceMs = this.metrics.inferenceMs
        ? this.metrics.inferenceMs * 0.82 + inferenceMs * 0.18
        : inferenceMs;
      this.metrics.estimatedTrackingLatencyMs = this.metrics.frameFreshnessMs + inferenceMs;
      this.metrics.lastInferenceCompletedAt = completed;
      this.metrics.completedFrames += 1;
      this.metrics.frameCounter += 1;

      const elapsed = completed - this.metrics.fpsWindowStart;
      if (elapsed >= 1000) {
        this.metrics.trackingFps = this.metrics.frameCounter * 1000 / elapsed;
        this.metrics.frameCounter = 0;
        this.metrics.fpsWindowStart = completed;
      }

      // Prefer responsiveness. Only back off when inference genuinely consumes
      // most of the available frame budget.
      this.inferenceIntervalMs = clamp(Math.round(this.metrics.inferenceMs * 1.15 + 12), 42, 88);
    } catch (error) {
      this.dispatchEvent(new CustomEvent('error', { detail: error }));
      this.inferenceIntervalMs = clamp(this.inferenceIntervalMs + 8, 50, 100);
    }
  }

  _consumeResult(result, now) {
    const handednessGroups = result.handednesses || result.handedness || [];
    const detections = (result.landmarks || []).map((landmarks, index) => {
      const categories = handednessGroups[index] || [];
      const category = categories[0] || {};
      const palmCenter = averagePoints(PALM_IDS.map((id) => landmarks[id]));
      return {
        landmarks,
        worldLandmarks: result.worldLandmarks?.[index] || null,
        label: normalizeLabel(category),
        score: Number.isFinite(category.score) ? category.score : 0.5,
        wrist: { x: landmarks[0].x, y: landmarks[0].y },
        palmCenter,
      };
    });

    const assignments = this._assignDetections(detections, now);
    const assigned = new Set();
    for (const { side, detection } of assignments) {
      assigned.add(side);
      this._updateHand(this.hands[side], detection, now);
    }

    for (const side of SIDES) {
      if (!assigned.has(side)) {
        const hand = this.hands[side];
        if (!hand.lostSince) hand.lostSince = now;
        hand.interactionSafe = false;
        hand.interacting = false;
        hand.target = null;
        hand.reticleState = 'DISABLED';
        this.gestures.reset(side, now);
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
      const dt = hand.lastSeenAt ? clamp((now - hand.lastSeenAt) / 1000, 0, 0.25) : 0;

      if (hand.imageWrist && now - hand.lastSeenAt < 850) {
        const predicted = {
          x: hand.imageWrist.x + hand.imageVelocity.x * dt,
          y: hand.imageWrist.y + hand.imageVelocity.y * dt,
        };
        const continuity = distance2(predicted, detection.wrist);
        value += continuity * 4.1;
        if (continuity > 0.38) value += 0.9;
      } else {
        const expectedX = side === 'left' ? 0.34 : 0.66;
        value += Math.abs(detection.wrist.x - expectedX) * 0.18;
      }

      if (detection.label !== 'unknown') {
        if (detection.label === side) value -= 0.11 * detection.score;
        else value += 0.68 * detection.score;
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

  _estimateQuality(hand, detection, now) {
    const center = detection.palmCenter;
    const edge = Math.min(center.x, center.y, 1 - center.x, 1 - center.y);
    const edgeScore = clamp(edge / 0.12, 0, 1);
    const palmSize = distance2(detection.landmarks[5], detection.landmarks[17]);
    const sizeScore = clamp((palmSize - 0.025) / 0.08, 0, 1) * clamp((0.38 - palmSize) / 0.12, 0, 1);

    let continuityScore = 1;
    if (hand.imageWrist && hand.lastSeenAt) {
      const dt = clamp((now - hand.lastSeenAt) / 1000, 1 / 120, 0.25);
      const predicted = {
        x: hand.imageWrist.x + hand.imageVelocity.x * dt,
        y: hand.imageWrist.y + hand.imageVelocity.y * dt,
      };
      const jump = distance2(predicted, detection.wrist);
      continuityScore = clamp(1 - jump / 0.24, 0, 1);
    }

    return clamp(
      detection.score * 0.38
      + continuityScore * 0.34
      + edgeScore * 0.16
      + sizeScore * 0.12,
      0,
      1,
    );
  }

  _updateHand(hand, detection, now) {
    const landmarks = detection.landmarks;
    const worldLandmarks = detection.worldLandmarks;
    const videoWidth = Math.max(1, this.video.videoWidth);
    const videoHeight = Math.max(1, this.video.videoHeight);
    const hFov = this.cameraManager.horizontalFovDeg * Math.PI / 180;
    const vFov = 2 * Math.atan(Math.tan(hFov / 2) / (videoWidth / videoHeight));
    const focalX = videoWidth / (2 * Math.tan(hFov / 2));
    const focalY = videoHeight / (2 * Math.tan(vFov / 2));

    const quality = this._estimateQuality(hand, detection, now);
    const palmWidthPixels = Math.max(8, pixelDistance(landmarks[5], landmarks[17], videoWidth, videoHeight));
    const palmLengthPixels = Math.max(8, pixelDistance(landmarks[0], landmarks[9], videoWidth, videoHeight));

    this._collectCalibration(hand, palmWidthPixels, palmLengthPixels, focalX, focalY, quality);
    const calibration = hand.calibration;

    const widthDepth = (focalX * calibration.palmWidthMeters) / palmWidthPixels;
    const lengthDepth = (focalY * calibration.palmLengthMeters) / palmLengthPixels;
    const rawDepth = clamp(median([widthDepth, lengthDepth]), 0.20, 1.55);
    const filteredDepth = clamp(hand.depthFilter.filter(rawDepth, now, quality), 0.20, 1.55);

    hand.rawDepthMeters = rawDepth;
    hand.depthMeters = filteredDepth;
    hand.filteredDepthMeters = filteredDepth;

    let localScale = 1;
    let worldPalmCenter = null;
    if (worldLandmarks?.length === 21) {
      const worldPalmWidth = Math.max(0.025, distance3(worldLandmarks[5], worldLandmarks[17]));
      const desiredScale = clamp(calibration.palmWidthMeters / worldPalmWidth, 0.70, 1.35);
      hand.handScale += (desiredScale - hand.handScale) * (quality > 0.72 ? 0.035 : 0.015);
      localScale = hand.handScale;
      worldPalmCenter = averagePoints(PALM_IDS.map((id) => worldLandmarks[id]));
    }

    const rawJoints = landmarks.map((landmark, index) => {
      let zOffset;
      if (worldPalmCenter && worldLandmarks[index]) {
        zOffset = clamp(-(worldLandmarks[index].z - worldPalmCenter.z) * localScale, -0.15, 0.15);
      } else {
        const frameWidthAtRoot = 2 * filteredDepth * Math.tan(hFov / 2);
        zOffset = clamp(-landmark.z * frameWidthAtRoot, -0.15, 0.15);
      }

      const jointDepth = clamp(filteredDepth - zOffset, 0.18, 1.65);
      const frameWidth = 2 * jointDepth * Math.tan(hFov / 2);
      const frameHeight = 2 * jointDepth * Math.tan(vFov / 2);
      return {
        x: (landmark.x - 0.5) * frameWidth,
        y: -(landmark.y - 0.5) * frameHeight,
        z: -jointDepth,
      };
    });

    const previousFiltered = hand.filteredJointsCamera.map((point) => ({ ...point }));
    for (let i = 0; i < 21; i += 1) {
      hand.rawJointsCamera[i] = rawJoints[i];
      hand.filteredJointsCamera[i] = hand.filters[i].filter(rawJoints[i], now, quality);
      hand.jointsInteractionCamera[i] = { ...hand.filteredJointsCamera[i] };
    }

    if (hand.lastSeenAt) {
      const dt = Math.max(0.016, (now - hand.lastSeenAt) / 1000);
      for (let i = 0; i < 21; i += 1) {
        const delta = v3Sub(hand.filteredJointsCamera[i], previousFiltered[i]);
        const rawVelocity = v3Scale(delta, 1 / dt);
        const speed = Math.hypot(rawVelocity.x, rawVelocity.y, rawVelocity.z);
        const limit = TIP_IDS.has(i) ? 4.0 : 3.0;
        const scale = speed > limit && speed > 0 ? limit / speed : 1;
        hand.jointVelocities[i] = v3Scale(rawVelocity, scale);
      }
    }

    const palmCenterFiltered = averagePoints(PALM_IDS.map((id) => hand.filteredJointsCamera[id]));
    hand.velocity = hand.velocityEstimator.push(palmCenterFiltered, now);

    const sideAxis = v3Normalize(v3Sub(hand.filteredJointsCamera[5], hand.filteredJointsCamera[17]));
    const palmUp = v3Normalize(v3Sub(hand.filteredJointsCamera[9], hand.filteredJointsCamera[0]));
    let palmForward = v3Normalize(v3Cross(sideAxis, palmUp));
    if (palmForward.z < 0) palmForward = v3Scale(palmForward, -1);
    const correctedUp = v3Normalize(v3Cross(palmForward, sideAxis));
    hand.rootTransform = {
      position: palmCenterFiltered,
      side: sideAxis,
      up: correctedUp,
      forward: palmForward,
      scale: hand.handScale,
    };
    hand.localJoints = hand.filteredJointsCamera.map((joint) => v3Sub(joint, palmCenterFiltered));

    const indexMcp = hand.filteredJointsCamera[5];
    const indexPip = hand.filteredJointsCamera[6];
    const indexDip = hand.filteredJointsCamera[7];
    const indexTip = hand.filteredJointsCamera[8];
    const segmentA = v3Normalize(v3Sub(indexTip, indexPip));
    const segmentB = v3Normalize(v3Sub(indexDip, indexMcp));
    const rawRayDirection = v3Normalize(v3Add(v3Scale(segmentA, 0.62), v3Scale(segmentB, 0.38)));
    const filteredRayOrigin = hand.rayOriginFilter.filter(indexMcp, now, quality);
    const filteredRayDirection = hand.rayDirectionFilter.filter(rawRayDirection, now, quality);
    hand.rayOriginCamera = filteredRayOrigin;
    hand.rayDirectionCamera = v3Normalize(filteredRayDirection);

    hand.gesture = this.gestures.process(hand.side, landmarks, now, quality);
    hand.confidence = quality;
    hand.handednessConfidence = detection.score;
    hand.quality = qualityLabel(quality, true);
    hand.rawLandmarksImage = landmarks.map((point) => ({ ...point }));
    hand.rawWorldLandmarks = worldLandmarks?.map((point) => ({ ...point })) || null;

    if (hand.imageWrist && hand.lastSeenAt) {
      const dt = Math.max(0.016, (now - hand.lastSeenAt) / 1000);
      hand.imageVelocity = {
        x: clamp((detection.wrist.x - hand.imageWrist.x) / dt, -3, 3),
        y: clamp((detection.wrist.y - hand.imageWrist.y) / dt, -3, 3),
      };
    }
    hand.imageWrist = detection.wrist;
    hand.lastSeenAt = now;
    hand.lostSince = 0;
    hand.tracked = quality >= 0.34;
    hand.interactionSafe = quality >= 0.46;
    hand.interacting = hand.interactionSafe;
    hand.fade = Math.max(hand.fade, quality >= 0.58 ? 0.55 : 0.35);
    if (!hand.interactionSafe && hand.interactionState !== 'CALIBRATING') {
      hand.interactionState = hand.tracked ? 'IDLE' : 'UNTRACKED';
    }
  }

  _collectCalibration(hand, palmWidthPixels, palmLengthPixels, focalX, focalY, quality) {
    const calibration = hand.calibration;
    if (calibration.ready || quality < 0.68) return;

    const neutralDepth = 0.55;
    calibration.samples.push({
      width: clamp(palmWidthPixels * neutralDepth / focalX, 0.060, 0.110),
      length: clamp(palmLengthPixels * neutralDepth / focalY, 0.065, 0.120),
    });
    if (calibration.samples.length > 10) calibration.samples.shift();

    if (calibration.samples.length >= 7) {
      calibration.palmWidthMeters = median(calibration.samples.map((sample) => sample.width));
      calibration.palmLengthMeters = median(calibration.samples.map((sample) => sample.length));
      calibration.ready = true;
      calibration.samples = [];
      hand.depthFilter.reset(neutralDepth, performance.now());
      if (hand.interactionState === 'CALIBRATING') hand.interactionState = 'IDLE';
      this.dispatchEvent(new CustomEvent('calibrated', {
        detail: {
          side: hand.side,
          palmWidthMeters: calibration.palmWidthMeters,
          palmLengthMeters: calibration.palmLengthMeters,
        },
      }));
    }
  }
}
