import { useState } from 'react'
import { Btn } from './ui'

const fan = [
  { r: '-18deg', x: '-120%', d: '0s' },
  { r: '-6deg', x: '-40%', d: '.5s' },
  { r: '6deg', x: '40%', d: '1s' },
  { r: '18deg', x: '120%', d: '1.5s' },
]

export default function Landing({ onCreate, onJoin }: { onCreate: () => void; onJoin: (code: string) => void }) {
  const [joining, setJoining] = useState(false)
  const [code, setCode] = useState('')

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div aria-hidden className="pointer-events-none absolute bottom-[-9rem] left-1/2 h-64 w-40 -translate-x-1/2 sm:bottom-[-7rem]">
        {fan.map((c, i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{ transform: `translateX(${c.x})` }}
          >
            <div
              className="h-full w-full rounded-lg card-back opacity-80"
              style={{ ['--r' as string]: c.r, animation: `sway 6s ease-in-out ${c.d} infinite`, transformOrigin: '50% 120%' }}
            />
          </div>
        ))}
      </div>

      <div className="anim-up relative z-10 text-center">
        <h1 className="font-display text-[clamp(3.4rem,13vw,8.5rem)] font-semibold leading-[0.9] tracking-tight">
          Kamboo<span className="italic text-blood">cha</span>
        </h1>
        <p className="mx-auto mt-6 max-w-sm font-mono text-xs uppercase tracking-[0.28em] text-dim">
          Remember everything. Trust no one.
        </p>
      </div>

      <div className="anim-up relative z-10 mt-12 flex w-full max-w-sm flex-col gap-3" style={{ animationDelay: '.25s' }}>
        <Btn onClick={onCreate}>Create Room</Btn>
        {joining ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length >= 4) onJoin(code)
            }}
          >
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="CODE"
              aria-label="Room code"
              className="min-w-0 flex-1 rounded-md border border-paper/40 bg-transparent px-4 py-3.5 text-center font-display text-xl font-semibold uppercase tracking-[0.5em] text-paper placeholder:text-dim/50 focus:border-blood focus:outline-none"
            />
            <Btn disabled={code.length < 4} className="px-5">
              Enter
            </Btn>
          </form>
        ) : (
          <Btn variant="ghost" onClick={() => setJoining(true)}>
            Join Room
          </Btn>
        )}
      </div>
    </main>
  )
}
