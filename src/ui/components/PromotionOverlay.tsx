import { useEffect, useMemo, useRef } from 'react'
import { leagueTitle } from '../../data/leagues'
import { CHILDREN } from '../../data/children'
import type { ChildId } from '../../domain/types'
import { playFanfare } from '../fanfare'
import { useReducedMotion } from '../useReducedMotion'
import { LeagueBadge } from './LeagueBadge'

interface Props {
  childId: ChildId
  from: number
  to: number
  soundOn: boolean
  onDone: () => void
}

const CONFETTI_COLORS = ['#f66d6d', '#f6a85e', '#f9dc5c', '#7fcb6e', '#5ba8e0', '#9b7ede', '#f2a03d']

export function PromotionOverlay({ childId, from, to, soundOn, onDone }: Props) {
  const reduced = useReducedMotion()
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    playFanfare(soundOn)
    buttonRef.current?.focus()
  }, [soundOn])

  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 9) * 0.18,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        drift: ((i * 53) % 60) - 30,
        size: 8 + ((i * 7) % 8),
      })),
    [],
  )

  return (
    <div className="promotion-overlay" role="dialog" aria-modal="true" aria-label="League promotion!">
      {!reduced && (
        <div className="confetti" aria-hidden="true">
          {pieces.map((p, i) => (
            <i
              key={i}
              style={{
                left: `${p.left}%`,
                animationDelay: `${p.delay}s`,
                background: p.color,
                width: p.size,
                height: p.size * 0.6,
                ['--drift' as string]: `${p.drift}px`,
              }}
            />
          ))}
        </div>
      )}
      <div className="promo-card">
        {reduced ? (
          <div className="promo-badges-static">
            <LeagueBadge rank={from} size={76} />
            <span className="promo-arrow" aria-hidden="true">→</span>
            <LeagueBadge rank={to} size={76} />
          </div>
        ) : (
          <div className="promo-morph" aria-hidden="true">
            <div className="promo-badge promo-old">
              <LeagueBadge rank={from} size={110} />
            </div>
            <div className="promo-badge promo-new">
              <LeagueBadge rank={to} size={120} animated />
            </div>
            <div className="promo-flash" />
          </div>
        )}
        <h2 className="promo-title">
          {CHILDREN[childId].name} is now in the
          <br />
          {leagueTitle(to)}!
        </h2>
        <button ref={buttonRef} className="btn btn-big btn-yes" onClick={onDone}>
          Hooray!
        </button>
      </div>
    </div>
  )
}
