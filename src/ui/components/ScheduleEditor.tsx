import { useMemo, useState } from 'react'
import { localDateKey } from '../../domain/week'
import { scheduleForDate } from '../../domain/migrate'
import type { ChildId, DaySchedule } from '../../domain/types'
import { QUESTS } from '../../data/quests'
import { WEEKLY_TEMPLATES, weeklyTemplateById } from '../../data/weekly'
import { eligibleWeeklyTemplates, weeklyTemplateFor } from '../../domain/commands'
import { mondayKeyOf } from '../../domain/week'
import { useGameState, useRepository } from '../../storage/hooks'
import { CheckIcon } from './FlatIcons'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Per-child schedule + config editor. All changes save via PIN-gated grown-up
 * commands; effective from today.
 */
export function ScheduleEditor({ childId, pin }: { childId: ChildId; pin: string | null }) {
  const state = useGameState()
  const repo = useRepository()
  const today = localDateKey(new Date(), state.timeZone)
  const current = scheduleForDate(state, today)[childId]
  const quests = useMemo(
    () => QUESTS.filter((q) => !q.retired && q.childIds.includes(childId)),
    [childId],
  )

  const [core, setCore] = useState<Record<number, string[]>>(() => structuredClone(current.core))
  const [bonus, setBonus] = useState<string[]>(() => [...current.bonus])
  const [config, setConfig] = useState(() => ({ ...state.config[childId] }))
  const [paused, setPaused] = useState<string[]>(() => [...state.pausedDates[childId]])
  const [newJob, setNewJob] = useState('')
  const [weeklyId, setWeeklyId] = useState(() =>
    weeklyTemplateFor(state, childId, mondayKeyOf(today)),
  )
  const [newPauseDate, setNewPauseDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const toggleCore = (day: number, questId: string) => {
    setCore((c) => {
      const list = c[day] ?? []
      if (list.includes(questId)) return { ...c, [day]: list.filter((q) => q !== questId) }
      if (list.length >= 3) return c
      return { ...c, [day]: [...list, questId] }
    })
  }
  const toggleBonus = (questId: string) => {
    setBonus((b) => (b.includes(questId) ? b.filter((q) => q !== questId) : [...b, questId]))
  }
  const coreSet = new Set(Object.values(core).flat())

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const schedule: DaySchedule = { core, bonus }
      const r1 = await repo.dispatch(
        { type: 'updateSchedule', childId, core: schedule.core, bonus: schedule.bonus },
        { pin: pin ?? undefined },
      )
      const r2 = await repo.dispatch(
        { type: 'updateChildConfig', childId, patch: config },
        { pin: pin ?? undefined },
      )
      if (weeklyId !== weeklyTemplateFor(state, childId, mondayKeyOf(today))) {
        await repo.dispatch(
          { type: 'setWeeklyChallenge', childId, weekKey: mondayKeyOf(today), templateId: weeklyId },
          { pin: pin ?? undefined },
        )
      }
      // pause diffs
      const before = new Set(state.pausedDates[childId])
      const after = new Set(paused)
      const toPause = [...after].filter((d) => !before.has(d))
      const toUnpause = [...before].filter((d) => !after.has(d))
      if (toPause.length) {
        await repo.dispatch({ type: 'setPaused', childId, dates: toPause, paused: true }, { pin: pin ?? undefined })
      }
      if (toUnpause.length) {
        await repo.dispatch({ type: 'setPaused', childId, dates: toUnpause, paused: false }, { pin: pin ?? undefined })
      }
      if (!r1.ok) setError(r1.error.message)
      else if (!r2.ok) setError(r2.error.message)
      else setSaved(true)
    } catch {
      setError('Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="schedule-editor">
      <h4>Core quests (up to 3 a day)</h4>
      <div className="quest-day-rows">
        <div className="quest-day-head">
          <span className="quest-day-name" />
          {WEEKDAYS.map((name) => (
            <span key={name} className="weekday-name">
              {name}
            </span>
          ))}
        </div>
        {quests.map((q) => (
          <div key={q.id} className="quest-day-row">
            <span className="quest-day-name">{q.label}</span>
            {WEEKDAYS.map((_, d) => (
              <button
                key={d}
                className={`day-dot ${(core[d] ?? []).includes(q.id) ? 'on' : ''}`}
                onClick={() => toggleCore(d, q.id)}
                disabled={
                  !(core[d] ?? []).includes(q.id) &&
                  ((core[d] ?? []).length >= 3 || bonus.includes(q.id))
                }
                aria-label={`${q.label} on ${WEEKDAYS[d]}`}
                aria-pressed={(core[d] ?? []).includes(q.id)}
              >
                {(core[d] ?? []).includes(q.id) ? <CheckIcon size={18} /> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
      <button
        className="btn btn-neutral btn-small"
        onClick={() => setCore((c) => Object.fromEntries(WEEKDAYS.map((_, d) => [d, [...(c[0] ?? [])]])))}
      >
        Copy Monday to all days
      </button>

      <h4>Bonus activities</h4>
      <div className="bonus-toggles">
        {quests
          .filter((q) => !coreSet.has(q.id))
          .map((q) => (
            <label key={q.id} className={`sched-check ${bonus.includes(q.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={bonus.includes(q.id)} onChange={() => toggleBonus(q.id)} />
              {q.label}
            </label>
          ))}
      </div>

      <h4>Rest days</h4>
      <label className="sched-check">
        <input
          type="checkbox"
          checked={paused.includes(today)}
          onChange={(e) =>
            setPaused((p) => (e.target.checked ? [...p, today] : p.filter((d) => d !== today)))
          }
        />
        Today is a rest day
      </label>
      <div className="pause-add">
        <input
          type="date"
          className="form-input"
          value={newPauseDate}
          min={today}
          onChange={(e) => setNewPauseDate(e.target.value)}
        />
        <button
          className="btn btn-neutral btn-small"
          disabled={!newPauseDate}
          onClick={() => {
            setPaused((p) => [...new Set([...p, newPauseDate])].sort())
            setNewPauseDate('')
          }}
        >
          Pause day
        </button>
      </div>
      {paused.filter((d) => d !== today).length > 0 && (
        <ul className="pause-list">
          {paused
            .filter((d) => d !== today)
            .map((d) => (
              <li key={d}>
                {d}{' '}
                <button className="btn btn-ghost btn-small" onClick={() => setPaused((p) => p.filter((x) => x !== d))}>
                  ✕
                </button>
              </li>
            ))}
        </ul>
      )}

      <h4>This week&rsquo;s challenge</h4>
      <div className="form-field">
        <span>Weekly challenge (+20 coins and a badge)</span>
        <select
          className="form-input"
          value={weeklyId}
          onChange={(e) => setWeeklyId(e.target.value)}
        >
          {WEEKLY_TEMPLATES.filter((t) => eligibleWeeklyTemplates(state, childId).includes(t.id)).map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        {weeklyTemplateById(weeklyId) && (
          <span className="muted">Needs approved activities on {weeklyTemplateById(weeklyId)?.days} different days.</span>
        )}
      </div>

      <h4>Settings for {childId === 'theodore' ? 'Theodore' : 'Leonard'}</h4>
      <label className="form-field">
        <span>Math level</span>
        <select
          className="form-input"
          value={config.mathLevel}
          onChange={(e) => setConfig((c) => ({ ...c, mathLevel: Number(e.target.value) as 1 | 2 | 3 }))}
        >
          <option value={1}>1 — counting</option>
          <option value={2}>2 — add &amp; subtract to 20</option>
          <option value={3}>3 — to 100 &amp; times</option>
        </select>
      </label>
      {childId === 'leonard' && (
        <label className="form-field">
          <span>Violin practice goal</span>
          <input
            className="form-input"
            value={config.violinGoal}
            onChange={(e) => setConfig((c) => ({ ...c, violinGoal: e.target.value }))}
            placeholder="Practise 10 minutes: open strings + Twinkle"
          />
        </label>
      )}
      {childId === 'theodore' && (
        <label className="form-field">
          <span>Typing site link</span>
          <input
            className="form-input"
            value={config.typingUrl ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, typingUrl: e.target.value || null }))}
            placeholder="https://…"
          />
        </label>
      )}
      <div className="form-field">
        <span>Housework jobs</span>
        <ul className="jobs-list">
          {config.houseworkJobs.map((job, i) => (
            <li key={i} className="job-row">
              <span>{job}</span>
              <button
                className="btn btn-ghost btn-small"
                aria-label={`Remove ${job}`}
                onClick={() =>
                  setConfig((c) => ({ ...c, houseworkJobs: c.houseworkJobs.filter((_, j) => j !== i) }))
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="pause-add">
          <input
            className="form-input"
            value={newJob}
            onChange={(e) => setNewJob(e.target.value)}
            placeholder="New job…"
          />
          <button
            className="btn btn-neutral btn-small"
            disabled={!newJob.trim()}
            onClick={() => {
              setConfig((c) => ({ ...c, houseworkJobs: [...c.houseworkJobs, newJob.trim()] }))
              setNewJob('')
            }}
          >
            Add job
          </button>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-yes" disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save schedule & settings'}
      </button>
    </div>
  )
}
