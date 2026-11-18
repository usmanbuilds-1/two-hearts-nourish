import { ExternalLink, FlaskConical } from "lucide-react";
import type { Member } from "@/lib/nutrition";
import { scienceTipFor } from "@/lib/science-tips";

export function ScienceNote({ goal, day }: { goal: Member["body_goal"]; day: string }) {
  const tip = scienceTipFor(goal, day);
  return (
    <aside className="rounded-2xl border border-border bg-card p-4" aria-label="Evidence note">
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        <FlaskConical className="size-4" aria-hidden="true" />
        Evidence note
      </div>
      <h2 className="mt-2 font-display text-xl leading-snug">{tip.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tip.body}</p>
      <a
        href={tip.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        {tip.evidence} · {tip.sourceLabel}
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
    </aside>
  );
}
