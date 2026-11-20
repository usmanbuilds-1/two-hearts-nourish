import { useEffect, useRef, useState } from "react";
import { keyboardDrawerGeometry } from "@/lib/keyboard-viewport";

/**
 * Only opt the long, keyboard-heavy meal forms into this behavior. Other
 * drawers (photo, scan, picker) keep their existing interaction patterns.
 * Vaul's repositionInputs must be disabled on the matching Drawer.Root.
 */
export function useKeyboardAwareDrawer(open: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{ bottom: number; maxHeight?: number }>({
    bottom: 0,
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      setGeometry({ bottom: 0 });
      return;
    }
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = keyboardDrawerGeometry(
        window.innerHeight,
        viewport?.height,
        viewport?.offsetTop,
      );
      setGeometry(previous =>
        previous.bottom === next.bottom && previous.maxHeight === next.maxHeight
          ? previous
          : next,
      );
      if (next.bottom > 120) {
        const area = scrollRef.current;
        const focused = document.activeElement;
        if (area && focused instanceof HTMLElement && area.contains(focused)) {
          const viewportBox = area.getBoundingClientRect();
          const inputBox = focused.getBoundingClientRect();
          if (inputBox.bottom > viewportBox.bottom - 16) {
            area.scrollTop += inputBox.bottom - viewportBox.bottom + 16;
          } else if (inputBox.top < viewportBox.top + 16) {
            area.scrollTop -= viewportBox.top + 16 - inputBox.top;
          }
        }
      }
    };
    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    schedule();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [open]);

  return {
    scrollRef,
    style: {
      bottom: `${geometry.bottom}px`,
      ...(geometry.maxHeight ? { maxHeight: `${geometry.maxHeight}px` } : {}),
    },
  };
}
