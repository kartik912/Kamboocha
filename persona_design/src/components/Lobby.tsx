import { useEffect, useMemo, useState } from 'react'
import { Btn, ReadyBadge } from './ui'

type P = { name: string; ready: boolean; you?: boolean; host?: boolean }
const SEATS = 4

export default function Lobby({
  code,
  isHost,
  me,
  onStart,
  onLeave,
}: {
  code: string
  isHost: boolean
  me: string
  onStart: (names: string[]) => void
  onLeave: () => void
}) {
  const [players, setPlayers] = useState<P[]>(() =>
    isHost
      ? [{ name: me, ready: false, you: true, host: true }]
      : [
          { name: 'Mara', ready: true, host: true },
          { name: 'Dex', ready: false },
          { name: me, ready: false, you: true },
        ],
  )
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
    const join = (name: string) => setPlayers((p) => (p.length < SEATS ? [...p, { name, ready: false }] : p))
    const ready = (name: string) => setPlayers((p) => p.map((x) => (x.name === name ? { ...x, ready: true } : x)))
    if (isHost) {
      at(1400, () => join('Mara'))
      at(2800, () => join('Dex'))
      at(4200, () => join('Okoye'))
      at(3600, () => ready('Mara'))
      at(5600, () => ready('Dex'))
      at(7000, () => ready('Okoye'))
    } else {
      at(2200, () => join('Okoye'))
      at(3000, () => ready('Dex'))
      at(4800, () => ready('Okoye'))
    }
    return () => timers.forEach(clearTimeout)
  }, [isHost])

  const readyCount = players.filter((p) => p.ready).length
  const allReady = players.length >= 2 && readyCount === players.length
  const meReady = players.find((p) => p.you)?.ready ?? false

  useEffect(() => {
    if (!isHost && allReady) {
      const t = window.setTimeout(() => onStart(players.map((p) => p.name)), 1800)
      return () => clearTimeout(t)
    }
  }, [isHost, allReady, players, onStart])

  const seats = useMemo(() => Array.from({ length: SEATS }, (_, i) => players[i]), [players])

  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-10">
      <button
        onClick={onLeave}
        className="anim-up mb-8 self-start font-mono text-[11px] uppercase tracking-[0.2em] text-dim transition-colors hover:text-ice"
      >
        ← Leave room
      </button>

      <section className="anim-up text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-dim">Room code</div>
        <div className="mt-4 flex justify-center gap-2 sm:gap-3">
          {code.split('').map((c, i) => (
            <div
              key={i}
              className="anim-deal cut grid h-20 w-14 place-items-center bg-cyan font-display text-6xl font-black italic text-ink sm:h-28 sm:w-20 sm:text-8xl"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {c}
            </div>
          ))}
        </div>
        <button
          onClick={copy}
          className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-dim underline-offset-4 transition-colors hover:text-ice hover:underline"
        >
          {copied ? 'Copied ✓' : 'Copy code'}
        </button>
      </section>

      <section className="anim-up mt-10" style={{ animationDelay: '.2s' }}>
        <div className="mb-3 flex items-end justify-between border-b border-line pb-3">
          <h2 className="display-i text-3xl">At the table</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim">
            {readyCount}/{players.length} ready
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {seats.map((p, i) =>
            p ? (
              <li
                key={p.name}
                style={{ animationDelay: `${i * 70}ms` }}
                className={`anim-up cut-sm flex items-center gap-4 border-l-4 px-4 py-3 transition-colors duration-300 ${
                  p.ready ? 'border-cyan bg-cyan/15' : 'border-dim/50 bg-navy-2/80'
                }`}
              >
                <span
                  className={`cut-sm grid h-10 w-10 shrink-0 place-items-center font-display text-2xl font-black italic ${
                    p.ready ? 'bg-cyan text-ink' : 'bg-navy text-ice shadow-[inset_0_0_0_1px_var(--color-dim)]'
                  }`}
                >
                  {p.name[0]}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="display-i truncate text-2xl">{p.name}</span>
                  {p.you && <Tag>You</Tag>}
                  {p.host && <Tag>Host</Tag>}
                </span>
                <ReadyBadge ready={p.ready} />
              </li>
            ) : (
              <li
                key={`empty-${i}`}
                className="cut-sm flex items-center gap-4 border-l-4 border-dashed border-line px-4 py-3 text-dim"
              >
                <span className="h-10 w-10 shrink-0 rotate-45 scale-75 border border-dashed border-line" />
                <span className="text-sm">Empty seat</span>
              </li>
            ),
          )}
        </ul>
      </section>

      <section className="anim-up mt-8" style={{ animationDelay: '.35s' }}>
        <p className="mb-4 flex items-center justify-center gap-2 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-dim">
          {allReady ? (isHost ? 'Everyone is ready' : 'Starting…') : 'Waiting for the match to begin'}
          {!allReady && (
            <span className="dot-blink inline-flex gap-1">
              <span className="h-1 w-1 rounded-full bg-dim" />
              <span className="h-1 w-1 rounded-full bg-dim" />
              <span className="h-1 w-1 rounded-full bg-dim" />
            </span>
          )}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Btn
            variant={meReady ? 'ghost' : 'solid'}
            className="flex-1"
            onClick={() => setPlayers((p) => p.map((x) => (x.you ? { ...x, ready: !x.ready } : x)))}
          >
            {meReady ? 'Not ready' : "I'm ready"}
          </Btn>
          {isHost && (
            <Btn disabled={!allReady} className="flex-1 !bg-blood !text-ice enabled:hover:!bg-ice enabled:hover:!text-ink" onClick={() => onStart(players.map((p) => p.name))}>
              Start match
            </Btn>
          )}
        </div>
      </section>
    </main>
  )
}

function Tag({ children }: { children: string }) {
  return (
    <span className="-skew-x-12 border border-cyan/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan">
      {children}
    </span>
  )
}
