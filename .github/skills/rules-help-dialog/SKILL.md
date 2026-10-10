---
name: rules-help-dialog
---

# Rules help dialog

## Feature goal
Add a question-mark help button in the top-right of the Kamboocha table that opens a modal showing the core rules, power-card abilities, and the card value sequence.

## Scope
This feature only affects the front-end interface. It does not change the backend game rules or room flow.

## Requirements
- Place a circular `?` button in the top-right portion of the main header.
- The button must be visible while on the landing page and the in-game table.
- Clicking the button opens a dialog overlay.
- The dialog includes a close button in the top-right with an `X` glyph.
- The dialog includes:
  - a short overview of Kamboocha turn flow,
  - the special ability for each power card,
  - the numeric score value for each card in sequence order,
  - a note that the lowest final score wins.
- The dialog should remain readable, focusable, and dismissible without leaving the game in a broken state.

## Kamboocha game details to reflect
- Every player starts with four hidden cards.
- The opening peek reveals two cards, then hides them again.
- On a turn, the active player draws a card, then may discard it, swap it into a slot, or use a power ability if the drawn card is a power card.
- After a discard or swap, other players have a short reaction window to match the discard rank.
- The lowest total score wins the game.
- Card values are scored as follows: A = 0, 2 = 2, 3 = 3, 4 = 4, 5 = 5, 6 = 6, 7 = 7, 8 = 8, 9 = 9, 10 = 10, J = 11, Q = 12, K = -1.
- Power-card abilities:
  - 7 = peek_self
  - 8 = peek_other
  - J = blind_swap
  - Q = insight_swap

## Implementation notes
- Use the existing React app shell in `frontend/src/App.tsx`.
- Keep the modal content in the same component tree so it stays easy to maintain.
- Prefer existing app styling tokens and layout conventions instead of introducing a second visual system.
- The modal should be simple and read-only; it does not require a backend call or persistent state.

## Acceptance criteria
- A question-mark button appears in the top-right header.
- The dialog box opens on click and closes with the top-right `X` button.
- The dialog lists the rules and power-card abilities clearly.
- The card sequence and values are shown in order.
- The app still builds without TypeScript or CSS errors.

## Validation
- Run the focused frontend test suite.
- Run the frontend build.
