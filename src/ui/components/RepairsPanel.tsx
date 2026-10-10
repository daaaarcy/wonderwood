import { useState } from 'react'
import type { ChildId, IncidentKind } from '../../domain/types'
import { CHILD_LIST } from '../../data/children'
import { useGameState, useRepository } from '../../storage/hooks'

const SITUATIONS: { id: IncidentKind; label: string; repair: string }[] = [
  {
    id: 'spitting',
    label: 'Spitting on purpose',
    repair: 'Help clean the spot safely with a grown-up.',
  },
  {
    id: 'scattering',
    label: 'Scattering or throwing belongings',
    repair: 'Put those things back, with help if needed.',
  },
  {
    id: 'untrue',
    label: 'Saying something untrue',
    repair: 'Talk about what happened and help fix the problem it caused.',
  },
  {
    id: 'fighting',
    label: 'Fighting',
    repair:
      'First make sure everyone is safe. Later: check on your brother and agree how to take turns.',
  },
  { id: 'other', label: 'Other', repair: 'Talk together and agree a kind way to fix it.' },
]

/**
 * Reset & Repair — a private grown-up tool. Repairs earn thanks, never coins;
 * kids only ever see a one-time thank-you card on their own Home.
 */
export function RepairsPanel({ pin }: { pin: string | null }) {
  const state = useGameState()
  const repo = useRepository()
  const [childId, setChildId] = useState<ChildId>('theodore')
  const [situation, setSituation] = useState<IncidentKind | ''>('')
  const [otherText, setOtherText] = useState('')
  const [note, setNote] = useState('')
  const [toyText, setToyText] = useState('')
  const [toyReturn, setToyReturn] = useState('')
  const [busy, setBusy] = useState(false)

  const incidents = Object.values(state.repairs).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const active = incidents.filter((i) => !i.repairedAt)
  const suggestion = SITUATIONS.find((s) => s.id === situation)

  const log = async () => {
    if (!situation || busy) return
    setBusy(true)
    try {
      await repo.dispatch(
        {
          type: 'logIncident',
          childId,
          incidentId: crypto.randomUUID(),
          situation,
          otherText: situation === 'other' ? otherText : undefined,
          note: note || undefined,
          toyReminder: toyText ? { text: toyText, returnAt: toyReturn || undefined } : undefined,
        },
        { pin: pin ?? undefined },
      )
      setSituation('')
      setOtherText('')
      setNote('')
      setToyText('')
      setToyReturn('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel repairs-panel" aria-label="Reset and Repair">
      <h3>Reset &amp; Repair</h3>
      <p className="muted guidance">
        Calm, specific, connected to the behavior. Repair earns thanks, not coins.
      </p>

      <div className="form-field">
        <span>Who is this about?</span>
        <div className="pair-row">
          {CHILD_LIST.map((c) => (
            <button
              key={c.id}
              className={`btn btn-small ${childId === c.id ? 'btn-yes' : 'btn-neutral'}`}
              onClick={() => setChildId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="form-field">
        <span>What happened?</span>
        <select
          className="form-input"
          value={situation}
          onChange={(e) => setSituation(e.target.value as IncidentKind | '')}
          aria-label="Situation"
        >
          <option value="">Choose…</option>
          {SITUATIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {situation === 'other' && (
        <div className="form-field">
          <span>Tell it simply</span>
          <input
            className="form-input"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="A few words…"
          />
        </div>
      )}
      {suggestion && (
        <p className="repair-suggestion" data-testid="repair-suggestion">
          Suggested repair: {suggestion.repair}
        </p>
      )}

      <div className="form-field">
        <span>Note (optional)</span>
        <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="form-field">
        <span>Toy set aside (optional — a reminder, nothing changes in the game)</span>
        <input
          className="form-input"
          value={toyText}
          onChange={(e) => setToyText(e.target.value)}
          placeholder="e.g. the red truck, until tomorrow"
        />
        {toyText && (
          <input
            className="form-input"
            type="datetime-local"
            value={toyReturn}
            onChange={(e) => setToyReturn(e.target.value)}
            aria-label="Return time"
          />
        )}
      </div>
      <button className="btn btn-yes" disabled={!situation || busy} onClick={() => void log()}>
        Write it down
      </button>

      {active.length > 0 && (
        <ul className="repair-list">
          {active.map((i) => (
            <li key={i.id} className="repair-row">
              <div>
                <b>{CHILD_LIST.find((c) => c.id === i.childId)?.name}</b> —{' '}
                {SITUATIONS.find((s) => s.id === i.situation)?.label}
                {i.otherText ? `: ${i.otherText}` : ''}
                {i.toyReminder && (
                  <span className="muted"> · toy aside: {i.toyReminder.text}</span>
                )}
              </div>
              <div className="repair-actions">
                <button
                  className="btn btn-yes btn-small"
                  onClick={() =>
                    void repo.dispatch({ type: 'markRepaired', incidentId: i.id }, { pin: pin ?? undefined })
                  }
                >
                  Repaired
                </button>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() =>
                    void repo.dispatch({ type: 'deleteIncident', incidentId: i.id }, { pin: pin ?? undefined })
                  }
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
