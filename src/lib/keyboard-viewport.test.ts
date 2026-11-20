import { describe, expect, it } from "vitest";
import { keyboardDrawerGeometry } from "./keyboard-viewport";

describe("iOS meal drawer keyboard geometry", () => {
  it("keeps the normal bottom drawer when the keyboard is closed", () => {
    expect(keyboardDrawerGeometry(852, 852, 0)).toEqual({ bottom: 0, maxHeight: 784 });
  });
  it("moves the drawer above an iPhone keyboard and shrinks the scrollable height", () => {
    expect(keyboardDrawerGeometry(852, 490, 0)).toEqual({ bottom: 362, maxHeight: 478 });
  });
  it("accounts for Safari panning the visual viewport", () => {
    expect(keyboardDrawerGeometry(852, 490, 45)).toEqual({ bottom: 317, maxHeight: 478 });
  });
  it("ignores minor viewport chrome changes to avoid flickering", () => {
    expect(keyboardDrawerGeometry(852, 790, 0)).toEqual({ bottom: 0, maxHeight: 778 });
  });
  it("handles missing visualViewport gracefully", () => {
    expect(keyboardDrawerGeometry(852, undefined)).toEqual({ bottom: 0, maxHeight: 784 });
  });
});
