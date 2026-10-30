---
name: restore-blue-create-room-button
description: "Revert the landing-page 'Create Room' button from the fancy-red modifier back to the shared blue primary style used by the rest of the app. Covers the exact files to remove, the test expectations to rewrite, and validation for this visual-only revert."
---

# Restore blue Create Room button

Visual-only revert. The landing-page "Create Room" button goes back to the blue
(cyan gradient) primary style that every other primary button uses, undoing the
`create-room-button` fancy-red modifier added in commit `798cf8a` (see the
superseded skill `.github/skills/fancy-red-create-room-button/SKILL.md`).

## Agreed requirements

- The landing "Create Room" button renders with the shared blue primary style
  (`.primary-button, .large-button` cyan gradient, dark text) — no red gradient, no red glow.
- The sibling "Join Room" button is unchanged (`secondary-button large-button`).
- The in-form submit "Create room" button is unchanged (`primary-button`).
- Accessible name stays "Create Room"; copy, `type`, `onClick`, routing unchanged.
- No new CSS variable or color token.

## Decisions / defaults

- **Revert, not restyle.** The blue look is already the shared `.primary-button, .large-button`
  rule. Keeping the `create-room-button` hook and restyling it blue would only duplicate
  that rule. The modifier class and its CSS are removed entirely.
- Assumption: "blue" means the existing app primary (`#d7f3ff → #44dfff`, text `#081530`),
  i.e. the state before `798cf8a`. No user question was needed.

## Non-goals

- No change to `.primary-button`, `.large-button`, `.secondary-button`, or any other button.
- No new palette, token, animation, or focus-ring change.
- No markup or copy change beyond removing the modifier class.
- Not reverting or rewriting git history (see Edge cases).

## Where the code lives

- Markup: `frontend/src/App.tsx` line ~989 —
  `className="primary-button large-button create-room-button"` → remove `create-room-button`.
- Styles: `frontend/src/App.css` lines ~571–587 — the comment block and the three rules
  `.primary-button.create-room-button`, `:hover:not(:disabled)`, and `:focus-visible`.
  Keep the `.primary-button, .large-button` cyan background rule (~565) untouched.
- Tests: `frontend/src/App.test.tsx` lines ~490–545, `describe('landing Create Room button styling')`.

## Implementation steps

1. `frontend/src/App.tsx` ~989: drop `create-room-button` so the class is exactly
   `primary-button large-button`. Nothing else in the JSX changes.
2. `frontend/src/App.css` ~571–587: delete the fancy-red comment and all three
   `.primary-button.create-room-button*` rules. No dead selectors may remain
   (`grep create-room-button` must return nothing in `frontend/src`).
3. `frontend/src/App.test.tsx` ~490–545: keep the describe block and its behavioral
   tests; rewrite only the class assertions that referenced the modifier:
   - Create Room: assert `className` is exactly `primary-button large-button`
     (blue shared primary, no extra modifier). Replaces the `toHaveClass(... 'create-room-button')` test.
   - Join Room: keep `secondary-button large-button`; replace `not.toHaveClass('create-room-button')`
     with an exact `className` check of `secondary-button large-button`.
   - Click-by-name test (opens the create form): unchanged.
   - In-form submit: keep `toHaveClass('primary-button')`; replace the modifier negation with
     an exact `className` check of `primary-button`.
   - Rename the describe to reflect blue: e.g. `landing Create Room button styling (blue)`.
   Do not delete the tests to get green; they are rewritten to assert the blue behavior.

## Acceptance criteria

- Landing Create Room has class exactly `primary-button large-button` and renders with the
  cyan shared primary style (verified visually in `npm run dev`).
- No `create-room-button` string remains in `frontend/src`.
- Join Room and the in-form "Create room" submit are visually and class-wise unchanged.
- Hover lift, focus-visible outline (`--ink`, inherited), and disabled styles behave as before.
- All frontend tests pass (rewritten landing tests included); build passes; lint shows no
  new problems beyond the pre-existing baseline.

## Validation commands (run in `frontend/`)

- `npm run test` — vitest; the landing describe block plus the rest of the suite.
- `npm run build` — `tsc -b && vite build`.
- `npm run lint` — baseline on `main` is 4 errors + 2 warnings, all pre-existing
  (`react-hooks/set-state-in-effect` in `App.tsx`). Must not increase.
- `grep -rn create-room-button frontend/src` — expect no matches.
- Manual: `npm run dev`, confirm Create Room is cyan like Join Room's neighbours, hover/focus/disabled.

## Edge cases & integration risks

- **Unmerged predecessor.** `798cf8a` is on the feature branch
  `feature/2026-10-30-fancy-red-create-room-button` and not on `main` (`origin/main` @ `6433d9a`).
  Prefer a new revert commit over rewriting history; if the user instead wants the fancy-red
  commit dropped entirely, that is a branch-reset decision — stash/commit uncommitted work first.
- **Superseded skill.** `.github/skills/fancy-red-create-room-button/SKILL.md` now describes
  a reverted state. Docs Maintainer should mark it superseded by this skill rather than delete it.
- **Shared classes.** `.large-button` is used by both landing buttons; do not edit it while removing
  the modifier.
- **Weak guard.** jsdom cannot compute gradients, so tests assert class names only; the visual
  check is manual.
