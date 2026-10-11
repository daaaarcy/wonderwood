import { useState } from 'react'
import type { ChildId, CustomQuest } from '../../domain/types'
import { CHILDREN } from '../../data/children'
import { assetUrl } from '../../game/assets'
import { useGameState, useRepository } from '../../storage/hooks'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function daysLabel(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'Every day'
  return days.map((d) => DAY_NAMES[d]).join(', ')
}

function rewardLabel(q: CustomQuest): string {
  const bits: string[] = []
  if (q.coins > 0) bits.push(`${q.coins} coins`)
  if (q.stars > 0) bits.push(`${q.stars} star${q.stars === 1 ? '' : 's'}`)
  return bits.length > 0 ? `+${bits.join(', ')}` : 'no reward'
}

interface Draft {
  title: string
  coins: number
  stars: number
  childIds: ChildId[]
  days: number[]
}

const EMPTY_DRAFT: Draft = { title: '', coins: 10, stars: 1, childIds: ['theodore', 'leonard'], days: [] }

/** The "Tasks" panel: grown-ups write small custom quests for the explorers. */
export function TasksPanel({ pin }: { pin: string | null }) {
  const state = useGameState()
  const repo = useRepository()
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [error, setError] = useState('')

  const quests = Object.values(state.customQuests).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const active = quests.filter((q) => q.active)
  const paused = quests.filter((q) => !q.active)

  const openNew = () => {
    setDraft(EMPTY_DRAFT)
    setError('')
    setEditingId('new')
  }
  const openEdit = (q: CustomQuest) => {
    setDraft({ title: q.title, coins: q.coins, stars: q.stars, childIds: [...q.childIds], days: [...q.days] })
    setError('')
    setEditingId(q.id)
  }
  const close = () => {
    setEditingId(null)
    setError('')
  }

  const toggleChild = (id: ChildId) => {
    setDraft((d) => {
      const has = d.childIds.includes(id)
      const next = has ? d.childIds.filter((c) => c !== id) : [...d.childIds, id]
      return { ...d, childIds: next }
    })
  }
  const toggleDay = (day: number) => {
    setDraft((d) => ({
      ...d,
      days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort(),
    }))
  }
  const step = (field: 'coins' | 'stars', delta: number, max: number) => {
    setDraft((d) => ({ ...d, [field]: Math.min(max, Math.max(0, d[field] + delta)) }))
  }

  const save = async () => {
    setError('')
    const pinOpt = { pin: pin ?? undefined }
    const r =
      editingId === 'new'
        ? await repo.dispatch(
            {
              type: 'createCustomQuest',
              questId: crypto.randomUUID(),
              title: draft.title,
              coins: draft.coins,
              stars: draft.stars,
              childIds: draft.childIds,
              days: draft.days,
            },
            pinOpt,
          )
        : await repo.dispatch(
            { type: 'updateCustomQuest', id: editingId!, patch: { ...draft } },
            pinOpt,
          )
    if (!r.ok) {
      setError(r.error.message)
      return
    }
    close()
  }

  const setActive = (q: CustomQuest, active: boolean) =>
    void repo.dispatch({ type: 'updateCustomQuest', id: q.id, patch: { active } }, { pin: pin ?? undefined })

  const questRow = (q: CustomQuest) => (
    <li key={q.id} className="claim-row task-row" data-testid={`task-${q.id}`}>
      <div className="claim-info">
        <strong>{q.title}</strong>
        <span className="muted">
          {q.childIds.map((c) => CHILDREN[c].name).join(' & ')} · {daysLabel(q.days)} · {rewardLabel(q)}
        </span>
      </div>
      <div className="claim-actions">
        <button className="btn btn-small btn-neutral" onClick={() => openEdit(q)}>
          Edit
        </button>
        {q.active ? (
          <button className="btn btn-small btn-ghost" onClick={() => setActive(q, false)}>
            Pause
          </button>
        ) : (
          <button className="btn btn-small btn-yes" onClick={() => setActive(q, true)}>
            Resume
          </button>
        )}
      </div>
    </li>
  )

  return (
    <section className="panel tasks-panel" aria-label="Tasks">
      <h3>Tasks</h3>
      <p className="muted">Little jobs you write yourself — the explorers see them under “From grown-ups”.</p>

      {editingId === null ? (
        <button className="btn btn-yes" data-testid="add-task" onClick={openNew}>
          Add a task
        </button>
      ) : (
        <div className="task-form" role="form" aria-label={editingId === 'new' ? 'Add a task' : 'Edit task'}>
          <label className="field">
            <span>Task</span>
            <input
              type="text"
              value={draft.title}
              maxLength={60}
              placeholder="e.g. Water the plants"
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </label>

          <div className="field">
            <span>For</span>
            <div className="toggle-row">
              {(Object.keys(CHILDREN) as ChildId[]).map((id) => (
                <button
                  key={id}
                  className={`toggle-chip ${draft.childIds.includes(id) ? 'toggle-on' : ''}`}
                  data-testid={`task-child-${id}`}
                  onClick={() => toggleChild(id)}
                >
                  {CHILDREN[id].name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Days</span>
            <div className="toggle-row">
              <button
                className={`toggle-chip ${draft.days.length === 0 ? 'toggle-on' : ''}`}
                data-testid="task-everyday"
                onClick={() => setDraft((d) => ({ ...d, days: [] }))}
              >
                Every day
              </button>
              {DAY_NAMES.map((name, i) => (
                <button
                  key={name}
                  className={`toggle-chip ${draft.days.includes(i) ? 'toggle-on' : ''}`}
                  onClick={() => toggleDay(i)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="field-inline">
            <div className="field">
              <span>Coins</span>
              <div className="stepper">
                <button aria-label="Fewer coins" onClick={() => step('coins', -1, 99)} disabled={draft.coins <= 0}>
                  −
                </button>
                <span data-testid="task-coins">{draft.coins}</span>
                <button aria-label="More coins" onClick={() => step('coins', 1, 99)} disabled={draft.coins >= 99}>
                  +
                </button>
              </div>
            </div>
            <div className="field">
              <span>Stars</span>
              <div className="stepper">
                <button aria-label="Fewer stars" onClick={() => step('stars', -1, 5)} disabled={draft.stars <= 0}>
                  −
                </button>
                <span data-testid="task-stars">{draft.stars}</span>
                <button aria-label="More stars" onClick={() => step('stars', 1, 5)} disabled={draft.stars >= 5}>
                  +
                </button>
              </div>
            </div>
          </div>
          <p className="muted stepper-note">
            <img src={assetUrl('star')} alt="" className="hint-icon" /> stars help league progress
          </p>

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="sheet-actions">
            <button className="btn btn-yes" data-testid="task-save" onClick={() => void save()}>
              {editingId === 'new' ? 'Add task' : 'Save changes'}
            </button>
            <button className="btn btn-neutral" onClick={close}>
              Cancel
            </button>
            {editingId !== 'new' && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const q = state.customQuests[editingId]
                  if (q) setActive(q, false)
                  close()
                }}
              >
                Archive task
              </button>
            )}
          </div>
        </div>
      )}

      {active.length > 0 && <ul className="claim-list task-list">{active.map(questRow)}</ul>}
      {paused.length > 0 && (
        <details className="paused-tasks">
          <summary>Paused tasks ({paused.length})</summary>
          <ul className="claim-list task-list">{paused.map(questRow)}</ul>
        </details>
      )}
    </section>
  )
}
