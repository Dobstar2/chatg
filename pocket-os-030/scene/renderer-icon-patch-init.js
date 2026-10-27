import { SpatialRenderer } from './renderer.js';
import { SpatialRenderer as IconRenderer } from './renderer-icons-v1.js';

// Visual-only override: keep the existing renderer/tracking runtime and replace
// only app-card drawing with the compact pictogram implementation.
SpatialRenderer.prototype._drawTargetCard = IconRenderer.prototype._drawTargetCard;

export const APP_ICON_SYSTEM = 'pictogram-v1';
