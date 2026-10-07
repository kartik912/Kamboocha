---
name: endgame-leaderboard
description: "Implement the finished-game leaderboard that shows every player's final score, reveals all cards, sorts by lowest score first, highlights tied leaders, and replaces the old winner-only panel."
---

# Endgame Leaderboard

## Agreed behavior

- When the game reaches `finished`, every player's screen shows a leaderboard for the full table.
- The leaderboard uses the final score from each player's revealed endgame hand.
- Lower scores appear at the top and higher scores appear at the bottom.
- If multiple players share the best score at the top of the list, all tied leaders are highlighted.
- The old standalone winner-only panel is removed.
- The finished-game hand reveal remains in place, so every card is face up when the leaderboard appears.

## Non-goals

- Do not change the existing scoring rules.
- Do not add round-by-round scoring history.
- Do not alter the backend game resolution logic or winner determination.
- Do not expose intermediate hidden-card data before the game ends.

## Relevant code paths

- Frontend endgame rendering lives in [frontend/src/App.tsx](frontend/src/App.tsx).
- Endgame card visibility already switches to face up in the finished stage.
- The backend already exposes the full final card state for finished games through the room payload.

## Implementation plan

1. Add a small client-side scoring helper that maps a revealed card code to its Kamboocha score value.
2. Derive each player's final score from the revealed cards already present in the finished-game payload.
3. Sort the leaderboard ascending by score, then by stable display fields as needed for ties.
4. Compute the best score from the sorted list and highlight every player whose score matches that best score.
5. Replace the current final reveal / winner panel with the leaderboard markup.
6. Preserve the existing full-card reveal so the leaderboard sits alongside the revealed hand view rather than replacing card visibility.

## Edge cases and risks

- Tied lowest scores must all be highlighted, not just the first row.
- The UI should not depend on hidden-card information; only finished-game data should drive the leaderboard.
- The leaderboard must remain consistent across all players because the finished payload is shared.
- If the game is not finished, the leaderboard should not render.

## Acceptance criteria

- The finished-game view shows a leaderboard on every player's screen.
- Rows are ordered from lowest score to highest score.
- All tied best-score rows are highlighted.
- The old winner-only panel is gone.
- Every listed player is shown with a face-up final hand and final score.

## Validation

- Run the frontend build from `frontend/` after the UI update.
- If any frontend logic changes affect TypeScript types or layout, verify the build completes without errors.