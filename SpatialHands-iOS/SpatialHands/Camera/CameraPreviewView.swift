import AVFoundation
import SwiftUI
import UIKit

struct CameraPreviewView: UIViewRepresentable {
  let session: AVCaptureSession

  func makeUIView(context: Context) -> CameraPreviewUIView {
    let view = CameraPreviewUIView()
    view.previewLayer.session = session
    view.previewLayer.videoGravity = .resizeAspectFill
    return view
  }

  func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {
    uiView.previewLayer.session = session
  }
}

final class CameraPreviewUIView: UIView {
  override class var layerClass: AnyClass {
    AVCaptureVideoPreviewLayer.self
  }

  var previewLayer: AVCaptureVideoPreviewLayer {
    guard let previewLayer = layer as? AVCaptureVideoPreviewLayer else {
      fatalError("CameraPreviewUIView must be backed by AVCaptureVideoPreviewLayer")
    }
    return previewLayer
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    guard let connection = previewLayer.connection else {
      return
    }

    if connection.isVideoRotationAngleSupported(90) {
      connection.videoRotationAngle = 90
    }
  }
}
