import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

type Json = Record<string, unknown>

type FetchCall = { url: string; method: string; body: Json | null }

const ME = 'p1'
const OTHER = 'p2'
const ROOM_ID = 'room-1'

function makeCards(codes: Array<string | null | 'empty'>, knownPositions: number[] = []) {
  return codes.map((code, position) => ({
    position,
    has_card: code !== 'empty',
    code: code === 'empty' ? null : code && knownPositions.includes(position) ? code : null,
    known_to_player: code !== 'empty' && knownPositions.includes(position),
  }))
}

function makePlayer(playerId: string, nickname: string, seatIndex: number, cards = makeCards([null, null, null, null])) {
  return {
    player_id: playerId,
    nickname,
    seat_index: seatIndex,
    cards,
    visible_card_count: cards.filter((card) => card.known_to_player).length,
    total_card_count: cards.filter((card) => card.has_card).length,
    penalty_cards: 0,
    preview_ready: true,
  }
}

function makeRoom(gameOverrides: Json = {}, players = [makePlayer(ME, 'Alice', 0), makePlayer(OTHER, 'Bob', 1)]) {
  return {
    session_player_id: ME,
    room_id: ROOM_ID,
    code: 'TESTAB',
    host_id: ME,
    status: 'in_game',
    min_players: 2,
    max_players: 6,
    created_at: '2026-01-01T00:00:00Z',
    players: players.map((player) => ({
      player_id: player.player_id,
      nickname: player.nickname,
      seat_index: player.seat_index,
      ready: true,
      joined_at: '2026-01-01T00:00:00Z',
    })),
    game: {
      stage: 'active',
      current_player_id: ME,
      draw_pile_count: 44,
      discard_pile_count: 0,
      reshuffle_count: 0,
      turn_phase: 'draw',
      pending_drawn_card_code: null,
      discard_pile_codes: [],
      reaction_window: null,
      power_state: null,
      swap_event: null,
      activity_event: null,
      kamboocha_caller_id: null,
      final_round_remaining_player_ids: [],
      winner_player_ids: [],
      players,
      ...gameOverrides,
    },
  }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

let calls: FetchCall[] = []

function mockBackend(room: ReturnType<typeof makeRoom>, postRoom: ReturnType<typeof makeRoom> = room) {
  calls = []
  let current = room
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Json) : null })

      if (url.startsWith('/api/health')) {
        return jsonResponse({ status: 'ok', timestamp: '2026-01-01T00:00:00Z' })
      }
      if (method === 'POST') {
        const isCreate = url.endsWith('/api/rooms')
        if (!isCreate) {
          current = postRoom
        }
        return jsonResponse(isCreate ? room : postRoom)
      }
      return jsonResponse(current)
    }),
  )
}

async function renderGame(room: ReturnType<typeof makeRoom>, postRoom?: ReturnType<typeof makeRoom>) {
  mockBackend(room, postRoom)
  const user = userEvent.setup()
  const view = render(<App />)

  await user.click(screen.getByRole('button', { name: 'Create Room' }))
  await user.type(screen.getByPlaceholderText('Enter your nickname'), 'Alice')
  await user.click(screen.getByRole('button', { name: 'Create room' }))
  await screen.findByText('Table signal')

  return { user, container: view.container }
}

function stackLayers(stack: Element): number {
  return stack.querySelectorAll('.card-stack__layer').length + 1
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('draw and discard deck stacks', () => {
  it.each([
    [1, 1],
    [2, 2],
    [5, 2],
    [6, 3],
    [12, 3],
    [13, 4],
    [22, 4],
    [23, 5],
    [35, 5],
    [36, 6],
    [44, 6],
  ])('draw pile with %i cards renders %i stack layers', async (count, layers) => {
    const { container } = await renderGame(makeRoom({ draw_pile_count: count }))

    const stack = container.querySelector('.card-stack--draw')
    expect(stack).not.toBeNull()
    expect(stackLayers(stack as Element)).toBe(layers)
  })

  it('shows an empty dashed slot for an empty draw pile and an empty discard pile', async () => {
    const { container } = await renderGame(makeRoom({ draw_pile_count: 0, discard_pile_count: 0 }))

    expect(container.querySelectorAll('.card-stack--empty')).toHaveLength(2)
    expect(container.querySelector('.card-stack--draw')).toBeNull()
    expect(container.querySelector('.card-stack--discard')).toBeNull()
  })

  it('keeps the numeric count visible and uses the singular label for one card', async () => {
    const { container } = await renderGame(makeRoom({ draw_pile_count: 1, discard_pile_count: 7 }))

    const drawBox = container.querySelector('.draw-box') as HTMLElement
    expect(drawBox).toHaveTextContent('1 card')
    expect(drawBox).not.toHaveTextContent('1 cards')
    expect(screen.getByText('Discard pile').closest('.info-box')).toHaveTextContent('7 cards')
  })

  it('shows the card-back (no face) on the draw pile', async () => {
    const { container } = await renderGame(makeRoom({ draw_pile_count: 30 }))

    const top = container.querySelector('.card-stack--draw .card-stack__top') as HTMLElement
    expect(top).not.toHaveClass('is-face-up')
    expect(top).toBeEmptyDOMElement()
  })

  it('shows the latest discard face-up on top of a stack sized by the discard count', async () => {
    const { container } = await renderGame(
      makeRoom({ discard_pile_count: 8, discard_pile_codes: ['3C', 'KS', 'QH'] }),
    )

    const stack = container.querySelector('.card-stack--discard') as HTMLElement
    expect(stackLayers(stack)).toBe(3)

    const top = stack.querySelector('.card-stack__top') as HTMLElement
    expect(top).toHaveClass('is-face-up')
    expect(top).toHaveClass('tone-red')
    expect(top).toHaveTextContent('Q♥')
  })

  it('uses the black tone for club and spade discards', async () => {
    const { container } = await renderGame(makeRoom({ discard_pile_count: 2, discard_pile_codes: ['KS'] }))

    const top = container.querySelector('.card-stack--discard .card-stack__top') as HTMLElement
    expect(top).toHaveClass('tone-black')
    expect(top).toHaveTextContent('K♠')
  })

  it('hides stack layers from assistive technology', async () => {
    const { container } = await renderGame(makeRoom({ draw_pile_count: 20, discard_pile_count: 4, discard_pile_codes: ['9D'] }))

    for (const stack of container.querySelectorAll('.card-stack')) {
      expect(stack).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('keeps the draw pile clickable only on your draw phase', async () => {
    const { container, user } = await renderGame(makeRoom({ turn_phase: 'draw' }))

    const drawBox = container.querySelector('.draw-box') as HTMLButtonElement
    expect(drawBox).toBeEnabled()
    await user.click(drawBox)

    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url === `/api/rooms/${ROOM_ID}/draw`)).toBe(true))
    expect(calls.find((call) => call.url.endsWith('/draw'))?.body).toEqual({ player_id: ME })
  })

  it('disables the draw pile when it is not your turn but still renders the stack', async () => {
    const { container } = await renderGame(makeRoom({ current_player_id: OTHER, draw_pile_count: 20 }))

    expect(container.querySelector('.draw-box')).toBeDisabled()
    expect(stackLayers(container.querySelector('.card-stack--draw') as Element)).toBe(4)
  })
})

describe('drawn card panel', () => {
  const resolveRoom = (code: string | null, overrides: Json = {}) =>
    makeRoom({ turn_phase: 'resolve', pending_drawn_card_code: code, ...overrides })

  it('shows the drawn card large and face-up with Discard below the hand', async () => {
    const { container } = await renderGame(resolveRoom('5D'))

    expect(screen.getByRole('img', { name: 'Drawn card 5♦' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard it' })).toBeEnabled()
    expect(container.querySelector('.held-card')).toHaveClass('tone-red')

    const hand = container.querySelector('.card-grid') as HTMLElement
    const panel = container.querySelector('.held-card-panel') as HTMLElement
    expect(hand.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('uses the black tone for club and spade drawn cards', async () => {
    const { container } = await renderGame(resolveRoom('9S'))

    expect(container.querySelector('.held-card')).toHaveClass('tone-black')
  })

  it('no longer renders the old text banner for the drawn card', async () => {
    await renderGame(resolveRoom('5D'))

    expect(screen.queryByText(/^Drawn card:/)).not.toBeInTheDocument()
  })

  it('does not offer an ability button for number cards', async () => {
    await renderGame(resolveRoom('5D'))

    expect(screen.queryByRole('button', { name: /ability/ })).not.toBeInTheDocument()
  })

  it.each(['7', '8', 'J', 'Q'])('offers a Use %s ability button for a power card', async (rank) => {
    await renderGame(resolveRoom(`${rank}H`))

    expect(screen.getByRole('button', { name: `Use ${rank} ability` })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Discard it' })).toBeEnabled()
  })

  it('keeps per-slot swap buttons on the hand during resolve', async () => {
    await renderGame(resolveRoom('5D'))

    expect(screen.getAllByRole('button', { name: 'Swap with drawn card' })).toHaveLength(4)
  })

  it('discards through the discard endpoint', async () => {
    const afterDiscard = makeRoom({ turn_phase: 'post_turn', discard_pile_count: 1, discard_pile_codes: ['5D'] })
    const { user } = await renderGame(resolveRoom('5D'), afterDiscard)

    await user.click(screen.getByRole('button', { name: 'Discard it' }))

    await waitFor(() => expect(calls.some((call) => call.url === `/api/rooms/${ROOM_ID}/discard`)).toBe(true))
    expect(calls.find((call) => call.url.endsWith('/discard'))?.body).toEqual({ player_id: ME })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Discard it' })).not.toBeInTheDocument())
  })

  it('starts a power through the power-start flow when the ability button is used', async () => {
    const { user } = await renderGame(resolveRoom('QD'))

    await user.click(screen.getByRole('button', { name: 'Use Q ability' }))

    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url.includes('/power'))).toBe(true))
  })

  it('renders nothing when the pending drawn card is not known yet', async () => {
    const { container } = await renderGame(resolveRoom(null))

    expect(container.querySelector('.held-card-panel')).toBeNull()
  })

  it('is not shown outside the resolve phase', async () => {
    const { container } = await renderGame(makeRoom({ turn_phase: 'draw', pending_drawn_card_code: '5D' }))

    expect(container.querySelector('.held-card-panel')).toBeNull()
  })

  it('is not shown to a player whose turn it is not', async () => {
    const { container } = await renderGame(resolveRoom(null, { current_player_id: OTHER }))

    expect(container.querySelector('.held-card-panel')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Discard it' })).not.toBeInTheDocument()
  })
})

describe('side rail layout', () => {
  it('keeps status and roster on the left and piles on the right', async () => {
    const { container } = await renderGame(makeRoom({ draw_pile_count: 20, discard_pile_count: 3, discard_pile_codes: ['4S'] }))

    const left = container.querySelector('.left-rail') as HTMLElement
    const right = container.querySelector('.right-rail') as HTMLElement

    for (const label of ['Current turn', 'Stage', 'Visible', 'Table']) {
      expect(within(left).getByText(label)).toBeInTheDocument()
      expect(within(right).queryByText(label)).not.toBeInTheDocument()
    }
    for (const label of ['Draw pile', 'Discard pile']) {
      expect(within(right).getByText(label)).toBeInTheDocument()
      expect(within(left).queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('lists every seated player in the left-rail roster', async () => {
    const { container } = await renderGame(makeRoom())

    const roster = container.querySelector('.left-rail .seat-roster') as HTMLElement
    expect(within(roster).getByText('You')).toBeInTheDocument()
    expect(within(roster).getByText('Bob')).toBeInTheDocument()
  })

  it('shows the Kamboocha caller notice in the left rail', async () => {
    const { container } = await renderGame(
      makeRoom({ kamboocha_caller_id: OTHER, final_round_remaining_player_ids: [ME] }),
    )

    const left = container.querySelector('.left-rail') as HTMLElement
    expect(within(left).getByText('Kamboocha')).toBeInTheDocument()
    expect(left).toHaveTextContent('Caller: Bob')
    expect(left).toHaveTextContent('Final turns remaining: 1')
  })

  it('shows the reaction window in the left rail', async () => {
    const { container } = await renderGame(
      makeRoom({
        discard_pile_count: 1,
        discard_pile_codes: ['7C'],
        reaction_window: { latest_discard_code: '7C', seconds_remaining: 4, already_reacted: false },
        current_player_id: OTHER,
      }),
    )

    const left = container.querySelector('.left-rail') as HTMLElement
    expect(within(left).getByText('Reaction window')).toBeInTheDocument()
    expect(left).toHaveTextContent('4s left to match the rank.')
  })

  it('places power target selectors in the right rail during a power', async () => {
    const { container } = await renderGame(
      makeRoom({
        turn_phase: 'power',
        power_state: {
          action: 'peek_other',
          actor_player_id: ME,
          awaiting_ready: false,
          revealed_self_code: null,
          revealed_target_code: null,
          selected_target_player_id: null,
        },
      }),
    )

    const right = container.querySelector('.right-rail') as HTMLElement
    expect(within(right).getByText('Power targets')).toBeInTheDocument()
    expect(within(right).getByLabelText('Target player')).toBeInTheDocument()
  })

  it('does not show power target selectors when no power is active', async () => {
    await renderGame(makeRoom())

    expect(screen.queryByText('Power targets')).not.toBeInTheDocument()
  })
})

describe('power target slot dropdown', () => {
  const bobCards = makeCards(['2H', 'empty', '9S', 'KD'])
  const powerRoom = (action: 'peek_other' | 'blind_swap') =>
    makeRoom(
      {
        turn_phase: 'power',
        power_state: {
          action,
          actor_player_id: ME,
          awaiting_ready: false,
          revealed_self_code: null,
          revealed_target_code: null,
          selected_target_player_id: null,
        },
      },
      [makePlayer(ME, 'Alice', 0), makePlayer(OTHER, 'Bob', 1, bobCards)],
    )

  it.each(['peek_other', 'blind_swap'] as const)('lists only occupied slots of the chosen player (%s)', async (action) => {
    const { user } = await renderGame(powerRoom(action))

    const slotSelect = screen.getByLabelText('Target slot')
    expect(slotSelect).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Target player'), OTHER)

    expect(slotSelect).toBeEnabled()
    const options = within(slotSelect).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Choose slot', 'Slot 1', 'Slot 3', 'Slot 4'])
  })

  it('does not offer slots beyond the four dealt cards', async () => {
    const { user } = await renderGame(powerRoom('peek_other'))

    await user.selectOptions(screen.getByLabelText('Target player'), OTHER)

    const slotSelect = screen.getByLabelText('Target slot')
    expect(within(slotSelect).queryByRole('option', { name: 'Slot 5' })).not.toBeInTheDocument()
    expect(within(slotSelect).queryByRole('option', { name: 'Slot 8' })).not.toBeInTheDocument()
  })

  it('includes penalty-card slots beyond the first four when they hold cards', async () => {
    const room = makeRoom(
      {
        turn_phase: 'power',
        power_state: {
          action: 'peek_other',
          actor_player_id: ME,
          awaiting_ready: false,
          revealed_self_code: null,
          revealed_target_code: null,
          selected_target_player_id: null,
        },
      },
      [makePlayer(ME, 'Alice', 0), makePlayer(OTHER, 'Bob', 1, makeCards([null, null, null, null, null, 'empty']))],
    )
    const { user } = await renderGame(room)

    await user.selectOptions(screen.getByLabelText('Target player'), OTHER)

    const options = within(screen.getByLabelText('Target slot')).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Choose slot', 'Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5'])
  })

  it('resets the chosen slot when the target player changes back to none', async () => {
    const { user } = await renderGame(powerRoom('peek_other'))

    await user.selectOptions(screen.getByLabelText('Target player'), OTHER)
    await user.selectOptions(screen.getByLabelText('Target slot'), '2')
    expect(screen.getByLabelText('Target slot')).toHaveValue('2')

    await user.selectOptions(screen.getByLabelText('Target player'), '')

    expect(screen.getByLabelText('Target slot')).toBeDisabled()
    expect(screen.getByLabelText('Target slot')).toHaveValue('')
  })
})
