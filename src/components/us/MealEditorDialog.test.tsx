import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MealEditorDialog } from "./MealEditorDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("iPhone keyboard meal editor", () => {
  it("keeps the editable field and Save action inside the resized visible viewport", async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 780,
      offsetTop: 0,
    });
    const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
    const originalHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
    const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 852 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 393 });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));

    try {
      render(
        <MealEditorDialog
          open
          onOpenChange={() => {}}
          title="Add a meal"
          description="Describe your food."
          footer={<button type="button">Save meal</button>}
        >
          <label htmlFor="food-name">Food</label>
          <input id="food-name" />
          <div style={{ height: 1000 }}>Additional meal fields</div>
        </MealEditorDialog>,
      );
      const dialog = screen.getByRole("dialog");
      expect(screen.getByLabelText("Food")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save meal" })).toBeInTheDocument();
      await waitFor(() => expect(dialog).toHaveStyle({ height: "772px" }));

      act(() => {
        viewport.height = 450;
        viewport.offsetTop = 25;
        viewport.dispatchEvent(new Event("resize"));
      });
      await waitFor(() => {
        expect(dialog).toHaveStyle({ top: "25px", height: "442px" });
      });

      fireEvent.focus(screen.getByLabelText("Food"));
      expect(screen.getByRole("button", { name: "Save meal" })).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(window, "visualViewport", original);
      else Reflect.deleteProperty(window, "visualViewport");
      if (originalHeight) Object.defineProperty(window, "innerHeight", originalHeight);
      if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
    }
  });
});
