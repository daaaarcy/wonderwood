import { useEffect, useMemo, useRef, useState } from 'react'
import {
  generateChallenge,
  orderSequence,
  type ChallengeQuestion,
  type MathLevel,
} from '../../domain/challenge.ts'
import type { ChildId, ClaimDetails } from '../../domain/types.ts'
import { useRepository } from '../../storage/hooks'
import { assetUrl } from '../../game/assets'

interface Props {
  childId: ChildId
  questId: string
  level: MathLevel
  /** claims already made today for this quest → run index for the seed */
  runIndex: number
  today: string
  /** true once a claim already exists today → replay for fun, no reward sheet */
  replay: boolean
  onClose: () => void
}

/** Grey cross drawn over a taken-away token — sized to whatever the token is. */
function AwayCross() {
  return (
    <svg className="away-cross" viewBox="0 0 40 40" preserveAspectRatio="none" aria-hidden="true">
      <line x1="7" y1="7" x2="33" y2="33" stroke="#9c9c9c" strokeWidth="4" strokeLinecap="round" />
      <line x1="33" y1="7" x2="7" y2="33" stroke="#9c9c9c" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** A little flat picture token — kit boxes, stars, fruit etc. No emoji. */
function Token({ t }: { t: string }) {
  const away = t.endsWith('@away')
  const base = away ? t.slice(0, -'@away'.length) : t

  // group boxes in ×N questions — box with its count badge
  const group = base.match(/^box:(\d+)$/)
  if (group) {
    return (
      <span className={`token${away ? ' token-away' : ''}`} aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <rect x="6" y="12" width="28" height="20" rx="5" fill="#ff9600" />
          <rect x="6" y="6" width="28" height="10" rx="5" fill="#ffb14d" />
          <rect x="18" y="4" width="4" height="30" fill="#e08600" />
        </svg>
        <span className="group-badge">{group[1]}</span>
        {away && <AwayCross />}
      </span>
    )
  }

  if (base === 'mystery') {
    return (
      <span className="token" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <rect x="5" y="5" width="30" height="30" rx="9" fill="#f7f7f7" stroke="#c9c9c9" strokeWidth="2.5" strokeDasharray="5 4" />
          <text x="20" y="29" textAnchor="middle" fontSize="22" fontWeight="900" fill="#c9c9c9" fontFamily="Nunito, sans-serif">?</text>
        </svg>
      </span>
    )
  }

  if (base === 'rod') {
    // place-value tens rod — a stack of bricks standing for 10
    return (
      <span className={`token token-rod${away ? ' token-away' : ''}`} aria-label="10">
        <svg viewBox="0 0 24 44">
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x="3" y={4 + i * 8} width="18" height="7" rx="2.5" fill="#ff9600" />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={`h${i}`} x="3" y={4 + i * 8} width="18" height="2.5" rx="1" fill="#ffb14d" />
          ))}
        </svg>
        <span className="rod-badge">10</span>
        {away && <AwayCross />}
      </span>
    )
  }

  const inner = (() => {
    if (base === 'star') return <img className="token-img" src={assetUrl('star')} alt="" />
    if (base === 'apple') {
      return (
        <svg viewBox="0 0 40 40">
          <path d="M20 12 Q28 8 32 16 Q36 26 28 32 Q24 35 20 32 Q16 35 12 32 Q4 26 8 16 Q12 8 20 12 Z" fill="#e0483e" />
          <rect x="18" y="5" width="4" height="7" rx="2" fill="#96683f" />
          <path d="M22 8 q6 -4 8 0 q-6 3 -8 0" fill="#58cc02" />
        </svg>
      )
    }
    if (base === 'rock') {
      return (
        <svg viewBox="0 0 40 40">
          <ellipse cx="20" cy="24" rx="14" ry="11" fill="#b8b8b8" />
          <ellipse cx="16" cy="20" rx="5" ry="4" fill="#d5d5d5" />
        </svg>
      )
    }
    if (base === 'log') {
      return (
        <svg viewBox="0 0 40 40">
          <rect x="6" y="14" width="28" height="14" rx="7" fill="#c98a5a" />
          <circle cx="10" cy="21" r="6" fill="#e5b083" />
        </svg>
      )
    }
    // brick / box — kit boxes
    return <img className="token-img" src={assetUrl('kit-box')} alt="" />
  })()

  return (
    <span className={`token${away ? ' token-away' : ''}`} aria-hidden="true">
      {inner}
      {away && <AwayCross />}
    </span>
  )
}

function Pile({ tokens, label }: { tokens: string[]; label?: string }) {
  return (
    <div className="challenge-pile" aria-hidden="true">
      {tokens.map((t, i) => (
        <Token key={i} t={t} />
      ))}
      {label && <span className="pile-label">{label}</span>}
    </div>
  )
}

function Picture({
  q,
  onPileTap,
}: {
  q: ChallengeQuestion
  onPileTap?: (which: 1 | 2) => void
}) {
  if (q.kind === 'compare') {
    return (
      <div className="challenge-picture" role="group" aria-label="Two piles">
        <button
          type="button"
          className="challenge-pile pile-btn"
          onClick={() => onPileTap?.(1)}
          aria-label="First pile"
        >
          {q.picture.map((t, i) => (
            <Token key={i} t={t} />
          ))}
        </button>
        <button
          type="button"
          className="challenge-pile pile-btn"
          onClick={() => onPileTap?.(2)}
          aria-label="Second pile"
        >
          {(q.pictureB ?? []).map((t, i) => (
            <Token key={i} t={t} />
          ))}
        </button>
      </div>
    )
  }
  if (q.picture.length === 0) return null
  return (
    <div className="challenge-picture" aria-hidden="true">
      <Pile tokens={q.picture} />
      {q.pictureB && (
        <>
          {q.kind === 'add' && <span className="pile-sign">+</span>}
          <Pile tokens={q.pictureB} />
        </>
      )}
    </div>
  )
}

export function ChallengeModal({ childId, questId, level, runIndex, today, replay, onClose }: Props) {
  const repo = useRepository()
  const questions = useMemo(
    () => generateChallenge(level, `${childId}:${today}:${runIndex}`),
    [level, childId, today, runIndex],
  )
  const [qi, setQi] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [wrongOnce, setWrongOnce] = useState<Set<number>>(new Set())
  const [hintShown, setHintShown] = useState<Set<number>>(new Set())
  const [orderPick, setOrderPick] = useState<number[]>([])
  const [feedback, setFeedback] = useState<'try' | 'right' | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // the auto-advance must never fire after the sheet is gone
  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    }
  }, [])

  const done = qi >= questions.length
  const q = questions[qi] ?? questions[questions.length - 1]
  const isOrder = q.kind === 'order'
  const correctFirstTry = questions.length - wrongOnce.size

  const scheduleNext = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    advanceTimer.current = setTimeout(nextQuestion, 700)
  }

  const tap = (opt: number) => {
    if (feedback === 'right') return // mid-advance — don't double-count
    if (isOrder) {
      if (orderPick.includes(opt)) return
      const next = [...orderPick, opt]
      const expected = orderSequence(q)
      if (opt !== expected[next.length - 1]) {
        setFeedback('try')
        setWrongOnce((s) => new Set(s).add(qi))
        setOrderPick([])
        return
      }
      if (next.length === expected.length) {
        setOrderPick(next)
        setFeedback('right')
        scheduleNext()
      } else {
        setOrderPick(next)
      }
      return
    }
    if (opt === q.options[q.answerIndex]) {
      setFeedback('right')
      scheduleNext()
    } else {
      setFeedback('try')
      setWrongOnce((s) => new Set(s).add(qi))
    }
  }

  const nextQuestion = () => {
    advanceTimer.current = null
    setQi((i) => i + 1)
    setFeedback(null)
    setOrderPick([])
  }

  const showHint = () => {
    if (!hintShown.has(qi)) {
      setHintsUsed((n) => n + 1)
      setHintShown((s) => new Set(s).add(qi))
    }
  }

  const send = async () => {
    setSending(true)
    setSendError(null)
    const details: ClaimDetails = {
      kind: 'challenge',
      hintsUsed,
      correctFirstTry,
    }
    const r = await repo.dispatch({
      type: 'claimQuest',
      childId,
      questId,
      claimId: crypto.randomUUID(),
      details,
    })
    setSending(false)
    if (r.ok) {
      setSent(true)
      return
    }
    const code = 'error' in r ? r.error.code : undefined
    setSendError(
      code === 'already-claimed-today'
        ? 'This one is already waiting for a grown-up!'
        : 'Hmm, that didn’t send — try again?',
    )
  }

  const close = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    onClose()
  }

  return (
    <div className="sheet-backdrop">
      <div className="sheet challenge-sheet" role="dialog" aria-label="Math challenge">
        <p className="challenge-story">The builders need help!</p>
        {!done ? (
          <>
            <p className="challenge-step muted">
              Question {qi + 1} of {questions.length}
            </p>
            <p className="challenge-prompt">{q.prompt}</p>
            <Picture q={q} onPileTap={(which) => tap(which === 1 ? 1 : 2)} />
            {isOrder && (
              <div className="order-slots" aria-hidden="true">
                {orderSequence(q).map((_, i) => (
                  <span key={i} className={`order-slot ${orderPick[i] != null ? 'slot-filled' : ''}`}>
                    {orderPick[i] ?? ''}
                  </span>
                ))}
              </div>
            )}
            {/* reserved slot — hint or feedback shows here so buttons never jump */}
            <div className="challenge-note" aria-live="polite">
              {hintShown.has(qi) && <p className="challenge-hint">{q.hint}</p>}
              {feedback === 'try' && (
                <p className="challenge-try" role="alert">
                  Try again!
                </p>
              )}
              {feedback === 'right' && <p className="challenge-right">Yes!</p>}
            </div>
            {q.kind !== 'compare' && (
              <div className="challenge-options">
                {isOrder &&
                  q.options.map((n) => (
                    <button
                      key={n}
                      className={`btn btn-big challenge-opt ${orderPick.includes(n) ? 'opt-picked' : ''}`}
                      disabled={orderPick.includes(n)}
                      onClick={() => tap(n)}
                    >
                      {n}
                    </button>
                  ))}
                {!isOrder &&
                  q.options.map((n, i) => (
                    <button key={i} className="btn btn-big challenge-opt" onClick={() => tap(n)}>
                      {q.labels ? q.labels[i] : n}
                    </button>
                  ))}
              </div>
            )}
            <div className="challenge-tools">
              <button className="btn btn-neutral btn-small" onClick={showHint}>
                Hint
              </button>
              <button className="btn btn-ghost btn-small" onClick={close}>
                Later
              </button>
            </div>
          </>
        ) : sent ? (
          <>
            <p className="sheet-title">Sent to a grown-up!</p>
            <button className="btn btn-yes" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <p className="sheet-title">All done — the builders cheer!</p>
            <p className="muted">
              {correctFirstTry === questions.length
                ? 'First try on every one!'
                : `${correctFirstTry} first try, ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}`}
            </p>
            {sendError && (
              <p className="challenge-try" role="alert">
                {sendError}
              </p>
            )}
            {replay ? (
              <button className="btn btn-yes" onClick={onClose}>
                Done
              </button>
            ) : (
              <button className="btn btn-yes" disabled={sending} onClick={() => void send()}>
                {sending ? 'Sending…' : 'Send to a grown-up'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
