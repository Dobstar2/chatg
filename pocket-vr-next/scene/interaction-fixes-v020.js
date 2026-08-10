import { v3Sub } from '../core/math.js';
import { InteractionManagerV2 } from './interaction-manager-v020.js';

const originalUpdate = InteractionManagerV2.prototype.update;
const originalPoke = InteractionManagerV2.prototype._updatePoke;
const originalRelease = InteractionManagerV2.prototype._releaseHand;

InteractionManagerV2.prototype.update = function patchedUpdate(hands, now) {
  this._latestHandsForTransition = hands;
  return originalUpdate.call(this, hands, now);
};

InteractionManagerV2.prototype._updatePoke = function patchedPoke(side, hand, button, frontDistance, runtime) {
  // A new target must establish its own approach/contact history before it can
  // fire. This prevents a plane sample from button A from pressing button B.
  if (runtime.pokeButtonId !== button.id) runtime.previousFrontDistance = null;
  return originalPoke.call(this, side, hand, button, frontDistance, runtime);
};

InteractionManagerV2.prototype._releaseHand = function patchedRelease(side, hand, unsafe) {
  const runtime = this.handRuntime[side];
  const object = runtime.currentObjectId
    ? this.objects.find((candidate) => candidate.id === runtime.currentObjectId)
    : null;
  const wasTwoHand = object?.grabbedBy.size === 2;

  originalRelease.call(this, side, hand, unsafe);

  if (!object || !wasTwoHand || object.grabbedBy.size !== 1) return;
  const [remainingSide] = [...object.grabbedBy];
  const remainingHand = this._latestHandsForTransition?.[remainingSide];
  const remainingPinch = this._pinchPoint(remainingHand);
  if (!remainingPinch) return;

  // Rebase the one-hand contact offset at the exact object pose produced by the
  // two-hand manipulation. The object therefore stays in place when one hand
  // lets go instead of jumping back to an old offset.
  object.oneHandOffsets.set(remainingSide, v3Sub(object.position, remainingPinch));
};
