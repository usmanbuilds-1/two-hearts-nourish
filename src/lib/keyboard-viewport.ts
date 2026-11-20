/**
 * The iOS software keyboard shrinks VisualViewport, but often leaves layout
 * viewport and CSS dvh unchanged. Keep fixed meal editors entirely within the
 * currently visible screen rather than moving the drawer with Vaul's own
 * keyboard transform.
 */
export function keyboardDrawerGeometry(
  layoutHeight: number,
  visualHeight: number | undefined,
  visualOffsetTop = 0,
): { bottom: number; maxHeight: number } {
  if (!Number.isFinite(layoutHeight) || layoutHeight <= 0) {
    return { bottom: 0, maxHeight: 400 };
  }
  if (!Number.isFinite(visualHeight) || !visualHeight || visualHeight <= 0) {
    return { bottom: 0, maxHeight: Math.round(layoutHeight * 0.92) };
  }

  const visible = Math.min(layoutHeight, visualHeight);
  const offset = Number.isFinite(visualOffsetTop)
    ? Math.max(0, visualOffsetTop)
    : 0;
  const obscured = Math.max(0, Math.ceil(layoutHeight - visible - offset));
  // Browser toolbars can produce a small offset even without a keyboard.
  const bottom = obscured > 120 ? obscured : 0;
  return {
    bottom,
    maxHeight: Math.max(150, Math.min(Math.round(layoutHeight * 0.92), Math.floor(visible - 12))),
  };
}
