/**
 * Position meal editing UI inside the *visible* iOS Safari viewport.
 * A software keyboard shrinks visualViewport, but can leave layout viewport
 * (and 100dvh/fixed bottom drawers) unchanged.
 */
export type MealEditorBounds = { top: number; height: number };

export function mealEditorBounds(
  layoutHeight: number,
  visualHeight: number | undefined,
  visualOffsetTop = 0,
  viewportWidth = 390,
): MealEditorBounds {
  const layout = Number.isFinite(layoutHeight) && layoutHeight > 0 ? layoutHeight : 700;
  const visual = Number.isFinite(visualHeight) && (visualHeight ?? 0) > 0
    ? visualHeight!
    : layout;
  const top = Math.max(0, Math.min(layout - 120, Math.floor(
    Number.isFinite(visualOffsetTop) ? visualOffsetTop : 0,
  )));
  // A small gutter stops the mobile browser toolbar/keyboard animation from
  // visually touching the final editable row.
  const usable = Math.max(120, Math.min(layout - top, Math.floor(visual)) - 8);
  if (viewportWidth < 640) return { top, height: usable };

  const height = Math.min(800, Math.max(120, usable - 24));
  return { top: top + Math.max(0, Math.floor((usable - height) / 2)), height };
}
