# Our Little Ritual — visual system

Based on the official Impeccable guidance: https://github.com/pbakaus/impeccable

## Product mode
Operate. Users come to log food quickly; emotional warmth is an atmospheric layer, not a task obstacle.

## Art direction
A familiar handwritten journal's **typographic warmth** without a handwritten font: almond linen paper, walnut ink, baked-clay interaction accents, quiet olive to identify the partner. Deep brown evening mode preserves the same hierarchy. Deliberately avoid candy pink, lavender gradients, stock couple imagery, floating-glass navigation, clip-art hearts, botanical stickers, and invented food pictures.

## Color tokens
All colors are semantic CSS OKLCH variables in src/styles.css.
- Light background: oklch(0.961 0.019 73), approximate #FAF0E5
- Card: oklch(0.992 0.006 75), approximate #FFFCF8
- Ink: oklch(0.236 0.018 45), approximate #261C17
- Primary clay: oklch(0.488 0.097 36), approximate #8E4A38
- Partner olive: oklch(0.452 0.055 131), approximate #4B5C3C
- Muted readable ink: oklch(0.434 0.025 53), approximate #5C4D44
- Dark: deep warm walnut with lighter clay and olive accents.
- No new hex colors in components; use tokens.

## Typography and layout
Fraunces for a restrained header / section display voice only; Figtree for interactive controls, labels, body and numbers. Keep the component ramp predictable: 34–40 px opening headline, 22 px section titles, 16 px body, 14 px metadata; tiny data labels are not primary information. One primary action per region. Negative space and fine rules, not nesting rounded cards, separate sections.

## Interaction
Repeat a meal from the first log; show exactly what serving will repeat. Scanning and manual entry remain visible. Present errors as actionable recovery messages. 44 px touch controls; explicit focus ring; reduced motion. No fake engagement animations; no heart confetti.

## Impeccable evaluation priorities
- Distill: remove redundant eyebrow headings, repeated explanatory text and decorative card stacks.
- Layout: establish reading order of context → intake → log actions → repeat history → today's diary.
- Typeset: Figtree interaction labels with Fraunces editorial headlines; readable mobile metadata.
- Adapt: narrow phones, zoomed text, long food names, long member names, empty partner state, empty diet.
- Harden & polish: loading/error/retry, signed private photo states, keyboard focus, contrast, layout stability.

## Implementation gate
Review actual rendered screens at 320, 360, 390 and 430 CSS px in light and dark before production merge. CI success verifies code but is not visual proof. Keep PR #9 draft until reviewed.
