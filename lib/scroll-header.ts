// Whether the mobile top bar should be shown after the page scrolls from
// `prevY` to `y`. Always shown at (or above, during iOS overscroll) the top;
// otherwise it hides on downward and shows on upward scrolling, ignoring
// movements smaller than `threshold` px so small jitters don't toggle it.
export function headerVisible(prevY: number, y: number, wasVisible: boolean, threshold = 8): boolean {
  if (y <= 0) return true;
  const delta = y - prevY;
  if (Math.abs(delta) < threshold) return wasVisible;
  return delta < 0;
}
