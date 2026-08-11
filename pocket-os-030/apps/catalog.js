export const APP_MANIFESTS = [
  { id: 'home', name: 'Home', icon: 'H', category: 'System', windowType: 'system', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'quick-settings', name: 'Quick Settings', icon: 'Q', category: 'System', windowType: 'system', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'switcher', name: 'Switcher', icon: 'SW', category: 'System', windowType: 'system', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'library', name: 'Library', icon: 'L', category: 'System', windowType: 'window', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'cinema', name: 'Cinema', icon: 'C', category: 'Featured', windowType: 'immersive', supportsVirtual: true, supportsPassthrough: false, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'], requiredCapabilities: ['video'] },
  { id: 'planetarium', name: 'Planetarium', icon: 'P', category: 'Featured', windowType: 'immersive', supportsVirtual: true, supportsPassthrough: false, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'portal', name: 'Portal', icon: 'O', category: 'Featured', windowType: 'immersive', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'hologram', name: 'Hologram Lab', icon: '3D', category: 'Featured', windowType: 'immersive', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'arcade', name: 'Arcade', icon: 'A', category: 'Featured', windowType: 'immersive', supportsVirtual: true, supportsPassthrough: false, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'music', name: 'Music Room', icon: 'M', category: 'Featured', windowType: 'immersive', supportsVirtual: true, supportsPassthrough: false, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'], requiredCapabilities: ['audio'] },
  { id: 'mini-worlds', name: 'Mini Worlds', icon: 'W', category: 'Featured', windowType: 'immersive', supportsVirtual: true, supportsPassthrough: false, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'passthrough', name: 'Passthrough', icon: 'AR', category: 'Featured', windowType: 'immersive', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: false, preferredControls: ['head', 'pinch', 'touch'], requiredCapabilities: ['camera'] },
  { id: 'gallery', name: 'Gallery', icon: 'G', category: 'Media', windowType: 'window', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'], requiredCapabilities: ['image'] },
  { id: 'browser', name: 'Browser', icon: 'B', category: 'Utility', windowType: 'window', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'clock', name: 'Clock', icon: 'T', category: 'Utility', windowType: 'window', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'settings', name: 'Settings', icon: 'S', category: 'System', windowType: 'window', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'system-info', name: 'System Info', icon: 'I', category: 'Utility', windowType: 'window', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'tracking-lab', name: 'Tracking Lab', icon: 'TL', category: 'Labs', windowType: 'window', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'] },
  { id: 'labs', name: 'Labs', icon: 'X', category: 'Labs', windowType: 'window', supportsVirtual: true, supportsPassthrough: true, supportsMultitasking: true, preferredControls: ['head', 'pinch', 'touch'] },
];

export const DOCK_APPS = ['home', 'library', 'cinema', 'portal', 'gallery', 'settings'];
export const FEATURED_APPS = ['planetarium', 'cinema', 'portal', 'hologram', 'arcade', 'music', 'passthrough', 'mini-worlds'];
