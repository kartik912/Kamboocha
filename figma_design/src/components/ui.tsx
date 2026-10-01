import type { ReactNode } from 'react'

export type Card = { id: number; rank: number; suit: string }

const SUITS = ['♠', '♥', '♦', '♣']

export function makeDeck(): Card[] {
  const cards: Card[] = []
  let id = 0
  for (const suit of SUITS) for (let rank = 1; rank <= 10; rank++) cards.push({ id: id++, rank, suit })
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

const isRed = (s: string) => s === '♥' || s === '♦'

export function PlayingCard({
  card,
  faceUp,
  onClick,
  pickable,
  disabled,
  delay = 0,
  className = '',
  label,
}: {
  card?: Card
  faceUp: boolean
  onClick?: () => void
  pickable?: boolean
  disabled?: boolean
  delay?: number
  className?: string
  label?: string
}) {
  const red = card && isRed(card.suit)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-label={label ?? (faceUp && card ? `${card.rank} of ${card.suit}` : 'Hidden card')}
      style={{ animationDelay: `${delay}ms` }}
      className={`flip anim-deal relative block aspect-[5/7] w-full select-none rounded-lg p-0 ${
        onClick && !disabled ? 'cursor-pointer transition-transform duration-200 hover:-translate-y-1' : ''
      } ${pickable ? 'pickable' : ''} ${className}`}
    >
      <div className={`flip-inner ${faceUp ? 'up' : ''}`}>
        <div className="face card-back grid place-items-center">
          <span className="font-display text-[clamp(1.4rem,4vw,2.4rem)] font-semibold italic text-paper/40">K</span>
        </div>
        <div className={`face face-front card-face ${red ? 'text-blood' : 'text-ink'}`}>
          {card && (
            <>
              <div className="absolute left-[10%] top-[7%] flex flex-col items-center font-display text-[clamp(.8rem,2vw,1.15rem)] font-semibold leading-none">
                {card.rank}
                <span className="mt-0.5 text-[.9em]">{card.suit}</span>
              </div>
              <div className="absolute inset-0 grid place-items-center font-display text-[clamp(2.2rem,7vw,4.2rem)] font-semibold leading-none">
                {card.rank}
              </div>
              <div className="absolute bottom-[7%] right-[10%] flex rotate-180 flex-col items-center font-display text-[clamp(.8rem,2vw,1.15rem)] font-semibold leading-none">
                {card.rank}
                <span className="mt-0.5 text-[.9em]">{card.suit}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </Tag>
  )
}

export function InfoBox({
  label,
  children,
  active,
  className = '',
  onClick,
  disabled,
}: {
  label: string
  children: ReactNode
  active?: boolean
  className?: string
  onClick?: () => void
  disabled?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      className={`rounded-md border bg-felt-2/70 px-3 py-2.5 text-left backdrop-blur-sm transition-colors ${
        active ? 'border-blood ring-pulse' : 'border-line'
      } ${onClick && !disabled ? 'cursor-pointer hover:border-paper/50' : ''} ${className}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{label}</div>
      <div className="mt-1">{children}</div>
    </Tag>
  )
}

export function Btn({
  children,
  onClick,
  variant = 'solid',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'solid' | 'ghost'
  disabled?: boolean
  className?: string
}) {
  const base =
    'group inline-flex items-center justify-center gap-2 rounded-md px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.16em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35'
  const v =
    variant === 'solid'
      ? 'bg-paper text-ink hover:bg-blood hover:text-paper active:scale-[.98]'
      : 'border border-paper/30 text-paper hover:border-paper hover:bg-paper/5 active:scale-[.98]'
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  )
}

export function ReadyBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-sage px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink">
      <span className="h-2 w-2 rounded-full bg-ink" />
      Ready
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-dim px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-dim">
      <span className="h-2 w-2 rounded-full border border-dim" />
      Waiting
    </span>
  )
}
