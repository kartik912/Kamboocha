---
name: shared-swap-animation
description: 'Implement and maintain the shared, privacy-preserving card-swap animation shown to every player after any successful swap in Kamboocha.'
---

# Shared Swap Animation

## Agreed Behavior

- Show a short swap animation to all clients in a room after every completed swap.
- Support two visual forms: a drawn card moving into the current player's selected slot, and two selected slots exchanging between two players.
- Include ordinary drawn-card swaps and both player-to-player power swaps (`J` blind swap and `Q` insight swap). Do not show an animation for a power setup/reveal step until a swap actually completes, or when the player skips the Q swap.
- Identify involved players by nickname and render each involved player's full row of card slots. Highlight the involved slot position(s) and render card backs only; never expose swapped card codes or otherwise change hidden-card knowledge.
- Briefly block actions for all clients while the animation is playing, then dismiss automatically after 5 seconds. Enforce the lock in the game engine as well as with a client overlay, and honor reduced-motion preferences.
- Event delivery must cooperate with the existing one-second room polling: each connected client should play each new swap event once, including non-acting players.

## Architecture and Ownership

- Active backend behavior is in `backend/app/domain/engine.py`, `backend/app/domain/models.py`, `backend/app/services/rooms.py`, and `backend/app/api/rooms.py`.
- `swap_pending_card` completes the draw-to-player swap. `execute_power_action` completes J and Q player-to-player swaps; Q's first call only reveals cards and its skip path is not a swap.
- `_room_response` in `backend/app/api/rooms.py` builds the player-specific `RoomSummary`. Card faces are intentionally filtered there; the swap event must be public metadata only and must not include card codes.
- Room mutations return a `RoomSummary` immediately. Other clients discover room changes through the one-second polling effect in `frontend/src/App.tsx`.
- Frontend state/types, polling, and all action controls live in `frontend/src/App.tsx`. Existing card backs and visual conventions are defined in `frontend/src/App.css` and `frontend/src/index.css`.
- Backend tests use `backend/tests/test_api.py` and `backend/tests/test_engine.py`; frontend has a Vite/TypeScript build but no configured test runner was found during feature discovery.

## Implementation Procedure

1. Add a typed, uniquely identifiable swap event to the authoritative in-memory `GameSetup`. Record it only after a successful swap, with kind (`drawn` or `player`), actor ID, actor slot, optional target player ID and target slot, and creation time. Do not include card identity/code.
2. Emit the event from both completed-swap locations: `swap_pending_card` and the successful swap branches in `execute_power_action`. Do not emit during Q reveal-only setup or skip-swap finalization.
3. Add a public response model and serialize the current fresh event in `_room_response` for every room member. Resolve nicknames from room/game player records as needed. Ensure serialization cannot expose card faces and that stale events are no longer offered after a reasonable polling grace period.
4. Extend the frontend response types and room poll handling. Detect a new event by its unique ID; do not replay the same event on every poll or replay an expired event after loading a room.
5. Render a fixed, accessible overlay with two distinct layouts: draw-pile-to-full-player-hand and full-player-hand-to-full-player-hand. Show all card slots for each involved player using backs only, highlight the exchanged slot(s), and animate the draw-to-slot or cross-player transfer. Respect `prefers-reduced-motion` while retaining event information.
6. While the overlay is active, prevent game actions for every client with an interaction-blocking overlay and an authoritative engine guard. Extend swap-triggered reaction expiry by the lock duration so players retain the full reaction window. Clear the overlay automatically after the short animation duration, and clean up timers when the event changes or the view unmounts.
7. Keep the game authoritative state and existing card-knowledge rules unchanged. Do not add persistence, websocket transport, or public card reveal as part of this feature.

## Acceptance Criteria

- A normal drawn-card swap produces the draw-to-slot animation for the actor and every other player polling that room.
- A completed J blind swap and Q insight swap each produce the player-to-player animation for all players.
- A Q reveal step with no completed swap and a skipped Q swap do not produce a swap animation.
- The animation names the involved player(s), displays all their card slots, highlights the exchanged slot(s), never displays card faces, and leaves each player's existing private card visibility unchanged.
- The overlay and engine block player actions for 5 seconds during playback, dismiss automatically, and do not replay the same event on subsequent polls. Swap reactions retain their normal five seconds after the animation lock.
- A stale event does not replay when a client joins or reloads after its animation window.
- API serialization and existing room/game flows remain valid; frontend TypeScript production build succeeds.

## Validation

- Run focused backend checks: from `backend/`, `python -m pytest tests/test_engine.py tests/test_api.py`.
- Run frontend typecheck/build: from `frontend/`, `npm run build`.
- During the post-implementation user-validation phase, manually verify with at least two clients: drawn swap; J swap; Q swap; card backs remain hidden; controls are blocked only during playback; event is not repeated on the next poll.
- Do not add the feature's regression tests during implementation. After the user explicitly confirms manual validation, hand the skill path, acceptance confirmation, implementation files, and scenarios to the `Feature Test Author` agent for regression tests.

## Edge Cases and Integration Risks

- The poll response represents one shared latest event, so give it a unique ID and a freshness window long enough for the one-second poll while short enough to avoid replaying stale animation after reconnect.
- Do not use timestamps alone as event identity; clocks or equal-time events can collide.
- The Q power has a multi-step lifecycle. Emit only after the final exchange, not after revealing cards or skipping.
- Turn state may advance in the same mutation that creates the event. The overlay should cover the active game UI without depending on the actor still being current player.
- More than one mutation can arrive before a slow client polls. Keep the implementation bounded and report this delivery limitation if a queue or durable event stream would be needed; do not introduce a new transport in this feature.
- Keep animation dimensions responsive and ensure the overlay and text do not overflow on mobile.
