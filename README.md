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

## API surface in use

Current frontend flow depends on these backend endpoints:

- `POST /api/rooms`
- `POST /api/rooms/join`
- `GET /api/rooms/{roomId}?player_id=...`
- `POST /api/rooms/{roomId}/ready`
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

- update the drawn card with a deck of cards image that will change its size with number of cards it have.
- when we draw a card, as a current player, that card should shown at the screen as full size and player should get option as discard or swap
-and if discarded the card will go to the discarded pile
- if swap is choosen, it will go to table signal showing the card, with each card's below will be shown as swap and when clicked on swap it will show an animation where all cards will be shown on all players screen and which card is swapped will be shown.
