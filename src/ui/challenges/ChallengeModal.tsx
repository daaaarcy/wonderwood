import { useMemo, useState } from 'react'
import {
  generateChallenge,
  orderSequence,
  type ChallengeQuestion,
  type MathLevel,
} from '../../domain/challenge.ts'
import type { ChildId, ClaimDetails } from '../../domain/types.ts'
import { useRepository } from '../../storage/hooks'

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

function Picture({ q }: { q: ChallengeQuestion }) {
  if (q.picture.length === 0) return null
  return (
    <div className="challenge-picture" aria-hidden="true">
      <div className="challenge-pile">{q.picture.join('')}</div>
      {q.pictureB && <div className="challenge-pile">{q.pictureB.join('')}</div>}
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
            {hintShown.has(qi) && <p className="challenge-hint">💡 {q.hint}</p>}
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
            {feedback === 'right' && <p className="challenge-right">Yes! 🎉</p>}
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
