import { useState } from "react";

/** The photo represents a full pictured portion; this only changes how much was eaten. */
const PRESETS = [25, 50, 75, 100] as const;

export function ScanPortionPicker({
  percentage,
  fullCalories,
  eatenCalories,
  disabled = false,
  onChange,
}: {
  percentage: number;
  fullCalories: number;
  eatenCalories: number;
  disabled?: boolean;
  onChange: (percentage: number) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const isCustom = customOpen || !PRESETS.some(value => value === percentage);
  const customInvalid = customOpen && (customText === "" || !Number.isInteger(Number(customText)) ||
    Number(customText) < 1 || Number(customText) > 100);

  return (
    <section aria-label="How much did you eat?" className="mt-4 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">How much did you eat?</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Of the full amount shown in your photo. Nutrition updates for the portion you ate.
      </p>
      <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label="Portion eaten">
        {PRESETS.map(value => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={!isCustom && percentage === value}
            onClick={() => { setCustomOpen(false); onChange(value); }}
            className={`min-h-11 rounded-xl border px-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 ${!isCustom && percentage === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}
          >
            {value}%
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={isCustom}
          onClick={() => {
            setCustomOpen(true);
            setCustomText(String(percentage));
          }}
          className={`min-h-11 rounded-xl border px-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 ${isCustom ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <label className="mt-3 block text-sm text-foreground">
          Custom percentage (1–100%)
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              disabled={disabled}
              value={customOpen ? customText : String(percentage)}
              onChange={event => {
                const raw = event.target.value;
                setCustomText(raw);
                const n = Number(raw);
                if (raw.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 100) onChange(n);
              }}
              aria-invalid={customInvalid}
              className="min-h-11 w-28 rounded-xl border border-input bg-background px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
            <span className="text-xs text-muted-foreground">of the pictured amount</span>
          </div>
          {customInvalid && (
            <span role="alert" className="mt-1 block text-xs text-destructive">
              Enter a whole number from 1 to 100. Your last valid portion is still applied.
            </span>
          )}
        </label>
      )}
      <p aria-live="polite" className="mt-3 text-xs text-muted-foreground">
        Full estimated portion: {fullCalories} kcal · You ate {percentage}%: <strong className="text-foreground">{eatenCalories} kcal</strong>
      </p>
    </section>
  );
}
