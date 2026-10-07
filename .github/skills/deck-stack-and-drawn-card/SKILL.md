---
name: deck-stack-and-drawn-card
description: 'Implement and maintain the size-scaling draw/discard deck stacks, the large drawn-card display below the hand, and the status-left / actions-right side-rail layout on the Kamboocha game table.'
---

# Deck Stack, Drawn Card, and Rail Layout

## Agreed Behavior

- **Draw pile** is shown as a stacked-card image: card-back artwork on top with offset layers underneath. The number of visible layers grows/shrinks in steps with `draw_pile_count` (0 = empty dashed slot; 1; 2-5; 6-12; 13-22; 23-35; 36+ = 1-6 layers). The numeric count stays visible beside/below the stack.
- **Discard pile** uses the same stacked style, with the latest discard shown face-up on top of a stack whose thickness reflects `discard_pile_count`. Empty state is a dashed slot.
- **Drawn card**: when it is the current player's `resolve` turn phase, the pending drawn card is shown as a large face-up card directly below the hand (not in a text banner). Next to it: a `Discard` button and, when applicable, the `Use <rank> ability` button. Swapping stays "click `Swap with drawn card` on a hand slot". Discarding sends the card to the discard pile (existing behavior).
- **Rail layout (inspired by `persona_design/src/components/Game.tsx`)**: status on the left, actions on the right, so players do not hunt for information.
  - Left rail: stage + visible-count (compact pair), current turn, table roster (compact), Kamboocha caller notice, memory-reveal and reaction-window panels.
  - Right rail: draw pile, discard pile, power target selectors.
  - Compact rows/padding so the desktop game screen fits without scrolling in normal cases.

## Explicit Non-Goals

- No backend, API, or game-rule changes. No change to polling, swap overlay, leaderboard, or table signal behavior.
- No full rework of the central table beyond the drawn-card placement and light compaction (the user chose "piles and rails only").
- No new draw/discard animation; existing pulse/reshuffle animations are kept.
- No test additions until the user confirms manual validation (then hand off to `Feature Test Author`).

## Files and Boundaries

- `frontend/src/App.tsx`: `CardStack` component and `stackLayerCount` helper (module level, near `cardTone`); game-screen JSX (left rail, `table-stage`, right rail).
- `frontend/src/App.css`: `.card-stack*`, `.pile-box`, `.held-card*`, compact rail rules. Theme tokens come from `frontend/src/index.css` (`--cyan`, `--ink`, `--card-back-image`, etc.).
- Reference only: `persona_design/` (do not import from it; it is a prototype).

## Implementation Steps

1. Add `stackLayerCount(count)` and `CardStack({ count, variant, faceCode })` in `App.tsx`. Stack layers are decorative (`aria-hidden`); the count and a visible text label carry the information. Layer offset is driven by CSS custom properties `--stack-layers` and `--layer-index`.
2. Replace `.mini-card-back` and `.discard-chip` usage in the right rail with `CardStack`, keeping the existing `info-box`, pulse classes, `discard-burst`, and `reshuffle-burst` elements and the draw button's disabled logic.
3. Remove the old `Drawn card:` action banner and add a `.held-card-panel` after the hand: large face-up card (`.held-card`, tone-aware), instructions, `Discard`, optional power button. Preserve `handleDiscardCard`, `handleStartPower`, and `pendingAction` states.
4. Move the roster (`Table`) and Kamboocha caller notice to the left rail; compact the left rail info boxes (stage + visible side by side).
5. Compact roster rows and the signal panel slightly so the stage fits in one viewport.
6. Keep responsive rules: at <=1100px rails are compact grids; stack and held card scale down.

## Acceptance Criteria

- Draw and discard piles render as stacks whose thickness steps with their counts; changing counts across thresholds visibly changes the stack; 0 shows an empty slot.
- Top discard is face-up and readable; draw pile shows the card-back image.
- During the resolve phase the drawn card is large, below the hand, with Discard (and ability) controls; hand slots still offer swap.
- Left rail shows status/roster/notices; right rail shows piles and power targets.
- `get_errors` is clean and `npm run build` passes; reduced-motion users get no new animation.

## Validation

- From `frontend/`: `npm run build`.
- Manual: play a round with 2+ clients; draw a card (large card appears below hand), discard it, swap it, trigger a power card, watch piles change thickness as counts cross thresholds; check at ~1280x720 and on a narrow viewport.

## Edge Cases and Risks

- Pending drawn code can be `null` while phase is `resolve` briefly; render nothing in that case.
- Large layer offsets must not overflow the rail (margins scale with `--stack-layers`).
- Disabled draw button must keep the stack readable (do not rely on opacity alone for count).
- The right rail still hosts the `reshuffle-stream` absolute overlay; keep `position: relative`.
