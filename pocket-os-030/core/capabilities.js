export function detectCapabilities() {
  return {
    camera: Boolean(navigator.mediaDevices?.getUserMedia),
    motion: typeof DeviceOrientationEvent !== 'undefined',
    gamepad: typeof navigator.getGamepads === 'function',
    audio: Boolean(window.AudioContext || window.webkitAudioContext),
    video: typeof HTMLVideoElement !== 'undefined',
    image: typeof Image !== 'undefined',
    fullscreen: Boolean(document.documentElement.requestFullscreen),
    orientationLock: Boolean(screen.orientation?.lock),
    webgl2: (() => {
      try {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2'));
      } catch (_) { return false; }
    })(),
  };
}

export function missingCapabilities(manifest, capabilities) {
  const required = manifest?.requiredCapabilities || [];
  return required.filter((key) => !capabilities[key]);
}
