// Compatibility shim for stale SpatialHands v0.7.x Safari caches.
// Current builds do not use a worker for hand tracking.
self.postMessage({ type: 'ready', compatibility: true });

self.onmessage = (event) => {
  const data = event.data || {};

  if (data.type === 'init') {
    self.postMessage({ type: 'ready', compatibility: true });
    return;
  }

  if (data.type === 'frame') {
    try { data.bitmap?.close?.(); } catch (_) {}
    self.postMessage({
      type: 'frame',
      hand: null,
      inferenceMs: 0,
      compatibility: true
    });
  }
};
