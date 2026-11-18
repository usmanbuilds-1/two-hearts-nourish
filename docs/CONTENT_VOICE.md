# Product content voice

This file turns the UX-writing rules used in this product into a repository-level contract.

## Voice

**Calm, useful, specific, human.**

The app should feel like a capable nutrition tool shared by two people — not a motivational speaker, a diet police officer, or a fake human coach.

## Four writing checks

Every interface string should be:

1. **Purposeful** — helps the user decide or act.
2. **Concise** — removes words that do not change meaning.
3. **Conversational** — natural language, not system jargon.
4. **Clear** — specific verbs, predictable terminology, no ambiguity.

## Product rules

- Use sentence case.
- Buttons start with a clear action: “Save recipe”, “Log serving”, “Copy invitation”.
- Errors say what failed and what the user can do next.
- Empty states explain the next useful action.
- Never use “Something went wrong” when the product knows what failed.
- Do not call an empty food-log day a “rest day”.
- Do not frame calorie overages as alarms or moral failure.
- Do not compare partners’ bodies, calories or performance.
- Do not fabricate social proof, urgency, testimonials or health outcomes.
- Do not praise routine actions as major achievements.
- Celebrate meaningful events proportionally.
- Evidence notes state uncertainty when the evidence is uncertain.
- AI estimates are called estimates; database/label values are identified by source.
- “Goal fit” describes fit against the member’s own configured targets. It is not a medical claim.

## Hierarchy rules

- Data values outrank labels.
- Primary task outranks educational content.
- Educational content outranks decorative/motivational content.
- Keep bottom navigation at five destinations or fewer.
- Do not add a nav item for a feature that can be reached naturally from the task it supports.
- Avoid hiding commonly used content behind teaser banners.

## Tone by situation

**Routine:** direct. “Recipe saved.”

**Uncertainty:** transparent. “Estimate — review.”

**Failure:** calm + actionable. “Couldn’t save this recipe. Review the ingredients and try again.”

**Destructive:** serious. State the consequence before the action.

**Success:** proportional. Do not add confetti language to routine logging.

## Source

These rules adapt the audited public `content-designer/ux-writing-skill` principles (purposeful, concise, conversational, clear) to this product’s nutrition/privacy context. We use the writing guidance only; we do not execute or install third-party skill code in production.
