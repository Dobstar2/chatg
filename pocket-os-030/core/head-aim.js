import { angularOffset, clamp } from './math.js';

export class HeadAimController {
  constructor({ maxAngleDeg = 11, stickinessMs = 180, assistStrength = 0.75 } = {}) {
    this.maxAngle = maxAngleDeg * Math.PI / 180;
    this.stickinessMs = stickinessMs;
    this.assistStrength = assistStrength;
    this.currentTarget = null;
    this.currentScore = Infinity;
    this.targetSince = 0;
    this.lastSeenAt = 0;
    this.lastAim = null;
  }

  setOptions({ maxAngleDeg, stickinessMs, assistStrength } = {}) {
    if (Number.isFinite(maxAngleDeg)) this.maxAngle = clamp(maxAngleDeg, 3, 20) * Math.PI / 180;
    if (Number.isFinite(stickinessMs)) this.stickinessMs = clamp(stickinessMs, 40, 600);
    if (Number.isFinite(assistStrength)) this.assistStrength = clamp(assistStrength, 0, 1.5);
  }

  update(headOrientation, targets, now = performance.now()) {
    const candidates = [];
    for (const target of targets || []) {
      if (!target || target.disabled || target.visible === false || !target.position) continue;
      const offset = angularOffset(target.position, headOrientation);
      const angularRadius = Math.max(0.008, Number(target.angularRadius) || 0.035);
      const allowed = this.maxAngle + angularRadius * this.assistStrength;
      if (offset.depth <= 0.03 || offset.angle > allowed) continue;
      const centerNorm = offset.angle / Math.max(0.001, allowed);
      const priority = Number.isFinite(target.priority) ? target.priority : 0;
      const distancePenalty = Math.min(1.5, offset.depth / 5) * 0.08;
      const radiusBonus = angularRadius * 0.75;
      let score = centerNorm * centerNorm + distancePenalty - priority * 0.08 - radiusBonus;
      if (target.id === this.currentTarget?.id) {
        const age = now - this.targetSince;
        score -= age < this.stickinessMs ? 0.16 : 0.035;
      }
      candidates.push({ target, offset, score });
    }

    candidates.sort((a, b) => a.score - b.score);
    let best = candidates[0] || null;
    const currentCandidate = candidates.find((entry) => entry.target.id === this.currentTarget?.id) || null;

    if (this.currentTarget && currentCandidate) {
      const targetAge = now - this.targetSince;
      const challengerIsClearlyBetter = best && best.target.id !== this.currentTarget.id
        && best.score + 0.06 < currentCandidate.score;
      if (!challengerIsClearlyBetter || targetAge < this.stickinessMs) best = currentCandidate;
    }

    if (!best && this.currentTarget && now - this.lastSeenAt < this.stickinessMs * 0.6) {
      return this._snapshot(this.currentTarget, this.currentScore, now);
    }

    if (best) {
      if (best.target.id !== this.currentTarget?.id) this.targetSince = now;
      this.currentTarget = best.target;
      this.currentScore = best.score;
      this.lastSeenAt = now;
      this.lastAim = best.offset;
      return this._snapshot(best.target, best.score, now, best.offset);
    }

    this.currentTarget = null;
    this.currentScore = Infinity;
    this.lastAim = null;
    return this._snapshot(null, Infinity, now);
  }

  clear() {
    this.currentTarget = null;
    this.currentScore = Infinity;
    this.lastAim = null;
  }

  _snapshot(target, score, now, offset = this.lastAim) {
    return {
      target,
      targetId: target?.id || null,
      score,
      heldMs: target ? Math.max(0, now - this.targetSince) : 0,
      offset,
    };
  }
}
