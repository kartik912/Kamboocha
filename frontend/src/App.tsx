import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
const apiUrl = (path: string) => `${API_BASE_URL}${path}`

const suitSymbols: Record<string, string> = {
  C: '♣',
  D: '♦',
  H: '♥',
  S: '♠',
}

type ApiStatus =
  | { state: 'checking'; message: string }
  | { state: 'online'; message: string }
  | { state: 'offline'; message: string }

type PlayerSummary = {
  player_id: string
  nickname: string
  seat_index: number
  ready: boolean
  joined_at: string
}

type CardSummary = {
  position: number
  has_card: boolean
  code: string | null
  known_to_player: boolean
}

type GamePlayerSummary = {
  player_id: string
  nickname: string
  seat_index: number
  cards: CardSummary[]
  visible_card_count: number
  total_card_count: number
  penalty_cards: number
  preview_ready: boolean
}

type ReactionSummary = {
  latest_discard_code: string
  seconds_remaining: number
  already_reacted: boolean
}

type PowerSummary = {
  action: 'peek_self' | 'peek_other' | 'blind_swap' | 'insight_swap'
  actor_player_id: string
  awaiting_ready: boolean
  revealed_self_code: string | null
  revealed_target_code: string | null
  selected_target_player_id: string | null
}

type GameSummary = {
  stage: 'preview' | 'active' | 'finished'
  current_player_id: string
  draw_pile_count: number
  discard_pile_count: number
  reshuffle_count: number
  turn_phase: 'draw' | 'resolve' | 'power' | 'post_turn'
  pending_drawn_card_code: string | null
  discard_pile_codes: string[]
  reaction_window: ReactionSummary | null
  power_state: PowerSummary | null
  kamboocha_caller_id: string | null
  final_round_remaining_player_ids: string[]
  winner_player_ids: string[]
  players: GamePlayerSummary[]
}

type RoomSummary = {
  session_player_id: string
  room_id: string
  code: string
  host_id: string
  status: string
  min_players: number
  max_players: number
  created_at: string
  players: PlayerSummary[]
  game: GameSummary | null
}

type FormState = {
  nickname: string
  maxPlayers: string
  joinCode: string
}

type PowerSelection = {
  selfPosition: number | null
  targetPlayerId: string
  targetPosition: number | null
}

type RoomAction =
  | 'create'
  | 'join'
  | 'ready'
  | 'opening-ready'
  | 'draw'
  | 'discard'
  | 'swap'
  | 'react'
  | 'power-start'
  | 'power-resolve'
  | 'end-turn'
  | 'call-kamboocha'

type LandingMode = 'create' | 'join' | null

function formatCardLabel(code: string | null, hasCard: boolean): string {
  if (!hasCard) {
    return 'Empty'
  }

  if (!code) {
    return 'Hidden'
  }

  const rank = code.slice(0, -1)
  const suit = suitSymbols[code.slice(-1)] ?? code.slice(-1)
  return `${rank}${suit}`
}

function cardTone(code: string | null): 'tone-red' | 'tone-black' {
  return code?.endsWith('D') || code?.endsWith('H') ? 'tone-red' : 'tone-black'
}

function cardRank(code: string | null): string | null {
  return code ? code.slice(0, -1) : null
}

function formatStageLabel(stage: GameSummary['stage']): string {
  if (stage === 'preview') {
    return 'Opening Peek'
  }
  if (stage === 'active') {
    return 'Live Round'
  }
  return 'Showdown'
}

function formatPowerLabel(action: PowerSummary['action']): string {
  if (action === 'peek_self') {
    return 'Seven'
  }
  if (action === 'peek_other') {
    return 'Eight'
  }
  if (action === 'blind_swap') {
    return 'Jack'
  }
  return 'Queen'
}

function buildRoomMessage(action: RoomAction, room: RoomSummary): string {
  if (action === 'create') {
    return `Room ${room.code} created. Share the code and wait for players.`
  }
  if (action === 'join') {
    return `Joined room ${room.code}. Click ready when you are seated.`
  }
  if (action === 'opening-ready') {
    return room.status === 'in_game'
      ? 'All players confirmed the opening peek. The first player can draw now.'
      : 'Your opening cards are hidden again. Waiting for the other players.'
  }
  if (action === 'draw') {
    return 'Card drawn. Choose whether to discard it or swap it into one of your slots.'
  }
  if (action === 'discard') {
    return 'Card discarded face up. Other players now have 5 seconds to match its rank.'
  }
  if (action === 'swap') {
    return 'Card swapped. Your replaced card is now face up and other players have 5 seconds to match its rank.'
  }
  if (action === 'react') {
    return 'Reaction processed. If the rank did not match, a penalty card was added to your pile.'
  }
  if (action === 'power-start') {
    return 'Select the cards required for this power ability.'
  }
  if (action === 'power-resolve') {
    return 'Power resolved and the drawn power card is now in the discard stack.'
  }
  if (action === 'call-kamboocha') {
    return 'Kamboocha called. Every other player now gets one final turn.'
  }
  if (action === 'end-turn') {
    return room.status === 'finished' ? 'Game finished. Winners are shown below.' : 'Turn passed to the next player.'
  }
  if (room.status === 'peeking') {
    return 'Opening peek is live. Check your two visible cards, then click ready again to hide them.'
  }
  if (room.status === 'in_game') {
    return 'Game is live. Follow the turn controls below.'
  }
  return 'Ready state updated.'
}

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    state: 'checking',
    message: 'Checking FastAPI health endpoint...',
  })
  const [room, setRoom] = useState<RoomSummary | null>(null)
  const [landingMode, setLandingMode] = useState<LandingMode>(null)
  const [formState, setFormState] = useState<FormState>({
    nickname: '',
    maxPlayers: '6',
    joinCode: '',
  })
  const [powerSelection, setPowerSelection] = useState<PowerSelection>({
    selfPosition: null,
    targetPlayerId: '',
    targetPosition: null,
  })
  const [roomMessage, setRoomMessage] = useState('Choose whether to create a private room or join an existing one.')
  const [roomError, setRoomError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<RoomAction | null>(null)
  const [drawPulseTick, setDrawPulseTick] = useState(0)
  const [discardPulseTick, setDiscardPulseTick] = useState(0)
  const [discardBurstLabel, setDiscardBurstLabel] = useState<string | null>(null)
  const [reshufflePulseTick, setReshufflePulseTick] = useState(0)
  const [reshuffleBannerVisible, setReshuffleBannerVisible] = useState(false)
  const previousDrawCountRef = useRef<number | null>(null)
  const previousDiscardTopRef = useRef<string | null>(null)
  const previousReshuffleCountRef = useRef<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadHealth() {
      try {
        const response = await fetch(apiUrl('/api/health'), { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const payload = (await response.json()) as { status: string; timestamp: string }
        setApiStatus({
          state: 'online',
          message: `Backend ${payload.status} at ${new Date(payload.timestamp).toLocaleTimeString()}`,
        })
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        const detail = error instanceof Error ? error.message : 'Unknown error'
        setApiStatus({
          state: 'offline',
          message: `Backend not reachable yet: ${detail}`,
        })
      }
    }

    void loadHealth()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!room || pendingAction !== null) {
      return
    }

    let active = true
    const roomId = room.room_id
    const sessionPlayerId = room.session_player_id

    async function refreshRoom() {
      try {
        const response = await fetch(apiUrl(`/api/rooms/${roomId}?player_id=${encodeURIComponent(sessionPlayerId)}`))
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const nextRoom = (await response.json()) as RoomSummary
        if (!active) {
          return
        }

        setRoom((current) => {
          if (!current) {
            return nextRoom
          }

          const currentState = JSON.stringify(current)
          const nextState = JSON.stringify(nextRoom)
          if (currentState === nextState) {
            return current
          }

          if (current.status !== nextRoom.status || current.game?.stage !== nextRoom.game?.stage) {
            setRoomMessage(buildRoomMessage('ready', nextRoom))
          }
          return nextRoom
        })
        setRoomError(null)
      } catch (error) {
        if (!active) {
          return
        }

        const detail = error instanceof Error ? error.message : 'Unknown room refresh error'
        setRoomError(`Live update failed: ${detail}`)
      }
    }

    void refreshRoom()
    const intervalId = window.setInterval(() => {
      void refreshRoom()
    }, 1000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [room?.room_id, room?.session_player_id, pendingAction])

  useEffect(() => {
    const liveGame = room?.game ?? null

    if (!liveGame) {
      previousDrawCountRef.current = null
      previousDiscardTopRef.current = null
      previousReshuffleCountRef.current = null
      setDiscardBurstLabel(null)
      setReshuffleBannerVisible(false)
      return
    }

    const previousDrawCount = previousDrawCountRef.current
    const previousDiscardTop = previousDiscardTopRef.current
    const previousReshuffleCount = previousReshuffleCountRef.current
    const currentDrawCount = liveGame.draw_pile_count
    const currentDiscardTop = liveGame.discard_pile_codes.at(-1) ?? null
    const currentReshuffleCount = liveGame.reshuffle_count

    if (previousDrawCount !== null && currentDrawCount < previousDrawCount) {
      setDrawPulseTick((current) => current + 1)
    }

    if (currentDiscardTop && previousDiscardTop !== null && currentDiscardTop !== previousDiscardTop) {
      setDiscardPulseTick((current) => current + 1)
      setDiscardBurstLabel(formatCardLabel(currentDiscardTop, true))
    }

    if (previousReshuffleCount !== null && currentReshuffleCount > previousReshuffleCount) {
      setReshufflePulseTick((current) => current + 1)
      setReshuffleBannerVisible(true)
    }

    previousDrawCountRef.current = currentDrawCount
    previousDiscardTopRef.current = currentDiscardTop
    previousReshuffleCountRef.current = currentReshuffleCount
  }, [room?.game])

  useEffect(() => {
    if (!discardBurstLabel) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setDiscardBurstLabel(null)
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [discardBurstLabel])

  useEffect(() => {
    if (!reshuffleBannerVisible) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setReshuffleBannerVisible(false)
    }, 1700)

    return () => window.clearTimeout(timeoutId)
  }, [reshuffleBannerVisible])

  const currentPlayer = room?.players.find((player) => player.player_id === room.session_player_id) ?? null
  const game = room?.game ?? null
  const screen = room === null ? 'landing' : game === null ? 'lobby' : 'game'
  const sessionPlayerId = room?.session_player_id ?? null
  const currentGamePlayer = game?.players.find((player) => player.player_id === sessionPlayerId) ?? null
  const currentTurnPlayer = game?.players.find((player) => player.player_id === game.current_player_id) ?? null
  const currentTurnName = currentTurnPlayer ? (currentTurnPlayer.player_id === sessionPlayerId ? 'You' : currentTurnPlayer.nickname) : 'Unknown'
  const canToggleReady = room !== null && currentPlayer !== null && room.game === null
  const isCurrentTurn = game?.current_player_id === room?.session_player_id
  const reactionWindow = game?.reaction_window ?? null
  const canConfirmOpening = game?.stage === 'preview' && currentGamePlayer?.preview_ready === false
  const canReact = Boolean(game?.stage === 'active' && reactionWindow && !isCurrentTurn && !reactionWindow.already_reacted)
  const powerState = game?.power_state ?? null
  const drawnRank = cardRank(game?.pending_drawn_card_code ?? null)
  const canStartPower = Boolean(
    game?.stage === 'active' &&
      isCurrentTurn &&
      game.turn_phase === 'resolve' &&
      ['7', '8', 'J', 'Q'].includes(drawnRank ?? ''),
  )
  const canFinalizeTurn = Boolean(
    game?.stage === 'active' &&
      isCurrentTurn &&
      game.turn_phase === 'post_turn' &&
      reactionWindow === null,
  )
  const otherPlayers = game?.players.filter((player) => player.player_id !== sessionPlayerId) ?? []
  const winnerNames = game?.winner_player_ids.map(
    (winnerId) => game.players.find((player) => player.player_id === winnerId)?.nickname ?? winnerId,
  ) ?? []
  const readyCount = room?.players.filter((player) => player.ready).length ?? 0
  const roomCodeCharacters = room?.code.split('') ?? []
  const latestDiscardCode = game?.discard_pile_codes.at(-1) ?? null
  const reactionProgress = reactionWindow ? Math.max(0, Math.min(100, (reactionWindow.seconds_remaining / 5) * 100)) : 0

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  function updatePowerSelection<K extends keyof PowerSelection>(field: K, value: PowerSelection[K]) {
    setPowerSelection((current) => ({ ...current, [field]: value }))
  }

  async function requestRoom(
    url: string,
    payload: Record<string, string | number | boolean | null>,
    action: RoomAction,
  ) {
    setPendingAction(action)
    setRoomError(null)

    try {
      const response = await fetch(apiUrl(url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { detail?: string } | null
        throw new Error(errorPayload?.detail ?? `Request failed with ${response.status}`)
      }

      const nextRoom = (await response.json()) as RoomSummary
      setRoom(nextRoom)
      setRoomMessage(buildRoomMessage(action, nextRoom))
      if (action === 'power-resolve') {
        if (!nextRoom.game?.power_state) {
          setPowerSelection({ selfPosition: null, targetPlayerId: '', targetPosition: null })
        }
      } else if (action === 'power-start' || action === 'end-turn' || action === 'call-kamboocha') {
        setPowerSelection({ selfPosition: null, targetPlayerId: '', targetPosition: null })
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown request error'
      setRoomError(detail)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCreateRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await requestRoom(
      '/api/rooms',
      {
        nickname: formState.nickname.trim(),
        max_players: Number(formState.maxPlayers),
      },
      'create',
    )
  }

  async function handleJoinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await requestRoom(
      '/api/rooms/join',
      {
        code: formState.joinCode.trim().toUpperCase(),
        nickname: formState.nickname.trim(),
      },
      'join',
    )
  }

  async function handleReadyToggle() {
    if (!room || !currentPlayer) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/ready`,
      {
        player_id: room.session_player_id,
        ready: !currentPlayer.ready,
      },
      'ready',
    )
  }

  async function handleOpeningReady() {
    if (!room) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/opening-ready`,
      {
        player_id: room.session_player_id,
      },
      'opening-ready',
    )
  }

  async function handleDrawCard() {
    if (!room) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/draw`,
      {
        player_id: room.session_player_id,
      },
      'draw',
    )
  }

  async function handleDiscardCard() {
    if (!room) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/discard`,
      {
        player_id: room.session_player_id,
      },
      'discard',
    )
  }

  async function handleSwapCard(position: number) {
    if (!room) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/swap`,
      {
        player_id: room.session_player_id,
        position,
      },
      'swap',
    )
  }

  async function handleReactToDiscard(position: number) {
    if (!room) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/react`,
      {
        player_id: room.session_player_id,
        position,
      },
      'react',
    )
  }

  async function handleStartPower() {
    if (!room) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/power/start`,
      { player_id: room.session_player_id },
      'power-start',
    )
  }

  async function handleResolvePower(skipSwap = false) {
    if (!room || !powerState) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/power/resolve`,
      {
        player_id: room.session_player_id,
        self_position: powerSelection.selfPosition,
        target_player_id: powerSelection.targetPlayerId || null,
        target_position: powerSelection.targetPosition,
        skip_swap: skipSwap,
      },
      'power-resolve',
    )
  }

  async function handleFinalizeTurn(callKamboocha: boolean) {
    if (!room) {
      return
    }

    await requestRoom(
      `/api/rooms/${room.room_id}/finalize`,
      {
        player_id: room.session_player_id,
        call_kamboocha: callKamboocha,
      },
      callKamboocha ? 'call-kamboocha' : 'end-turn',
    )
  }

  function handleLeaveRoom() {
    setRoom(null)
    setLandingMode(null)
    setRoomError(null)
    setPendingAction(null)
    setPowerSelection({ selfPosition: null, targetPlayerId: '', targetPosition: null })
    setRoomMessage('Choose whether to create a private room or join an existing one.')
  }

  return (
    <main className="thriller-shell">
      <div className="ambient-orb ambient-orb-left" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-right" aria-hidden="true" />

      <header className="app-header">
        <div>
          <p className="micro-copy">Memory game</p>
          <h1 className="brand-wordmark">
            Kamboo<span>cha</span>
          </h1>
        </div>
        <div className="header-actions">
          {screen === 'landing' ? (
            <span className={`signal-pill signal-${apiStatus.state}`}>{apiStatus.state === 'online' ? 'Signal locked' : 'Awaiting signal'}</span>
          ) : (
            <button type="button" className="ghost-link" onClick={handleLeaveRoom}>
              Leave room
            </button>
          )}
        </div>
      </header>

      {screen === 'landing' ? (
        <section className="landing-stage">
          <div className="card-fan" aria-hidden="true">
            <span className="fan-card fan-card-1" />
            <span className="fan-card fan-card-2" />
            <span className="fan-card fan-card-3" />
            <span className="fan-card fan-card-4" />
          </div>

          <div className="landing-copy">
            <p className="eyebrow-copy">Remember everything. Trust no one.</p>
            <h2 className="landing-title">A thriller table for private rooms and quiet betrayals.</h2>
            <p className="landing-text">
              Join the table, memorize your hidden cards, and survive the reveal. The room opens fast. The tension does not.
            </p>
          </div>

          <div className="landing-panel">
            {landingMode === null ? (
              <div className="choice-stack">
                <button type="button" className="primary-button large-button" onClick={() => setLandingMode('create')}>
                  Create Room
                </button>
                <button type="button" className="secondary-button large-button" onClick={() => setLandingMode('join')}>
                  Join Room
                </button>
              </div>
            ) : null}

            {landingMode === 'create' ? (
              <form className="entry-form" onSubmit={handleCreateRoom}>
                <div className="form-heading">
                  <p className="micro-copy">Create room</p>
                  <h3>Open a private table</h3>
                </div>
                <label>
                  Nickname
                  <input
                    value={formState.nickname}
                    onChange={(event) => updateField('nickname', event.target.value)}
                    minLength={2}
                    maxLength={24}
                    placeholder="Enter your nickname"
                    required
                  />
                </label>
                <label>
                  Max players
                  <select
                    value={formState.maxPlayers}
                    onChange={(event) => updateField('maxPlayers', event.target.value)}
                  >
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="primary-button" disabled={pendingAction !== null}>
                  {pendingAction === 'create' ? 'Creating...' : 'Create room'}
                </button>
                <button type="button" className="tertiary-link" onClick={() => setLandingMode(null)}>
                  Back
                </button>
              </form>
            ) : null}

            {landingMode === 'join' ? (
              <form className="entry-form" onSubmit={handleJoinRoom}>
                <div className="form-heading">
                  <p className="micro-copy">Join room</p>
                  <h3>Step into an existing table</h3>
                </div>
                <label>
                  Nickname
                  <input
                    value={formState.nickname}
                    onChange={(event) => updateField('nickname', event.target.value)}
                    minLength={2}
                    maxLength={24}
                    placeholder="Enter your nickname"
                    required
                  />
                </label>
                <label>
                  Room code
                  <input
                    value={formState.joinCode}
                    onChange={(event) => updateField('joinCode', event.target.value.toUpperCase())}
                    minLength={4}
                    maxLength={8}
                    placeholder="ABC123"
                    required
                  />
                </label>
                <button type="submit" className="primary-button" disabled={pendingAction !== null}>
                  {pendingAction === 'join' ? 'Joining...' : 'Join room'}
                </button>
                <button type="button" className="tertiary-link" onClick={() => setLandingMode(null)}>
                  Back
                </button>
              </form>
            ) : null}

            <div className="status-panel">
              <p className="micro-copy">Backend</p>
              <strong>{apiStatus.state === 'online' ? 'Connected' : 'Waiting'}</strong>
              <p>{apiStatus.message}</p>
            </div>
          </div>
        </section>
      ) : null}

      {screen === 'lobby' && room ? (
        <section className="lobby-stage">
          <div className="lobby-main panel-frame">
            <div className="lobby-hero">
              <div>
                <p className="micro-copy">Private room</p>
                <h2 className="section-title">At the table</h2>
                <p className="section-text">{roomMessage}</p>
              </div>
              <div className="room-status-cluster">
                <span className="room-status-badge">{room.status.replace('_', ' ')}</span>
                <span className="room-status-badge subdued">
                  {readyCount}/{room.players.length} ready
                </span>
              </div>
            </div>

            <div className="room-code-display" aria-label="Room code">
              {roomCodeCharacters.map((character, index) => (
                <div key={`${character}-${index}`} className="room-code-tile">
                  {character}
                </div>
              ))}
            </div>

            <div className="lobby-grid">
              <section className="lobby-card">
                <div className="lobby-card-heading">
                  <p className="micro-copy">Players</p>
                  <h3>Ready check</h3>
                </div>
                <ul className="player-roster">
                  {room.players
                    .slice()
                    .sort((left, right) => left.seat_index - right.seat_index)
                    .map((player) => (
                      <li key={player.player_id} className={player.player_id === room.session_player_id ? 'is-self' : ''}>
                        <div>
                          <strong>{player.nickname}</strong>
                          <span>
                            Seat {player.seat_index + 1}
                            {player.player_id === room.host_id ? ' · Host' : ''}
                            {player.player_id === room.session_player_id ? ' · You' : ''}
                          </span>
                        </div>
                        <span className={`ready-pill ${player.ready ? 'is-ready' : 'is-waiting'}`}>
                          {player.ready ? 'Ready' : 'Waiting'}
                        </span>
                      </li>
                    ))}
                </ul>
              </section>

              <aside className="lobby-card lobby-side">
                <div className="lobby-card-heading">
                  <p className="micro-copy">Room brief</p>
                  <h3>Before the match</h3>
                </div>
                <p className="section-text small">
                  Every player gets four hidden cards. Two are revealed briefly at the beginning, then hidden again. After that, memory takes over.
                </p>
                <ul className="brief-list">
                  <li>Minimum {room.min_players} players to begin.</li>
                  <li>Maximum {room.max_players} players in this room.</li>
                  <li>Everyone must mark ready before the opening peek begins.</li>
                </ul>
                <button type="button" className="primary-button" disabled={!canToggleReady || pendingAction !== null} onClick={handleReadyToggle}>
                  {pendingAction === 'ready' ? 'Saving...' : currentPlayer?.ready ? 'Mark not ready' : 'I am ready'}
                </button>
              </aside>
            </div>
          </div>
        </section>
      ) : null}

      {screen === 'game' && room && game ? (
        <section className="game-stage">
          <aside className="side-rail left-rail">
            <div className="info-box">
              <span className="info-label">Stage</span>
              <strong className="info-value">{formatStageLabel(game.stage)}</strong>
            </div>
            <div className={`info-box turn-box ${isCurrentTurn ? 'is-active' : ''}`}>
              <span className="info-label">Current turn</span>
              <strong className="info-value">{currentTurnName}</strong>
              <small className="turn-whisper">{isCurrentTurn ? 'Act before the table reacts.' : 'Watch for the discard and remember everything.'}</small>
            </div>
            <div className="info-box">
              <span className="info-label">Your visible cards</span>
              <strong className="info-value">{currentGamePlayer?.visible_card_count ?? 0}</strong>
            </div>
            {powerState && powerState.awaiting_ready ? (
              <div className="event-panel memory-panel">
                <span className="info-label">Memory reveal</span>
                {powerState.revealed_self_code ? (
                  <p>
                    Your card: <strong className={cardTone(powerState.revealed_self_code)}>{formatCardLabel(powerState.revealed_self_code, true)}</strong>
                  </p>
                ) : null}
                {powerState.revealed_target_code ? (
                  <p>
                    Target card: <strong className={cardTone(powerState.revealed_target_code)}>{formatCardLabel(powerState.revealed_target_code, true)}</strong>
                  </p>
                ) : null}
                <p className="event-copy">
                  {powerState.action === 'peek_self'
                    ? 'Memorize your card, then flip it back.'
                    : powerState.action === 'peek_other'
                      ? 'Memorize the opponent card, then continue.'
                      : 'Memorize both cards, then choose to swap or keep them.'}
                </p>
                {powerState.action === 'insight_swap' ? (
                  <div className="button-row">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={pendingAction !== null || powerSelection.selfPosition === null || powerSelection.targetPosition === null}
                      onClick={() => handleResolvePower(false)}
                    >
                      {pendingAction === 'power-resolve' ? 'Swapping...' : 'Swap cards'}
                    </button>
                    <button type="button" className="secondary-button" disabled={pendingAction !== null} onClick={() => handleResolvePower(true)}>
                      {pendingAction === 'power-resolve' ? 'Saving...' : 'Keep cards'}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="primary-button" disabled={pendingAction !== null} onClick={() => handleResolvePower()}>
                    {pendingAction === 'power-resolve' ? 'Saving...' : 'Ready'}
                  </button>
                )}
              </div>
            ) : null}
            {game.stage === 'finished' ? (
              <div className="event-panel winner-panel">
                <span className="info-label">Winner</span>
                <strong className="winner-line">{winnerNames.join(', ')}</strong>
              </div>
            ) : null}
            {reactionWindow ? (
              <div className="event-panel reaction-panel">
                <span className="info-label">Reaction window</span>
                <p>
                  Latest discard:{' '}
                  <strong className={cardTone(reactionWindow.latest_discard_code)}>
                    {formatCardLabel(reactionWindow.latest_discard_code, true)}
                  </strong>
                </p>
                <p className="event-copy">{reactionWindow.seconds_remaining}s left to match the rank.</p>
                <div className="reaction-timer" aria-hidden="true">
                  <span className="reaction-timer__fill" style={{ width: `${reactionProgress}%` }} />
                </div>
              </div>
            ) : null}
          </aside>

          <section className="table-stage panel-frame">
            <div className="table-heading">
              <div>
                <p className="micro-copy">Live table</p>
                <h2 className="section-title">{game.stage === 'preview' ? 'Opening memory test' : 'Your hand'}</h2>
              </div>
              <div className="table-meta">
                <span className="room-status-badge subdued">Room {room.code}</span>
                <span className="room-status-badge">{room.players.length} players</span>
              </div>
            </div>

            <div className="event-panel status-banner immersive-signal">
              <span className="info-label">Table signal</span>
              <strong className="signal-emphasis">
                {game.stage === 'preview'
                  ? 'Memorize the opening pattern.'
                  : reactionWindow
                    ? 'The table is live. Anyone can strike now.'
                    : isCurrentTurn
                      ? 'Your move. Choose with intent.'
                      : `${currentTurnName} is under pressure.`}
              </strong>
              <p className="event-copy signal-copy">{roomMessage}</p>
            </div>

            {game.stage === 'preview' ? (
              <div className="event-panel preview-panel">
                <p className="event-copy">The two cards you saw will turn face down after you confirm.</p>
                {canConfirmOpening ? (
                  <button type="button" className="primary-button" disabled={pendingAction !== null} onClick={handleOpeningReady}>
                    {pendingAction === 'opening-ready' ? 'Saving...' : 'Ready to hide cards'}
                  </button>
                ) : (
                  <p className="muted-copy">You have already confirmed. Waiting for the rest of the table.</p>
                )}
              </div>
            ) : null}

            {game.stage === 'active' && isCurrentTurn && game.turn_phase === 'resolve' ? (
              <div className="event-panel action-banner">
                <p>
                  Drawn card:{' '}
                  <strong className={cardTone(game.pending_drawn_card_code)}>
                    {formatCardLabel(game.pending_drawn_card_code, true)}
                  </strong>
                </p>
                <div className="button-row">
                  <button type="button" className="secondary-button" disabled={pendingAction !== null} onClick={handleDiscardCard}>
                    {pendingAction === 'discard' ? 'Discarding...' : 'Discard drawn card'}
                  </button>
                  {canStartPower ? (
                    <button type="button" className="primary-button" disabled={pendingAction !== null} onClick={handleStartPower}>
                      {pendingAction === 'power-start' ? 'Preparing...' : `Use ${drawnRank} ability`}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {game.stage === 'active' && isCurrentTurn && game.turn_phase === 'power' && powerState && !powerState.awaiting_ready ? (
              <div className="event-panel action-banner">
                <p>
                  Power active: <strong>{formatPowerLabel(powerState.action)}</strong>
                </p>
                <p className="event-copy">
                  {powerState.action === 'peek_self'
                    ? 'Select one of your cards to reveal.'
                    : powerState.action === 'peek_other'
                      ? 'Choose a player and slot to reveal.'
                      : powerState.action === 'blind_swap'
                        ? 'Choose your slot and the target slot to swap without looking.'
                        : 'Choose one of your cards and a target card to reveal before swapping.'}
                </p>
                <button type="button" className="primary-button" disabled={pendingAction !== null} onClick={() => handleResolvePower()}>
                  {pendingAction === 'power-resolve'
                    ? 'Resolving...'
                    : powerState.action === 'blind_swap'
                      ? 'Resolve swap'
                      : 'Reveal card'}
                </button>
              </div>
            ) : null}

            <div className="card-grid">
              {currentGamePlayer?.cards
                .slice()
                .sort((left, right) => left.position - right.position)
                .map((card) => {
                  const isFaceUp = game.stage === 'finished' || card.known_to_player
                  const visibleCode = isFaceUp ? card.code : null
                  const canSwap = isCurrentTurn && game.stage === 'active' && game.turn_phase === 'resolve' && card.has_card
                  const canReactWithCard = canReact && card.has_card
                  const canSelectForPower = isCurrentTurn && game.stage === 'active' && game.turn_phase === 'power'
                  const canSelectSelf =
                    canSelectForPower && powerState !== null && ['peek_self', 'blind_swap', 'insight_swap'].includes(powerState.action)

                  return (
                    <article
                      key={card.position}
                      className={`memory-card ${card.has_card ? (isFaceUp ? 'is-face-up' : 'is-hidden') : 'is-empty'} ${cardTone(visibleCode)}`}
                    >
                      <div className="memory-card__topline">
                        <span>Slot {card.position + 1}</span>
                        {card.has_card ? <small>{isFaceUp ? 'Visible' : 'Hidden'}</small> : <small>Empty</small>}
                      </div>

                      {card.has_card ? (
                        <div className={`memory-card__flip ${isFaceUp ? 'is-flipped' : ''}`} aria-label={isFaceUp ? formatCardLabel(visibleCode, true) : 'Hidden card back'}>
                          <div className="memory-card__flip-inner">
                            <div className="memory-card__back">
                              <span className="memory-card__glyph" />
                            </div>
                            <div className="memory-card__face">
                              <strong>{formatCardLabel(visibleCode, true)}</strong>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="memory-card__empty">No card</div>
                      )}

                      <div className="memory-card__actions">
                        {canSwap ? (
                          <button type="button" className="card-action" disabled={pendingAction !== null} onClick={() => handleSwapCard(card.position)}>
                            {pendingAction === 'swap' ? 'Swapping...' : 'Swap with drawn card'}
                          </button>
                        ) : null}
                        {canSelectSelf ? (
                          <button
                            type="button"
                            className={`card-action ${powerSelection.selfPosition === card.position ? 'is-selected' : ''}`}
                            disabled={pendingAction !== null}
                            onClick={() => updatePowerSelection('selfPosition', card.position)}
                          >
                            {powerSelection.selfPosition === card.position ? 'Selected' : 'Select for power'}
                          </button>
                        ) : null}
                        {canReactWithCard ? (
                          <button type="button" className="card-action danger-action" disabled={pendingAction !== null} onClick={() => handleReactToDiscard(card.position)}>
                            {pendingAction === 'react' ? 'Matching...' : 'Match discard'}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
            </div>

            {canFinalizeTurn ? (
              <div className="button-row center-row">
                <button type="button" className="secondary-button" disabled={pendingAction !== null} onClick={() => handleFinalizeTurn(false)}>
                  {pendingAction === 'end-turn' ? 'Ending...' : 'End turn'}
                </button>
                {game.kamboocha_caller_id === null ? (
                  <button type="button" className="danger-button" disabled={pendingAction !== null} onClick={() => handleFinalizeTurn(true)}>
                    {pendingAction === 'call-kamboocha' ? 'Calling...' : 'Call Kamboocha'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {game.stage === 'finished' ? (
              <div className="showdown-panel">
                <h3>Final reveal</h3>
                <p>{winnerNames.length > 1 ? `Winners: ${winnerNames.join(', ')}` : `${winnerNames[0]} wins the round.`}</p>
              </div>
            ) : null}
          </section>

          <aside className="side-rail right-rail">
            {reshuffleBannerVisible ? (
              <div className="reshuffle-stream" aria-hidden="true">
                <span className="reshuffle-stream__card reshuffle-stream__card-1" />
                <span className="reshuffle-stream__card reshuffle-stream__card-2" />
                <span className="reshuffle-stream__card reshuffle-stream__card-3" />
              </div>
            ) : null}
            <button
              type="button"
              className={`info-box action-box draw-box ${game.stage === 'active' && isCurrentTurn && game.turn_phase === 'draw' ? 'is-active' : ''} ${drawPulseTick % 2 === 1 ? 'has-draw-pulse-a' : 'has-draw-pulse-b'} ${reshufflePulseTick % 2 === 1 ? 'has-reshuffle-a' : 'has-reshuffle-b'}`}
              disabled={!(game.stage === 'active' && isCurrentTurn && game.turn_phase === 'draw') || pendingAction !== null}
              onClick={handleDrawCard}
            >
              <span className="info-label">Draw pile</span>
              <div className="pile-preview">
                <span className="mini-card-back" aria-hidden="true" />
                <strong className="info-value">{game.draw_pile_count}</strong>
              </div>
            </button>

            <div className={`info-box stack-box ${discardPulseTick % 2 === 1 ? 'has-discard-pulse-a' : 'has-discard-pulse-b'} ${reshufflePulseTick % 2 === 1 ? 'has-reshuffle-a' : 'has-reshuffle-b'}`}>
              <span className="info-label">Discard pile</span>
              <div className="pile-preview discard-preview">
                {latestDiscardCode ? (
                  <div className={`discard-chip ${cardTone(latestDiscardCode)}`}>{formatCardLabel(latestDiscardCode, true)}</div>
                ) : (
                  <div className="discard-chip empty">None</div>
                )}
                <strong className="info-value">{game.discard_pile_count}</strong>
              </div>
              {discardBurstLabel ? <div className="discard-burst">{discardBurstLabel} hit the discard</div> : null}
              {reshuffleBannerVisible ? <div className="reshuffle-burst">Discard pile shuffled back into the deck</div> : null}
            </div>

            {powerState && (!powerState.awaiting_ready || powerState.action === 'insight_swap') ? (
              <div className="info-box selector-box">
                <span className="info-label">Power targets</span>
                <div className="selector-grid">
                  <label>
                    Target player
                    <select
                      value={powerSelection.targetPlayerId}
                      disabled={powerState.awaiting_ready}
                      onChange={(event) => updatePowerSelection('targetPlayerId', event.target.value)}
                    >
                      <option value="">Choose player</option>
                      {otherPlayers.map((player) => (
                        <option key={player.player_id} value={player.player_id}>
                          {player.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Target slot
                    <select
                      value={powerSelection.targetPosition ?? ''}
                      onChange={(event) => updatePowerSelection('targetPosition', event.target.value === '' ? null : Number(event.target.value))}
                    >
                      <option value="">Choose slot</option>
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((position) => (
                        <option key={position} value={position}>
                          Slot {position + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {powerState.awaiting_ready ? <p className="event-copy">Locked to the player whose card you revealed. Pick any of their slots to swap with.</p> : null}
              </div>
            ) : null}

            <div className="info-box roster-box">
              <span className="info-label">Table</span>
              <ul className="seat-roster">
                {game.players
                  .slice()
                  .sort((left, right) => left.seat_index - right.seat_index)
                  .map((player) => (
                    <li key={player.player_id} className={player.player_id === sessionPlayerId ? 'is-self' : ''}>
                      <div>
                        <strong>{player.player_id === sessionPlayerId ? 'You' : player.nickname}</strong>
                        <span>Seat {player.seat_index + 1}</span>
                      </div>
                      <small>
                        {game.stage === 'preview'
                          ? player.preview_ready
                            ? 'Peek confirmed'
                            : 'Peeking'
                          : game.stage === 'finished'
                            ? 'Cards revealed'
                            : `${player.total_card_count} cards · ${player.penalty_cards} penalty`}
                      </small>
                    </li>
                  ))}
              </ul>
            </div>

            {game.kamboocha_caller_id ? (
              <div className="event-panel danger-panel">
                <span className="info-label">Kamboocha</span>
                <p>
                  Caller: <strong>{game.players.find((player) => player.player_id === game.kamboocha_caller_id)?.nickname ?? 'Unknown'}</strong>
                </p>
                <p className="event-copy">Final turns remaining: {game.final_round_remaining_player_ids.length}</p>
              </div>
            ) : null}
          </aside>
        </section>
      ) : null}

      {roomError ? <div className="error-toast">{roomError}</div> : null}
    </main>
  )
}

export default App
