import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { mealEditorBounds, type MealEditorBounds } from "@/lib/meal-editor-viewport";

/**
 * Vaul bottom-drawer input repositioning is unreliable on iOS Safari.
 * Use a plain Radix dialog for keyboard-heavy meal forms. It has a separately
 * scrollable form and a fixed footer so fields and actions stay available when
 * the software keyboard and Safari toolbar occupy most of the display.
 */
export function MealEditorDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<MealEditorBounds | null>(null);

  const revealFocusedField = useCallback(() => {
    const area = scrollRef.current;
    const active = document.activeElement;
    if (!area || !(active instanceof HTMLElement) || !area.contains(active)) return;
    const field = active.getBoundingClientRect();
    const viewport = area.getBoundingClientRect();
    const top = viewport.top + 16;
    const bottom = viewport.bottom - 20;
    if (field.bottom > bottom) {
      area.scrollTop += field.bottom - bottom + 12;
    } else if (field.top < top) {
      area.scrollTop -= top - field.top + 12;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setBounds(null);
      return;
    }
    const viewport = window.visualViewport;
    let raf = 0;
    let revealRaf = 0;
    const measure = () => {
      raf = 0;
      const next = mealEditorBounds(
        window.innerHeight,
        viewport?.height,
        viewport?.offsetTop,
        window.innerWidth,
      );
      setBounds(previous => (
        previous?.top === next.top && previous.height === next.height ? previous : next
      ));
      if (revealRaf) cancelAnimationFrame(revealRaf);
      revealRaf = requestAnimationFrame(revealFocusedField);
    };
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    schedule();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (revealRaf) cancelAnimationFrame(revealRaf);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, [open, revealFocusedField]);

  const focusField = (event: FocusEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
    // Safari's keyboard resize is animated. Check again after it settles even
    // if visualViewport does not emit a final resize event.
    requestAnimationFrame(revealFocusedField);
    window.setTimeout(revealFocusedField, 120);
    window.setTimeout(revealFocusedField, 380);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75" />
        <Dialog.Content
          className="fixed left-1/2 z-[60] flex w-full max-w-xl -translate-x-1/2 flex-col overflow-hidden border-x border-border bg-background shadow-2xl outline-none sm:rounded-2xl sm:border"
          style={{
            top: bounds ? `${bounds.top}px` : "0px",
            height: bounds ? `${bounds.height}px` : "100dvh",
          }}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-2xl font-normal text-foreground">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close meal editor">
              <X className="size-5" />
            </Dialog.Close>
          </header>

          <div
            ref={scrollRef}
            onFocusCapture={focusField}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [-webkit-overflow-scrolling:touch]"
          >
            {children}
          </div>

          <footer className="shrink-0 border-t border-border bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
