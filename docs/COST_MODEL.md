# AI cost model

The app controls cost structurally, not by hoping prompts stay short.

## Cost-saving order

1. **No AI call** when a confirmed repeat-photo cache matches.
2. **No AI call** for exact database-driven text inputs such as `150g chicken breast` when USDA resolves them.
3. Use deterministic context for explicit weights, package counts and added fats.
4. Use the cheap vision model for ordinary photos.
5. Retrieve nutrition from databases instead of asking the model to generate every macro.
6. Escalate to the strong model only for evidence-backed ambiguity.
7. Enforce member and project-wide daily caps before provider calls.

## Telemetry

Scanner V2 records provider metadata only:

- model
- input/output/thinking/total tokens
- estimated cost
- latency
- route
- cache hit
- escalation flag/reason
- grounding sources
- confidence

It does **not** need the raw image or raw prompt to measure cost.

Pricing defaults are environment-overridable because provider prices change.

## Budget targets

Treat any per-scan dollar target as an operational goal, not a guaranteed vendor quote.

A practical launch target is:

- most successful scans on the cheap/no-AI path
- strong-model escalation below roughly 15–20%
- blended provider cost under the configured ceiling
- cache hit rate rising as repeat meals accumulate

If cost rises, first inspect routing and escalation reasons before shaving a few prompt words.
