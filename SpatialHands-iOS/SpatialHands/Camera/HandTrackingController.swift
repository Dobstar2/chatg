import AVFoundation
import Combine
import CoreMedia
import Foundation
import ImageIO
import UIKit
import Vision

final class HandTrackingController: NSObject, ObservableObject {
  let captureSession = AVCaptureSession()

  @Published private(set) var normalizedPointer = CGPoint(x: 0.5, y: 0.5)
  @Published private(set) var sourceAspectRatio: CGFloat = 9.0 / 16.0
  @Published private(set) var handVisible = false
  @Published private(set) var isPinching = false
  @Published private(set) var pinchEventCount = 0
  @Published private(set) var cameraLabel = "Camera not started"
  @Published private(set) var statusMessage = "Preparing hand tracking..."

  /// Turn this on if the pointer feels horizontally reversed for your mounting setup.
  @Published var mirrorHorizontally = false

  /// Expands pointer travel around the center. A value above 1 reaches screen edges sooner.
  @Published var cursorGain: CGFloat = 1.12

  private let sessionQueue = DispatchQueue(label: "com.dobstar.spatialhands.capture")
  private let visionQueue = DispatchQueue(
    label: "com.dobstar.spatialhands.vision",
    qos: .userInteractive
  )
  private let videoOutput = AVCaptureVideoDataOutput()
  private let handPoseRequest: VNDetectHumanHandPoseRequest = {
    let request = VNDetectHumanHandPoseRequest()
    request.maximumHandCount = 1
    return request
  }()

  private var isConfigured = false
  private var usingUltraWideCamera = false
  private var lastProcessedTimestamp = -Double.infinity
  private var smoothedPointer: CGPoint?
  private var pinchState = PinchStateMachine()
  private var visionImageOrientation: CGImagePropertyOrientation = .right
  private var missingFrameCount = 0

  private let minimumJointConfidence: VNConfidence = 0.30
  private let processingInterval = 1.0 / 20.0
  private let smoothingFactor: CGFloat = 0.30

  override init() {
    super.init()
  }

  func start() {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      configureAndStartSession()

    case .notDetermined:
      DispatchQueue.main.async {
        self.statusMessage = "Camera permission is required for hand tracking."
      }
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        guard let self else { return }
        if granted {
          self.configureAndStartSession()
        } else {
          self.publishCameraDenied()
        }
      }

    case .denied, .restricted:
      publishCameraDenied()

    @unknown default:
      DispatchQueue.main.async {
        self.statusMessage = "Camera access is unavailable on this device."
      }
    }
  }

  func stop() {
    sessionQueue.async { [weak self] in
      guard let self, self.captureSession.isRunning else { return }
      self.captureSession.stopRunning()
      DispatchQueue.main.async {
        self.handVisible = false
        self.isPinching = false
        self.statusMessage = "Tracking paused."
      }
    }
  }

  private func configureAndStartSession() {
    sessionQueue.async { [weak self] in
      guard let self else { return }

      do {
        if !self.isConfigured {
          try self.configureCaptureSession()
        }

        if !self.captureSession.isRunning {
          self.lastProcessedTimestamp = -Double.infinity
          self.captureSession.startRunning()
        }

        DispatchQueue.main.async {
          self.statusMessage = "Show one hand, point with your index finger, then pinch to select."
        }
      } catch {
        DispatchQueue.main.async {
          self.statusMessage = "Camera setup failed: \(error.localizedDescription)"
        }
      }
    }
  }

  private func configureCaptureSession() throws {
    captureSession.beginConfiguration()
    defer { captureSession.commitConfiguration() }

    if captureSession.canSetSessionPreset(.hd1280x720) {
      captureSession.sessionPreset = .hd1280x720
    }

    let discoverySession = AVCaptureDevice.DiscoverySession(
      deviceTypes: [.builtInUltraWideCamera, .builtInWideAngleCamera],
      mediaType: .video,
      position: .back
    )

    let camera =
      discoverySession.devices.first(where: { $0.deviceType == .builtInUltraWideCamera })
      ?? discoverySession.devices.first(where: { $0.deviceType == .builtInWideAngleCamera })

    guard let camera else {
      throw HandTrackingError.noBackCamera
    }

    usingUltraWideCamera = camera.deviceType == .builtInUltraWideCamera

    try camera.lockForConfiguration()
    if camera.isFocusModeSupported(.continuousAutoFocus) {
      camera.focusMode = .continuousAutoFocus
    }
    if camera.isExposureModeSupported(.continuousAutoExposure) {
      camera.exposureMode = .continuousAutoExposure
    }
    camera.unlockForConfiguration()

    let input = try AVCaptureDeviceInput(device: camera)
    guard captureSession.canAddInput(input) else {
      throw HandTrackingError.cannotAddCameraInput
    }
    captureSession.addInput(input)

    videoOutput.alwaysDiscardsLateVideoFrames = true
    videoOutput.setSampleBufferDelegate(self, queue: visionQueue)

    guard captureSession.canAddOutput(videoOutput) else {
      throw HandTrackingError.cannotAddVideoOutput
    }
    captureSession.addOutput(videoOutput)

    if let connection = videoOutput.connection(with: .video),
      connection.isVideoRotationAngleSupported(90)
    {
      connection.videoRotationAngle = 90
      visionImageOrientation = .up
    } else {
      visionImageOrientation = .right
    }

    isConfigured = true

    DispatchQueue.main.async {
      self.cameraLabel = self.usingUltraWideCamera ? "0.5x ultra-wide" : "1x wide fallback"
    }
  }

  private func publishCameraDenied() {
    DispatchQueue.main.async {
      self.cameraLabel = "Camera blocked"
      self.statusMessage = "Enable camera access in Settings > Privacy & Security > Camera."
    }
  }

  private func consumeDetection(
    visionPoint: CGPoint,
    normalizedPinchDistance: CGFloat,
    aspectRatio: CGFloat
  ) {
    missingFrameCount = 0

    if abs(sourceAspectRatio - aspectRatio) > 0.001 {
      sourceAspectRatio = aspectRatio
    }

    let transformed = HandGestureMath.transformedVisionPoint(
      visionPoint,
      mirrorHorizontally: mirrorHorizontally,
      gain: cursorGain
    )

    if let previous = smoothedPointer {
      smoothedPointer = CGPoint(
        x: previous.x + ((transformed.x - previous.x) * smoothingFactor),
        y: previous.y + ((transformed.y - previous.y) * smoothingFactor)
      )
    } else {
      smoothedPointer = transformed
    }

    if let smoothedPointer {
      normalizedPointer = smoothedPointer
    }

    let wasVisible = handVisible
    handVisible = true
    if !wasVisible {
      statusMessage = "Tracking active. Pinch thumb and index finger to select."
    }

    let transition = pinchState.update(normalizedDistance: normalizedPinchDistance)
    isPinching = pinchState.isPinching

    if transition == .began {
      pinchEventCount += 1
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
  }

  private func consumeMissingHand() {
    missingFrameCount += 1
    guard missingFrameCount >= 5 else { return }

    if handVisible {
      statusMessage = "No hand detected. Keep your whole hand inside the camera view."
    }
    handVisible = false
    isPinching = false
    smoothedPointer = nil
    pinchState.reset()
  }
}

extension HandTrackingController: AVCaptureVideoDataOutputSampleBufferDelegate {
  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    let timestamp = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
    guard timestamp.isFinite,
      timestamp - lastProcessedTimestamp >= processingInterval
    else {
      return
    }
    lastProcessedTimestamp = timestamp

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }

    let bufferWidth = CGFloat(CVPixelBufferGetWidth(pixelBuffer))
    let bufferHeight = CGFloat(CVPixelBufferGetHeight(pixelBuffer))
    let longSide = max(bufferWidth, bufferHeight)
    let shortSide = min(bufferWidth, bufferHeight)
    let portraitAspectRatio = longSide > 0 ? shortSide / longSide : 9.0 / 16.0

    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: visionImageOrientation,
      options: [:]
    )

    do {
      try handler.perform([handPoseRequest])

      guard let observation = handPoseRequest.results?.first else {
        DispatchQueue.main.async { [weak self] in
          self?.consumeMissingHand()
        }
        return
      }

      let indexTip = try observation.recognizedPoint(.indexTip)
      let thumbTip = try observation.recognizedPoint(.thumbTip)
      let wrist = try observation.recognizedPoint(.wrist)
      let middleMCP = try observation.recognizedPoint(.middleMCP)

      guard indexTip.confidence >= minimumJointConfidence,
        thumbTip.confidence >= minimumJointConfidence,
        wrist.confidence >= minimumJointConfidence,
        middleMCP.confidence >= minimumJointConfidence
      else {
        DispatchQueue.main.async { [weak self] in
          self?.consumeMissingHand()
        }
        return
      }

      let indexPoint = CGPoint(x: indexTip.location.x, y: indexTip.location.y)
      let thumbPoint = CGPoint(x: thumbTip.location.x, y: thumbTip.location.y)
      let wristPoint = CGPoint(x: wrist.location.x, y: wrist.location.y)
      let middleMCPPoint = CGPoint(x: middleMCP.location.x, y: middleMCP.location.y)

      let pinchDistance = HandGestureMath.distance(indexPoint, thumbPoint)
      let palmScale = max(HandGestureMath.distance(wristPoint, middleMCPPoint), 0.001)
      let normalizedPinchDistance = pinchDistance / palmScale

      DispatchQueue.main.async { [weak self] in
        self?.consumeDetection(
          visionPoint: indexPoint,
          normalizedPinchDistance: normalizedPinchDistance,
          aspectRatio: portraitAspectRatio
        )
      }
    } catch {
      DispatchQueue.main.async { [weak self] in
        self?.statusMessage = "Hand tracking error: \(error.localizedDescription)"
        self?.consumeMissingHand()
      }
    }
  }
}

private enum HandTrackingError: LocalizedError {
  case noBackCamera
  case cannotAddCameraInput
  case cannotAddVideoOutput

  var errorDescription: String? {
    switch self {
    case .noBackCamera:
      return "No compatible rear camera was found."
    case .cannotAddCameraInput:
      return "The rear camera could not be added to the capture session."
    case .cannotAddVideoOutput:
      return "Camera frames could not be added to the capture session."
    }
  }
}
