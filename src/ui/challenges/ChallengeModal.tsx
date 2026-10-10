import { useMemo, useState } from 'react'
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

/** A little flat picture token — kit boxes, stars, fruit etc. No emoji. */
function Token({ t }: { t: string }) {
  if (t === 'away') {
    // "taken away" — a faded gray box, not a scary red X
    return (
      <span className="token token-away" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <rect x="6" y="12" width="28" height="20" rx="5" fill="#cfcfcf" />
          <rect x="6" y="6" width="28" height="10" rx="5" fill="#e2e2e2" />
          <line x1="10" y1="10" x2="30" y2="34" stroke="#9c9c9c" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  if (t === 'add') {
    return (
      <span className="token token-add" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <rect x="6" y="12" width="28" height="20" rx="5" fill="#58b368" />
          <rect x="6" y="6" width="28" height="10" rx="5" fill="#7ed957" />
        </svg>
      </span>
    )
  }
  if (t === 'star') return <img className="token" src={assetUrl('star')} alt="" />
  if (t === 'apple') {
    return (
      <span className="token" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <path d="M20 12 Q28 8 32 16 Q36 26 28 32 Q24 35 20 32 Q16 35 12 32 Q4 26 8 16 Q12 8 20 12 Z" fill="#e0483e" />
          <rect x="18" y="5" width="4" height="7" rx="2" fill="#96683f" />
          <path d="M22 8 q6 -4 8 0 q-6 3 -8 0" fill="#58cc02" />
        </svg>
      </span>
    )
  }
  if (t === 'rock') {
    return (
      <span className="token" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <ellipse cx="20" cy="24" rx="14" ry="11" fill="#b8b8b8" />
          <ellipse cx="16" cy="20" rx="5" ry="4" fill="#d5d5d5" />
        </svg>
      </span>
    )
  }
  if (t === 'log') {
    return (
      <span className="token" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <rect x="6" y="14" width="28" height="14" rx="7" fill="#c98a5a" />
          <circle cx="10" cy="21" r="6" fill="#e5b083" />
        </svg>
      </span>
    )
  }
  // brick / box — kit boxes
  return <img className="token" src={assetUrl('kit-box')} alt="" />
}

function Picture({ q }: { q: ChallengeQuestion }) {
  if (q.picture.length === 0) return null
  return (
    <div className="challenge-picture" aria-hidden="true">
      <div className="challenge-pile">
        {q.picture.map((t, i) => (
          <Token key={i} t={t} />
        ))}
      </div>
      {q.pictureB && (
        <div className="challenge-pile">
          {q.pictureB.map((t, i) => (
            <Token key={i} t={t} />
          ))}
        </div>
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

  const done = qi >= questions.length
  const q = questions[qi] ?? questions[questions.length - 1]
  const isOrder = q.answerIndex === -1
  const correctFirstTry = questions.length - wrongOnce.size

  const tap = (opt: number) => {
    if (feedback === 'right') return
    if (isOrder) {
      const next = [...orderPick, opt]
      const expected = orderSequence(q)
      if (opt !== expected[next.length - 1]) {
        setFeedback('try')
        setWrongOnce((s) => new Set(s).add(qi))
        setOrderPick([])
        return
      }
      setFeedback(null)
      if (next.length === expected.length) {
        setFeedback('right')
        setTimeout(() => nextQuestion(), 700)
      } else {
        setOrderPick(next)
      }
      return
    }
    if (opt === q.options[q.answerIndex]) {
      setFeedback('right')
      setTimeout(() => nextQuestion(), 700)
    } else {
      setFeedback('try')
      setWrongOnce((s) => new Set(s).add(qi))
    }
  }

  const nextQuestion = () => {
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
    const details: ClaimDetails = {
      kind: 'challenge',
      hintsUsed,
      correctFirstTry,
    }
    await repo.dispatch({
      type: 'claimQuest',
      childId,
      questId,
      claimId: crypto.randomUUID(),
      details,
    })
    setSent(true)
    setSending(false)
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
            <Picture q={q} />
            {hintShown.has(qi) && <p className="challenge-hint">{q.hint}</p>}
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
            {feedback === 'try' && <p className="challenge-try" role="alert">Try again!</p>}
            {feedback === 'right' && <p className="challenge-right">Yes!</p>}
            <div className="challenge-tools">
              <button className="btn btn-neutral btn-small" onClick={showHint}>
                Hint
              </button>
              <button className="btn btn-ghost btn-small" onClick={onClose}>
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
