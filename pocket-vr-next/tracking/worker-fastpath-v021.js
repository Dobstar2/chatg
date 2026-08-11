// Pocket VR hand tracking reliability patch 0.2.1
//
// Intentionally does not monkey-patch HandTrackingManagerV2.
// The V2 manager already uses requestVideoFrameCallback when available and
// never queues inference. On iPhone Safari/WebKit that path is substantially
// more reliable than MediaStreamTrackProcessor + transferable VideoFrame,
// which can deliver one frame and then end its reader.
//
// Desktop/experimental worker tracking can be revisited behind an explicit
// feature flag after physical WebKit validation. The production controller
// path must favor continuous reacquisition over experimental off-thread ML.

document.documentElement.dataset.handTrackingPath = 'main-fresh-frame-021';
