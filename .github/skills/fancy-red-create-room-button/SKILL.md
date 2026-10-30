---
name: fancy-red-create-room-button
description: "Restyle the landing-page 'Create Room' button as a fancy red call-to-action, scoped so no other button changes. Covers the exact Kamboocha files, selectors, cascade pitfalls, and validation for this visual-only change."
---

# Fancy red Create Room button

Visual-only restyle of the landing page's primary "Create Room" call-to-action so it
reads as a bold, "fancy" red button, while every other button in the app keeps its
current look.

## Agreed requirements

- Only the landing-page **"Create Room"** button changes color to red.
- "Fancy" is delivered through the codebase's existing visual language: a red
  **gradient** background, a soft **glow** (box-shadow), and the existing hover lift —
  not a flat fill.
- The sibling **"Join Room"** button is unchanged.
- The in-form submit button also labeled "Create room" (shown after choosing Create)
  is unchanged — only the first-screen choice button is the target.
- All other `.primary-button` instances across the app (ready toggle, resolve power,
  start power, etc.) are unchanged.
- Hover, focus-visible, and disabled behaviors continue to work.
- No markup/behavior change beyond adding one CSS class; no copy change (accessible
  name stays "Create Room").

## Decisions / defaults

The request did not pin down exactly what "fancy" means. Default interpretation chosen
to match the existing design system (angular clip-path buttons, gradients, uppercase
italic display font, cyan glow outlines, infinite ambient animations like `turnPulse`):

- **Palette:** reuse/extend the existing red already in the theme — `--danger: #d53c70`
  and the `.danger-button` gradient `linear-gradient(135deg, #d24171, #8c173c)`. A
  brighter top stop (e.g. `#ff4d6d`/`#e11d48`) is acceptable for extra punch.
- **Glow:** a red box-shadow (e.g. `0 0 20px rgba(213, 60, 112, 0.5)`), optionally a
  subtle pulse animation consistent with the codebase's ambient animations.
- **Text color:** light (e.g. `#fff0f6` as `.danger-button` uses) for contrast on red.
- Shape (`clip-path`), display italic/uppercase font, and hover `translateY(-1px)` are
  inherited from `.primary-button`/`.large-button` and intentionally kept.

These are tunable at the implementation gate; the plan below does not change if the
exact shade/glow is adjusted.

## Non-goals

- No change to Join Room, the Create-room form submit button, or any other button.
- No layout, copy, routing, or behavior change.
- No new design tokens required (reuse `--danger`); adding one is optional.
- No dark/light theme work, no accessibility audit beyond preserving focus/disabled.

## Where the code lives

- Landing button markup: `frontend/src/App.tsx` **line ~989**, rendered only when
  `landingMode === null` inside `.landing-panel > .choice-stack`:
  ```tsx
  <button type="button" className="primary-button large-button" onClick={() => setLandingMode('create')}>
    Create Room
  </button>
  ```
  The sibling Join Room button (`secondary-button large-button`, line ~992) and the
  in-form submit (`primary-button`, line ~1040) must not be touched.
- Button styles: `frontend/src/App.css`.
  - Shared base: `.primary-button, .secondary-button, .danger-button, .card-action`
    (line ~525) — border, font-size, min-height, padding, `transition`, `clip-path`.
  - **Background to override:** `.primary-button, .large-button { background: linear-gradient(135deg, #d7f3ff, #44dfff); color: #081530; }` (line ~565).
  - Hover lift: `.primary-button:hover:not(:disabled) { transform: translateY(-1px); }` (line ~584).
  - Focus: `.primary-button:focus-visible, .large-button:focus-visible { outline-color: var(--ink); }` (line ~550).
  - Disabled: `.primary-button:disabled { opacity: 0.5; cursor: not-allowed; }` (line ~556).
  - Display font: `.primary-button, ... .large-button { font-family: var(--display); font-style: italic; text-transform: uppercase; }` (line ~117).
  - Responsive `min-height` bump at line ~2010.
- Red palette reference: `frontend/src/index.css` `:root` — `--danger: #d53c70` (line ~11).

## Why a shared class cannot be edited directly

`.primary-button` is used by ~10 buttons across the app, and `.large-button` is shared
by **both** landing buttons (Create Room **and** Join Room). Editing either class turns
unrelated buttons red. The change must be scoped to the single Create Room element.

## Implementation steps

1. In `frontend/src/App.tsx` (line ~989), add a modifier class to the landing Create
   Room button only — keep the existing classes:
   `className="primary-button large-button create-room-button"`.
   Do not change the button text, `type`, or `onClick`.
2. In `frontend/src/App.css`, add new rules for the modifier. Use a **compound
   selector** so it beats the equal-specificity `.primary-button, .large-button`
   background rule regardless of source order:
   - `.primary-button.create-room-button` — red gradient background + light text +
     glow box-shadow.
   - `.primary-button.create-room-button:hover:not(:disabled)` — optionally intensify
     the glow (the `translateY(-1px)` lift is already inherited).
   - Optionally `.primary-button.create-room-button:focus-visible { outline-color: var(--cyan) /* or --ice */ }` to keep the focus ring visible against red (the inherited `var(--ink)` dark ring is low-contrast on red).
   Place the block after the `.primary-button, .large-button` background rule (line
   ~569) for readability; the compound selector guarantees the win either way.
3. Do not add a new CSS variable unless desired; reuse `--danger` / the `.danger-button`
   gradient values.

## Acceptance criteria

- On the landing screen (`landingMode === null`), the "Create Room" button renders red
  with a gradient + glow; "Join Room" is visually unchanged.
- After clicking Create Room, the in-form "Create room" submit button is unchanged
  (still cyan `.primary-button`), as are all other primary buttons elsewhere.
- Hover shows the lift + glow; focus-visible shows a visible outline; disabled state
  (opacity/cursor) still applies where relevant.
- Button accessible name remains exactly "Create Room" (no markup/text change).
- Frontend build, lint, and tests pass.

## Validation commands (run in `frontend/`)

- `npm run lint`
- `npm run build`
- `npm run test`  (vitest; `src/App.test.tsx` clicks the button by role/name
  "Create Room", so the class addition must not alter text — it does not.)
- Manual: `npm run dev`, confirm the landing Create Room button is red and Join Room is
  not; verify hover/focus/disabled.

## Edge cases & integration risks

- **Cascade:** a single `.create-room-button` class has equal specificity to
  `.primary-button, .large-button`; without the compound selector it only wins if placed
  later in the file. Use `.primary-button.create-room-button` to be order-independent.
- **Focus contrast:** inherited `outline-color: var(--ink)` (dark) is hard to see on
  red; override to `--cyan`/`--ice` if keeping the focus ring crisp matters.
- **Shared-class trap:** do not edit `.primary-button` or `.large-button` directly.
- **Reduced motion:** the codebase runs ambient animations (`turnPulse`, `fanSway`)
  without a `prefers-reduced-motion` guard, so an animated glow would be consistent; add
  a guard only if desired (out of default scope).
- **Visual balance:** making Create Room red while Join Room stays blue is an
  intentional asymmetry per the request; flag to the user only if they expected parity.
- **Tests:** accessibility-based queries are unaffected by className changes; no test
  asserts on `primary-button`/`large-button` classes.
