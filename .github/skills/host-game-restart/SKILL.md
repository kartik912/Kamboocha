---
name: host-game-restart
description: 'Implement and maintain host-only game restart in the same Kamboocha room, with confirmation, a freshly shuffled deal, and clean state for every player.'
---

# Host Game Restart

## Agreed Requirements

- Show Restart game beside Leave room only to the room creator (host), once a game exists.
- Allow restart during opening preview, any active turn or animation, and after the game finishes.
- Show one destructive-action warning with OK and Cancel. Cancel makes no request; OK immediately starts a fresh opening deal.
- Preserve room ID/code, host, player IDs, nicknames, membership, and seat order. Do not return players to lobby readiness or require rejoining.
- Reuse the standard shuffled 52-card opening deal: four cards per player, first two privately visible, everyone must confirm opening Ready again, first seat starts.
- Replace the entire game state, clearing penalties, removed slots, discard history, drawn cards, power/reaction state, animations, final round, winners, and activity.
- A fresh shuffle can coincidentally repeat individual cards; do not promise every card is different or change the deck composition.
- Non-goals: host transfer, scoring across games, persistence, new authentication, new transport, changed turn order, and prototype updates.

## Architecture

- Production backend: `backend/app/services/rooms.py` owns the in-memory RoomStore and immutable room membership during matches.
- `backend/app/domain/engine.py:deal_opening_layout` creates GameSetup using `shuffled_deck` with no fixed seed.
- `backend/app/domain/models.py:GameSetup` owns match state; add a UUID game_id so repeated preview-to-preview restarts are detectable.
- `backend/app/api/rooms.py:_room_response` owns private card filtering. Expose game_id in GameSummary, not deck identities.
- Add POST `/api/rooms/{room_id}/restart` accepting `{player_id}` through the existing TurnActionRequest. Enforce the host check server-side, return 403 for a non-host, 404 for a missing room, and 400 when no game exists. Return the host-filtered RoomSummary.
- `frontend/src/App.tsx` owns room polling, requests, and local selections/animations. Reset transient state on game_id changes for both request and polling responses.
- The page's swap overlay and inert main must leave header room controls usable without enabling gameplay beneath the animation.
- `frontend/src/App.css` owns header and overlay layout. `figma_design/` and `persona_design/` are not production.
- Existing tests: `backend/tests/test_api.py`, `backend/tests/test_engine.py`, `frontend/src/App.test.tsx`.

## Procedure

1. Add a default UUID game_id to GameSetup and serialize it in GameSummary.
2. Add RoomStore.restart_game: validate room, host, and existing game before mutation; call deal_opening_layout with existing player IDs/nicknames in seat order; assign the new state and set status to peeking.
3. Wire the POST restart endpoint using existing response and error conventions plus a permission error mapped to 403.
4. Add restart to RoomAction, a host-only pending-disabled header control and handler, and a single window.confirm warning explaining that progress is lost and the same players receive new cards.
5. On a new game_id, clear power selections, swap playback/event tracking, Kamboocha confirmation, deck animation refs/pulses/banners, stale errors and status messages. Preserve room/session identity. Abort/ignore old poll responses when pending requests or membership changes.
6. Keep header room controls above and outside the swap interaction lock; retain lock on gameplay content.
7. Run existing checks, update README through README Maintainer, and request manual validation. Do not add new regression cases until explicit user acceptance; then delegate to Feature Test Author.

## Acceptance And Validation

- Two clients retain the same room and players after restart, observe a new game_id and opening peek, and can begin the next game normally.
- Non-host sees no restart control and cannot restart through the API using their own player_id.
- Cancel preserves the existing game; failed requests show an error and leave the old match intact.
- Restart works during preview (including repeated restarts), resolve/power/reaction/swap states, final round, and finished leaderboard.
- Four cards per player, no penalties, fresh draw pile of 52 minus four times player count, empty discard, and no old match state. Other players' cards remain hidden.
- From `frontend/`: `npm run build` and `npm run test -- src/App.test.tsx`.
- Backend required procedure from `backend/`: activate `.venv` first (`source .venv/bin/activate` on POSIX; `& .\.venv\Scripts\Activate.ps1` on Windows), then `python -m pytest tests/test_engine.py tests/test_api.py`. If backend/.venv is absent, report the blocker; never silently substitute system/root Python.
- The user explicitly approved using the existing root `.venv` for this feature on 2026-10-12. From `backend/` on this Windows workspace, activate it with `& ..\.venv\Scripts\Activate.ps1` before running the same pytest command or `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`. Do not substitute system Python if activation fails.
- Manual checks: host and guest screens, warning Cancel/OK, restart in preview, active power/swap, and finished game; confirm no stale overlays/selections and unchanged room code.

## Risks

- Authorization follows existing player_id bearer identity; this is not a new login/session system.
- Room mutations and responses use in-memory state; restarting the backend still loses rooms.
- Other clients discover restarts on the next one-second poll, not simultaneously. No durable event queue is added.
- Reset based on game_id, not stage or room ID: both can remain unchanged across restart.
- Do not clear fresh swap events indefinitely or relax the authoritative gameplay animation lock; only room management bypasses it.