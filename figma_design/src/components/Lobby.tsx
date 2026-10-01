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
        className="anim-up mb-8 self-start font-mono text-[11px] uppercase tracking-[0.2em] text-dim transition-colors hover:text-paper"
      >
        ← Leave room
      </button>

      <section className="anim-up text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-dim">Room code</div>
        <div className="mt-4 flex justify-center gap-2 sm:gap-3">
          {code.split('').map((c, i) => (
            <div
              key={i}
              className="anim-deal grid h-20 w-14 place-items-center rounded-lg card-face font-display text-5xl font-semibold sm:h-28 sm:w-20 sm:text-7xl"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {c}
            </div>
          ))}
        </div>
        <button
          onClick={copy}
          className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-dim underline-offset-4 transition-colors hover:text-paper hover:underline"
        >
          {copied ? 'Copied ✓' : 'Copy code'}
        </button>
      </section>

      <section className="anim-up mt-10" style={{ animationDelay: '.2s' }}>
        <div className="mb-3 flex items-end justify-between border-b border-line pb-3">
          <h2 className="font-display text-2xl font-semibold">At the table</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim">
            {readyCount}/{players.length} ready
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {seats.map((p, i) =>
            p ? (
              <li
                key={p.name}
                className={`anim-up flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors duration-500 ${
                  p.ready ? 'border-sage/50 bg-sage/[0.06]' : 'border-line bg-felt-2/60'
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-lg font-semibold ${
                    p.ready ? 'bg-sage text-ink' : 'border border-line text-paper'
                  }`}
                >
                  {p.name[0]}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-lg font-medium">{p.name}</span>
                  {p.you && <Tag>You</Tag>}
                  {p.host && <Tag>Host</Tag>}
                </span>
                <ReadyBadge ready={p.ready} />
              </li>
            ) : (
              <li
                key={`empty-${i}`}
                className="flex items-center gap-4 rounded-lg border border-dashed border-line px-4 py-3 text-dim"
              >
                <span className="h-10 w-10 shrink-0 rounded-full border border-dashed border-line" />
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
            <Btn disabled={!allReady} className="flex-1 !bg-blood !text-paper enabled:hover:!bg-paper enabled:hover:!text-ink" onClick={() => onStart(players.map((p) => p.name))}>
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
    <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
      {children}
    </span>
  )
}
