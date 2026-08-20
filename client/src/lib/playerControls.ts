export function getSeekTarget(currentTime: number, duration: number, offsetSeconds: number) {
  const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  return Math.min(Math.max(safeCurrentTime + offsetSeconds, 0), safeDuration);
}

export function getDoubleTapSeekOffset(side: "back" | "forward") {
  return side === "back" ? -10 : 10;
}
