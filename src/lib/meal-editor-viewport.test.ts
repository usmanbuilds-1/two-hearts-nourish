import { describe, expect, it } from "vitest";
import { mealEditorBounds } from "./meal-editor-viewport";

describe("visible-viewport meal editor bounds", () => {
  it("fills the visible mobile screen without the keyboard", () => {
    expect(mealEditorBounds(852, 852, 0, 393)).toEqual({ top: 0, height: 844 });
  });

  it("shrinks above the iPhone keyboard, not below it", () => {
    expect(mealEditorBounds(852, 450, 0, 393)).toEqual({ top: 0, height: 442 });
  });

  it("follows Safari's shifted visual viewport while the page is panned", () => {
    expect(mealEditorBounds(852, 450, 45, 393)).toEqual({ top: 45, height: 442 });
  });

  it("keeps a centered dialog on desktop without claiming the full screen", () => {
    expect(mealEditorBounds(960, 960, 0, 1200)).toEqual({ top: 76, height: 800 });
  });

  it("falls back when visualViewport is unavailable", () => {
    expect(mealEditorBounds(700, undefined, 0, 390)).toEqual({ top: 0, height: 692 });
  });
});
