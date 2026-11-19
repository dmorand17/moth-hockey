// Whether the mobile top bar should be shown after the page scrolls from
// `prevY` to `y`. Always shown at (or above, during iOS overscroll) the top;
// otherwise it hides on downward and shows on upward scrolling, ignoring
// movements smaller than `threshold` px so small jitters don't toggle it.
// `maxY` is the largest real scroll position: iOS reports positions past it
// while bouncing at the bottom, and settling back must not count as an
// upward scroll.
export function headerVisible(prevY: number, y: number, wasVisible: boolean, threshold = 8, maxY = Infinity): boolean {
  if (y <= 0) return true;
  if (prevY > maxY) return wasVisible;
  const delta = Math.min(y, maxY) - prevY;
  if (Math.abs(delta) < threshold) return wasVisible;
  return delta < 0;
}
