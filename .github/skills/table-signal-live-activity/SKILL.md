---
name: table-signal-live-activity
description: 'Maintain the Kamboocha table signal as a concise, entertaining display of the latest public match activity without revealing private card information.'
---

# Table Signal Live Activity

## Agreed Behavior

- Replace the current mostly-local status message with a shared, server-authored latest-activity signal visible to every player through room polling.
- Show only the latest event. A newer event replaces the prior event; do not keep or display an activity history and do not add persistence.
- Keep it quick to scan and entertaining, using a short phrase with an appropriate emoji.
- Identify who acted and what public action occurred. For swaps, identify the player(s) and swapped slot position(s) when available.
- Never reveal card face, rank, suit, drawn-card identity, private peek values, or other concealed card knowledge in the activity event or its rendered text. For a discard, report only that a card was discarded. For a power, report only that a power was used, not its rank or card.
- Cover public gameplay activity: turn/draw, discard, all successful swaps, power use, reaction outcomes, Kamboocha call/final-round transition, turn passed, and match result. No historical feed, event queue, or archival storage is in scope.

## Architecture and Ownership

- Backend authoritative match state is in `backend/app/domain/models.py`; game mutation/control flow is in `backend/app/domain/engine.py`; room-level ready/join/turn wrappers are in `backend/app/services/rooms.py`.
- The API's player-specific public room representation is built by `_room_response` in `backend/app/api/rooms.py`. It already filters hidden card faces; activity serialization must be equally privacy-safe and shared for all clients.
- Frontend room types, polling, local action handling, and the Table signal markup are in `frontend/src/App.tsx`. Styles are in `frontend/src/App.css`.
- Frontend room polling runs once per second. The activity should be stored as a single latest event on `GameSetup`, not as a list, and a unique event id allows clients to distinguish new events even when two events share a second.
- Backend tests follow `backend/tests/test_engine.py` and `backend/tests/test_api.py`; use existing patterns. The frontend check is `npm run build`.

## Implementation Procedure

1. Define a typed `ActivityEvent` in `backend/app/domain/models.py` with a UUID event id, event kind, actor id, optional target id, optional slot positions or safe outcome metadata, and UTC creation time. Explicitly exclude card objects, card codes, ranks, suits, peek results, and raw arbitrary message text.
2. Add one nullable `activity_event` field to `GameSetup`. Replace it on each public gameplay event; never append to a history list.
3. Record events at the authoritative successful mutation points in `backend/app/domain/engine.py` and room transitions in `backend/app/services/rooms.py` as needed. Distinguish a draw from its subsequent discard/swap; emit a power-used event when the power is actually consumed, not on private reveal/setup. For swap actions, keep existing swap-event metadata compatible and ensure it contains no identities.
4. Cover public reaction outcomes, Kamboocha/final-round call, turn advance, and game finish. Avoid emitting duplicate competing events for one atomic action; pick one concise event that best communicates the outcome.
5. Serialize only safe event fields via a response model in `backend/app/api/rooms.py`, resolving player display names server-side. Return the same latest event to each room member. Do not put card values in event fields, messages, logs, or tests.
6. Extend frontend TypeScript types. Render one emoji-led, concise signal derived from the event kind and safe metadata. Do not let `buildRoomMessage` or local action responses overwrite a newer shared activity event; keep room/lobby notices separate from the live-game signal or use event-id-aware precedence.
7. Ensure the latest item is shown on clients that poll after mutation. Since only latest state is retained, do not add replay history; a joining/reloading player may see the current fresh event but older events are intentionally unavailable. Optionally age out the display as a presentation detail, but never build history.
8. Validate backend and frontend using repository commands from the required working directories/environment. Run backend Python commands only after `cd backend && source .venv/bin/activate`; if environment activation fails, do not use system Python. Run npm scripts from `frontend/`.

## Acceptance Criteria

- The Table signal updates for everyone when a public gameplay action occurs, including clients receiving the new room state through polling.
- At any moment, the UI displays only one latest activity item; a later event replaces it and no history list is stored or rendered.
- Messages are brief, clear, entertaining, and use an appropriate emoji.
- Draw, discard, swap, power, reaction, Kamboocha/final-round, turn-advance, and match-result events are meaningfully distinguished.
- Swap messages identify who swapped and relevant slot positions where available. Draw/discard/power messages disclose no card identity.
- Card rank, suit, code, private peek result, and hidden-card contents are never revealed by the new activity contract.
- Existing gameplay behavior and the shared swap animation continue to work.
- `source .venv/bin/activate && python -m pytest tests/test_engine.py tests/test_api.py` succeeds from `backend/`; `npm run build` succeeds from `frontend/`.

## Edge Cases and Integration Risks

- A one-item latest-event field can overwrite activity if several different actions occur between polls. This is an accepted consequence of the explicit no-history requirement; do not silently add a queue. Verify that normal action cadence and the existing action lock make event replacement understandable.
- A successful reaction changes public state differently from a failed reaction; describe outcome without publishing the hidden matching card identity.
- An insight power briefly reveals identities only to its actor. The public event must not copy those reveal fields.
- Terminal transitions may both advance a turn and finish the game; the final result should take precedence over a generic turn-advance event.
- Keep swap animation event data and table activity distinct enough that the animation still triggers, while avoiding duplicate visual narratives or exposing card identities.
- Use explicit safe event kinds rather than generating text from untrusted or card-derived values.
