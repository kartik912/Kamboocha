# Kamboocha

Kamboocha is a multiplayer memory-and-bluff card game web app built with a React + TypeScript frontend and a FastAPI backend. The current version is a playable private-room prototype with a server-authoritative rules engine, live room polling, animated game UI, and end-to-end gameplay from lobby to finished-game leaderboard.

## Current status

The project now includes a working multiplayer flow for 2 to 10 players:

- Private room creation and joining by room code.
- Lobby ready-state flow for all players.
- Opening peek phase where each player briefly sees two cards, then hides them again.
- Turn-based play with draw, discard, and swap.
- Reaction window after a discard, with rank matching, penalties, and one successful claimant.
- Power cards:
  - `7` peek one of your own cards, then hide it again.
  - `8` peek one card from another player, then continue.
  - `J` blind swap.
  - `Q` reveal both cards, confirm, then swap.
- Kamboocha call and final-round flow.
- Finished-game leaderboard where all cards flip face up, every player's final score is shown, rows are sorted by lowest score first, and tied leaders are highlighted.
- Draw-pile refill by reshuffling only real discarded cards back into the deck when needed.
- Host-only game restart with a fresh deal in the same room, available during opening preview, active play (including swap animation), and after the game finishes.

## Frontend

The frontend lives in `frontend/` and is built with Vite, React, and TypeScript.

Implemented frontend features include:

- A redesigned animated landing page with only two primary actions: `Create Room` and `Join Room`.
- A room lobby showing the room code, player roster, and ready state.
- A thriller-styled live game table with:
  - your cards centered,
  - compact side information rails,
  - animated table signal and turn emphasis, including safe narration for power-card phases,
  - animated card flips,
  - discard / draw pile motion,
  - discard-to-draw reshuffle animation.
- A finished-game leaderboard that reveals every player's final cards, sorts scores ascending, and highlights tied leaders.
- Hidden card backs using the provided card-back image asset.
- Live room and game updates via polling.
- Host-only `Restart game` beside `Leave room` once a game exists, with one native OK/Cancel confirmation: Cancel sends no request; OK requests a fresh deal. Room controls remain accessible during swap playback while gameplay stays locked.
- A changed `game_id` clears local power selections, swap playback, pending Kamboocha confirmation, deck animation state, and stale errors; other clients discover the restart through polling.
- Draw and discard piles drawn as stacked-card decks whose thickness steps with the number of cards left (empty piles show a dashed slot; the top discard is face-up).
- The drawn card appears large and face-up below your hand with `Discard it` (and the power button when it applies); swap by choosing a slot.
- Game rails split by purpose: turn, stage, roster, and notices on the left; draw/discard piles and power targets on the right.
- UI/accessibility refinements that keep the Persona-style theme:
  - required markers, hints, and inline validation on the landing forms,
  - a confirm step for `Call Kamboocha` and for leaving a live match,
  - power targeting that only offers valid slots and disables the action until the selection is complete,
  - dismissible error toast, live-region announcements for the table signal, rank badges on the leaderboard,
  - larger minimum text sizes, visible focus rings, `prefers-reduced-motion` support, and compact side rails on small screens.

## Backend

The backend lives in `backend/` and is built with FastAPI.

Implemented backend features include:

- Health endpoint.
- Room creation, joining, ready toggles, and room fetch endpoint.
- Server-authoritative game state and turn logic.
- Opening preview confirmation flow.
- Draw, discard, swap, reaction, power, and finalize-turn endpoints.
- Kamboocha final-round resolution.
- Endgame final-score handling and full-card reveal serialization.
- Draw-pile reshuffle from discard pile without introducing duplicate cards.
- Server-enforced host-only restart through `RoomStore.restart_game`, replacing the entire game state while preserving the room and roster. Each fresh game has a UUID `game_id`, exposed in `GameSummary`.

## Project structure

- `frontend/` React client.
- `backend/` FastAPI service and tests.
- `persona_design/` design prototype and reference implementation used to guide the visual redesign.

## Run locally

### Frontend

```powershell
Set-Location frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `http://127.0.0.1:8000`.

### Backend

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pip install -e .[dev]
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

### Tests

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest
```

Current backend test coverage includes room flow, deck rules, reactions, powers, Kamboocha, endgame reveal, and discard-to-draw reshuffling.

Frontend tests use Vitest and Testing Library with a mocked API:

```powershell
Set-Location frontend
npm test
```

Current frontend test coverage includes the draw/discard deck stacks, the drawn-card panel, the left/right rail layout, and the power target slot dropdown.

Host-restart implementation validation: `npm run test -- src/App.test.tsx` passed all 45 existing frontend tests, `npm run build` passed, and editor diagnostics reported no errors. With explicit user approval to use the root `.venv` instead of the missing `backend/.venv`, `../.venv/Scripts/Activate.ps1` was activated from `backend/` and `VIRTUAL_ENV` verified; `python -m pytest tests/test_engine.py tests/test_api.py` passed all 28 tests with one upstream Starlette/httpx deprecation warning. Backend uvicorn runs at `http://127.0.0.1:8000` and the frontend at `http://127.0.0.1:5173`. A disposable live two-player API smoke check through the frontend proxy passed: health; guest restart rejected with 403 without changing the game ID; host restart during drawn-card resolution preserving room ID/code, host, and roster while creating a new game ID and returning to preview/peeking; 44 draw cards and an empty discard; cleared drawn-card, power, reaction, swap, activity, and winner state; four cards, no penalties, and preview Ready false for each player; repeated preview restart producing another new game ID; guest fetch observing the latest game ID, with only the guest's own two opening cards visible and all host cards hidden. This was a runtime smoke check, not new automated regression coverage or verification of every restart phase or the UI warning. No new regression cases were added; manual user acceptance remains pending. The user's approval covered the environment substitution only, not feature acceptance.

## Gameplay notes

- Deck: standard 52-card deck, no jokers.
- Player count: 2 to 10.
- Card values:
  - `K = -1`
  - `A = 0`
  - `2-10 = face value`
  - `J = 11`
  - `Q = 12`
- Matching discarded cards is based on rank, not suit.
- The player who discarded cannot reclaim that discard.
- The game preserves the active top discard during a reaction window, even if the rest of the discard pile must be reshuffled into the draw pile.
- After resolving a draw/discard/swap and any power, once any reaction window closes, the acting player must choose `End turn` or `Call Kamboocha`; turns do not finish automatically. `Call Kamboocha` requires confirmation, and `Cancel` leaves the turn unfinished. Once Kamboocha has been called, remaining final-round players see only `End turn`.
- Restart preserves the room ID/code, host, player IDs, names, membership, and seat order without returning to lobby readiness or requiring rejoining.
- Restart shuffles a fresh standard 52-card deck and deals four cards per player. Players privately peek at their first two cards and confirm opening `Ready` again; the first seat starts. Individual cards can coincidentally repeat after a shuffle.
- Restart clears all prior match state: penalties, removed slots, discard history, drawn cards, powers, reactions, swap events, activity, the final round, and winners.

## API surface in use

Current frontend flow depends on these backend endpoints:

- `POST /api/rooms`
- `POST /api/rooms/join`
- `GET /api/rooms/{roomId}?player_id=...`
- `POST /api/rooms/{roomId}/ready`
- `POST /api/rooms/{roomId}/restart` with `{ "player_id": "..." }`: returns a host-filtered `RoomSummary` with a new `game.game_id`; non-host requests return `403`, missing rooms return `404`, and rooms without a game return `400`.
- `POST /api/rooms/{roomId}/opening-ready`
- `POST /api/rooms/{roomId}/draw`
- `POST /api/rooms/{roomId}/discard`
- `POST /api/rooms/{roomId}/swap`
- `POST /api/rooms/{roomId}/react`
- `POST /api/rooms/{roomId}/power/start`
- `POST /api/rooms/{roomId}/power/resolve`
- `POST /api/rooms/{roomId}/finalize`

## Remaining work

The project is now beyond the initial scaffold and into a working prototype, but some major pieces are still pending:

- Replace polling with WebSockets for lower-latency multiplayer updates.
- Add MongoDB persistence for rooms, reconnects, and finished game summaries.
- Improve mobile layout and responsive behavior further for smaller screens.
- Add richer table animations and polish for card movement, reactions, and endgame presentation.
- Add stronger API / integration coverage around full match flows.

## TODO
- add a pop up showing the swapping of cards
 - like when i swap my card with a drawn card
 - when i swap my card with someone else's
 - it will show a small animation type that will show the list of cards of both players and will by animation show that card are beign swapped
 - 2 type of animation needed
 - one is swapping my card with the drawn card
 - swapping my card with someone else's card

- when we draw a card, as a current player, that card should shown at the screen as full size and player should get option as discard or swap
-and if discarded the card will go to the discarded pile
- if swap is choosen, it will go to table signal showing the card, with each card's below will be shown as swap and when clicked on swap it will show an animation where all cards will be shown on all players screen and which card is swapped will be shown.
