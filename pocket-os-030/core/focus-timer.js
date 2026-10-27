// Elapsed time must not be capped with animation delta: Safari may throttle RAF.
export function advanceFocusTimer(focus, now) {
  if (!focus || !Number.isFinite(now)) return false;
  const previous = Number.isFinite(focus.lastTickAt) ? focus.lastTickAt : now;
  focus.lastTickAt = now;
  if (!focus.running || focus.remainingMs <= 0) return false;
  focus.remainingMs = Math.max(0, focus.remainingMs - Math.max(0, now - previous));
  if (focus.remainingMs > 0) return false;
  focus.running = false;
  return true;
}
