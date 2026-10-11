\
import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Scale } from "lucide-react";
import { getWeightLog, logWeight } from "@/lib/weight.functions";
import { Btn } from "@/components/us/primitives";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WeightCard() {
  const [logged, setLogged]   = useState<number | null>(null);
  const [input, setInput]     = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [ready, setReady]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getWeightLog()
      .then(({ entries }) => {
        const td = todayStr();
        const hit = entries.find((e) => e.logged_date === td);
        if (hit) {
          setLogged(hit.weight_kg);
          setInput(String(hit.weight_kg));
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const val = parseFloat(input.replace(",", "."));
    if (isNaN(val) || val < 20 || val > 400) {
      toast.error("Enter a valid weight between 20 and 400 kg.");
      return;
    }
    setBusy(true);
    try {
      await logWeight({ data: { weightKg: val } });
      setLogged(val);
      setEditing(false);
      toast.success("Weight logged ✓");
    } catch {
      toast.error("Couldn't save — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  const showForm = !logged || editing;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Scale className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground">Today's weight</span>
        {logged && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Edit weight"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {!showForm ? (
        /* Already logged — show value */
        <div className="flex items-center gap-2">
          <span className="num text-2xl font-bold">{logged}</span>
          <span className="text-sm text-muted-foreground">kg</span>
          <span className="ml-1 flex items-center gap-1 text-xs font-medium text-green-600">
            <Check className="size-3.5" /> logged today
          </span>
        </div>
      ) : (
        /* Input row */
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="20"
            max="400"
            placeholder="e.g. 72.5"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className={cn(
              "flex-1 rounded-xl border border-border bg-secondary px-3 py-2 text-sm",
              "focus:outline-none focus:ring-1 focus:ring-primary transition-shadow",
            )}
          />
          <span className="text-sm text-muted-foreground shrink-0">kg</span>
          <Btn size="sm" onClick={save} disabled={busy || !input}>
            {busy ? "…" : "Log"}
          </Btn>
          {editing && (
            <button
              onClick={() => setEditing(false)}
              className="p-1 text-muted-foreground hover:text-foreground"
              aria-label="Cancel"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
