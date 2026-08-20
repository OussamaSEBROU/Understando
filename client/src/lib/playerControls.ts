export function clampPlaybackTime(time: number, duration: number) {
  const safeTime = Number.isFinite(time) ? time : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  return Math.min(Math.max(safeTime, 0), safeDuration);
}

export function getSeekTarget(currentTime: number, duration: number, offsetSeconds: number) {
  const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
  return clampPlaybackTime(safeCurrentTime + offsetSeconds, duration);
}

export function getDoubleTapSeekOffset(side: "back" | "forward") {
  return side === "back" ? -10 : 10;
}
