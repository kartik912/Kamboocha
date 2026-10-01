# Kamboocha UI plan

## Context
The brief's "Background" mentions a tarot app, but the actual design request is a multiplayer memory card game called **Kamboocha**. I'm building Kamboocha. If the tarot app is a separate project, say so and I'll redo this. The scaffold is empty (`src/App.tsx` is a blank div, `src/index.css` only imports Tailwind). This is a front-end-only prototype with simulated players and no backend.

## Art direction (one stance: minimalist, classic, tense)
- **Ground:** near-black green-ink felt (`#0d1210`) with a faint paper grain and a soft overhead "lamp" radial vignette. The table is dark and the cards glow.
- **Cards:** cream (`#efe6d2`) faces with ink text. Backs are ink with a thin cream hairline frame and a small "K" monogram. Corner radius is small (6-8px), so the shapes stay simple.
- **Accent:** one signal vermilion (`#e8452c`) for the current turn, danger and the primary CTA. Ready state uses a muted sage (`#8fd19e`) and not-ready uses dim grey. The two states also differ in shape (filled dot with "READY" vs hollow dot with "WAITING"), so color is not the only cue.
- **Type (Google Fonts via `@import` at the top of `src/index.css`):**
  - Bodoni Moda for display: the wordmark, room code and card ranks.
  - Instrument Sans for UI and body text.
  - DM Mono for small caps labels and counters.
- **Motion:** slow breathing glow on hidden cards, a 3D flip on reveal (about 600ms), a vermilion pulse on the active turn, a countdown bar during the memory-test peek, and a staggered deal-in. All of it respects `prefers-reduced-motion`.
- **Tokens:** define CSS variables and a Tailwind v4 `@theme` block in `src/index.css`. There is no `theme.css` in this scaffold.

## Structure
- `src/App.tsx`: holds a `screen` state (`landing | lobby | game`) and the shared mock state. It renders the screen with a crossfade.
- `src/components/Landing.tsx`: the wordmark "Kamboocha" with one line of copy ("Remember everything. Trust no one."), then only two buttons, **Create Room** and **Join Room**. Join Room expands inline into a 4-character code field. A single face-down card fans in the background and slowly sways.
- `src/components/Lobby.tsx`:
  - The room code is large, in Bodoni, with a copy button.
  - The player list shows rows of avatar initial, nickname, "you" and host tags, and a Ready/Waiting badge.
  - A "Ready up" toggle sits at the bottom, and "Start match" appears for the host once everyone is ready.
  - Simulated players toggle ready on timers, and empty seats show as dashed rows ("Waiting for player…").
  - A slow "waiting" dot animation sits next to the status line.
- `src/components/Game.tsx`: the card grid is the hero, a centered 3x2 grid of the player's own cards (6 cards) that scales with viewport. Info boxes are compact mono-labeled chips:
  - Desktop: stage and turn at the top-left and top-right, draw and discard piles at the bottom-left and bottom-right, "Your visible cards" beside the grid.
  - Mobile: they collapse into a compact top strip and a bottom strip, and the grid stays full width.
  - Piles: a draw pile (face-down stack with count) and a discard pile (top card face up with count) in a slim center rail.
  - Stages: **Peek** (the first two cards are shown briefly with a countdown, then flip back), then **Play**.
  - A turn: on your turn, draw from the pile or take the discard, then tap one of your cards to swap it. The old card goes to the discard pile and the swapped-in card stays revealed.
  - Opponent turns are simulated with a short delay, and a "Turn: Mara" banner transitions in.
  - "Your visible cards" lists the ranks you currently know.
- `src/components/ui.tsx`: small shared pieces (`PlayingCard`, `InfoBox`, `Button`, `StatusBadge`) and the mock data and types.

## Verification
- The Vite dev server is already running. Open the preview and click through landing, create/join, lobby ready toggles, start match, peek, flip, draw and swap, and turn passing.
- Check a ~390px mobile viewport and a desktop viewport.
- No build or test run is needed beyond checking the preview for console errors.
