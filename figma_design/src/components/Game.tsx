import { useEffect, useState } from 'react'
import { Btn, InfoBox, PlayingCard, makeDeck, type Card } from './ui'

const PEEK_MS = 5000
const HAND = 6

type Held = { card: Card; from: 'draw' | 'discard' } | null
type G = {
  draw: Card[]
  discard: Card[]
  hands: Card[][]
  turn: number
  stage: 'peek' | 'play' | 'over'
  held: Held
  revealed: number[]
  moves: number
  caller: number | null
  log: string
}

const sum = (h: Card[]) => h.reduce((a, c) => a + c.rank, 0)

function deal(n: number): G {
  const deck = makeDeck()
  const hands = Array.from({ length: n }, () => deck.splice(0, HAND))
  return { draw: deck.slice(1), discard: [deck[0]], hands, turn: 0, stage: 'peek', held: null, revealed: [0, 1], moves: 0, caller: null, log: 'Memorise your first two cards.' }
}

function botMove(g: G, who: number, name: string): G {
  if (g.draw.length === 0) return { ...g, stage: 'over', log: 'The draw pile ran dry.' }
  const hand = g.hands[who]
  if (g.moves >= 6 && sum(hand) <= 21) return { ...g, stage: 'over', caller: who, log: `${name} called Kamboocha.` }
  const [c, ...rest] = g.draw
  let worst = 0
  hand.forEach((x, i) => {
    if (x.rank > hand[worst].rank) worst = i
  })
  const next = (who + 1) % g.hands.length
  if (c.rank < hand[worst].rank) {
    const hands = g.hands.map((h, i) => (i === who ? h.map((x, j) => (j === worst ? c : x)) : h))
    return { ...g, draw: rest, hands, discard: [hand[worst], ...g.discard], turn: next, moves: g.moves + 1, log: `${name} swapped a card and discarded a ${hand[worst].rank}${hand[worst].suit}.` }
  }
  return { ...g, draw: rest, discard: [c, ...g.discard], turn: next, moves: g.moves + 1, log: `${name} discarded a ${c.rank}${c.suit}.` }
}

export default function Game({ names, onExit }: { names: string[]; onExit: () => void }) {
  const [g, setG] = useState<G>(() => deal(names.length))
  const myTurn = g.turn === 0 && g.stage === 'play'
  const mine = g.hands[0]

  useEffect(() => {
    if (g.stage !== 'peek') return
    const t = setTimeout(() => setG((p) => ({ ...p, stage: 'play', revealed: [], log: 'Cards hidden. Your move.' })), PEEK_MS)
    return () => clearTimeout(t)
  }, [g.stage])

  useEffect(() => {
    if (g.stage !== 'play' || g.turn === 0) return
    const t = setTimeout(() => setG((p) => (p.turn === g.turn && p.stage === 'play' ? botMove(p, p.turn, names[p.turn]) : p)), 1900)
    return () => clearTimeout(t)
  }, [g.stage, g.turn, names])

  const endTurn = (p: G): G => (p.draw.length === 0 ? { ...p, stage: 'over', log: 'The draw pile ran dry.' } : { ...p, turn: 1 % p.hands.length, moves: p.moves + 1 })

  const drawPile = () =>
    setG((p) => (p.draw.length && !p.held ? { ...p, draw: p.draw.slice(1), held: { card: p.draw[0], from: 'draw' }, log: 'Swap it into your hand, or discard it.' } : p))
  const takeDiscard = () =>
    setG((p) => (!p.held && p.discard.length ? { ...p, discard: p.discard.slice(1), held: { card: p.discard[0], from: 'discard' }, log: 'Choose a card to replace.' } : p))
  const discardHeld = () =>
    setG((p) => (p.held ? endTurn({ ...p, discard: [p.held.card, ...p.discard], held: null, log: `You discarded a ${p.held.card.rank}${p.held.card.suit}.` }) : p))
  const swap = (i: number) => {
    setG((p) => {
      if (!p.held) return p
      const old = p.hands[0][i]
      const hands = p.hands.map((h, k) => (k === 0 ? h.map((x, j) => (j === i ? p.held!.card : x)) : h))
      return endTurn({ ...p, hands, discard: [old, ...p.discard], held: null, revealed: [...p.revealed, i], log: 'Remember where it landed.' })
    })
    setTimeout(() => setG((p) => ({ ...p, revealed: p.revealed.filter((x) => x !== i) })), 2400)
  }
  const callIt = () => setG((p) => ({ ...p, stage: 'over', caller: 0, held: null, log: 'You called Kamboocha.' }))

  const over = g.stage === 'over'
  const scores = g.hands.map(sum)
  const best = Math.min(...scores)
  const faceUp = (i: number) => over || g.revealed.includes(i)
  const visible = over ? [] : g.revealed.map((i) => mine[i].rank)
  const turnName = g.stage === 'peek' ? '—' : g.turn === 0 ? 'You' : names[g.turn]

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between">
        <div className="font-display text-xl font-semibold">
          Kamboo<span className="italic text-blood">cha</span>
        </div>
        <button onClick={onExit} className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim hover:text-paper">
          Leave match
        </button>
      </header>

      <div className="mt-4 grid flex-1 items-start gap-4 lg:grid-cols-[13rem_1fr_13rem] lg:gap-8 lg:pt-6">
        <aside className="grid grid-cols-3 gap-2 lg:flex lg:flex-col lg:gap-3">
          <InfoBox label="Stage">
            <div className="font-display text-lg font-semibold capitalize">{g.stage === 'over' ? 'Showdown' : g.stage}</div>
          </InfoBox>
          <InfoBox label="Turn" active={myTurn}>
            <div className={`font-display text-lg font-semibold ${myTurn ? 'text-blood' : ''}`}>{turnName}</div>
          </InfoBox>
          <InfoBox label="Your visible">
            <div className="font-display text-lg font-semibold">{visible.length ? visible.join(' · ') : <span className="text-dim">None</span>}</div>
          </InfoBox>
        </aside>

        <section className="mx-auto w-full max-w-[34rem]">
          <div key={g.log} className="mb-4 min-h-[2.5rem] text-center" style={{ animation: 'banner .5s ease both' }}>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-dim">
              {myTurn ? (g.held ? 'Your move · place the card' : 'Your move · draw or take') : g.stage === 'play' ? `${turnName} is thinking…` : g.stage === 'peek' ? 'Memory test' : 'Round over'}
            </p>
            <p className="mt-1 text-sm text-paper/80">{g.log}</p>
          </div>

          {g.stage === 'peek' && (
            <div className="mx-auto mb-4 h-0.5 w-40 overflow-hidden rounded bg-line">
              <div className="h-full origin-left bg-blood" style={{ animation: `drain ${PEEK_MS}ms linear forwards` }} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            {mine.map((c, i) => (
              <PlayingCard
                key={c.id}
                card={c}
                faceUp={faceUp(i)}
                delay={i * 80}
                pickable={myTurn && !!g.held}
                onClick={myTurn && g.held ? () => swap(i) : undefined}
                label={`Your card ${i + 1}`}
              />
            ))}
          </div>

          <div className="mt-6 flex min-h-[3.25rem] items-center justify-center gap-3">
            {myTurn && g.held && (
              <>
                <div className="w-14 shrink-0">
                  <PlayingCard card={g.held.card} faceUp />
                </div>
                {g.held.from === 'draw' && (
                  <Btn variant="ghost" onClick={discardHeld}>
                    Discard it
                  </Btn>
                )}
              </>
            )}
            {myTurn && !g.held && (
              <Btn variant="ghost" onClick={callIt} className="!border-blood/60 !text-blood hover:!bg-blood hover:!text-paper">
                Call Kamboocha
              </Btn>
            )}
          </div>

          {over && (
            <div className="anim-up mt-4 rounded-lg border border-line bg-felt-2/80 p-5">
              <h2 className="font-display text-3xl font-semibold">
                {scores[0] === best ? 'You win.' : `${names[scores.indexOf(best)]} wins.`}
              </h2>
              <ul className="mt-3 divide-y divide-line">
                {names.map((n, i) => (
                  <li key={n} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2">
                      {i === 0 ? 'You' : n}
                      {g.caller === i && <span className="font-mono text-[10px] uppercase tracking-widest text-blood">Called</span>}
                    </span>
                    <span className={`font-display text-xl font-semibold ${scores[i] === best ? 'text-sage' : 'text-dim'}`}>{scores[i]}</span>
                  </li>
                ))}
              </ul>
              <Btn className="mt-4 w-full" onClick={onExit}>
                Back to lobby
              </Btn>
            </div>
          )}
        </section>

        <aside className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:gap-3">
          <InfoBox label="Draw pile" onClick={drawPile} disabled={!myTurn || !!g.held || !g.draw.length} active={myTurn && !g.held}>
            <div className="flex items-center gap-3">
              <div className="w-8 shrink-0 -rotate-3">
                <PlayingCard faceUp={false} />
              </div>
              <span className="font-display text-2xl font-semibold">{g.draw.length}</span>
            </div>
          </InfoBox>
          <InfoBox label="Discard pile" onClick={takeDiscard} disabled={!myTurn || !!g.held || !g.discard.length}>
            <div className="flex items-center gap-3">
              <div className="w-8 shrink-0 rotate-3">
                {g.discard[0] ? <PlayingCard card={g.discard[0]} faceUp /> : <div className="aspect-[5/7] rounded border border-dashed border-line" />}
              </div>
              <span className="font-display text-2xl font-semibold">{g.discard.length}</span>
            </div>
          </InfoBox>
        </aside>
      </div>
    </main>
  )
}
