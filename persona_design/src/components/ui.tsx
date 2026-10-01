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
          <span className="display-i text-[clamp(1.6rem,4.5vw,2.8rem)] font-black text-cyan">K</span>
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
      className={`cut-sm border-l-4 px-3 py-2.5 text-left transition-colors ${
        active ? 'border-cyan bg-cyan/20 ring-pulse' : 'border-cyan/50 bg-navy-2/80'
      } ${onClick && !disabled ? 'cursor-pointer hover:bg-cyan/15' : ''} ${className}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">{label}</div>
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
    'display-i cut-sm inline-flex items-center justify-center gap-2 px-7 py-3 text-xl tracking-wide transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-35 active:translate-x-1'
  const v =
    variant === 'solid'
      ? 'bg-cyan text-ink hover:bg-ice'
      : 'bg-navy-2 text-cyan shadow-[inset_0_0_0_2px_var(--color-cyan)] hover:bg-cyan hover:text-ink'
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  )
}

export function ReadyBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="display-i cut-sm inline-flex items-center gap-2 bg-cyan px-4 py-1 text-lg text-ink">
      <span className="h-2 w-2 rotate-45 bg-ink" />
      Ready
    </span>
  ) : (
    <span className="display-i cut-sm inline-flex items-center gap-2 bg-navy px-4 py-1 text-lg text-dim shadow-[inset_0_0_0_1px_var(--color-dim)]">
      <span className="h-2 w-2 rotate-45 border border-dim" />
      Waiting
    </span>
  )
}
