import { useEffect } from "react";
import { X } from "lucide-react";

interface LightboxProps {
  src: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}

export function Lightbox({ src, alt, caption, onClose }: LightboxProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
        style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}
        onClick={onClose}
        aria-label="Close"
      >
        <X className="size-5" />
      </button>

      {/* Photo */}
      <img
        src={src}
        alt={alt ?? "Meal photo"}
        className="max-h-[85dvh] max-w-full rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Caption */}
      {caption && (
        <p className="mt-3 px-6 text-center text-sm text-white/70">{caption}</p>
      )}
    </div>
  );
}
