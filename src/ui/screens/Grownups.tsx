import { useState } from 'react'
import { localDateKey } from '../../domain/state'
import { pendingClaims, todayQuestsFor } from '../../domain/selectors'
import { CHILD_LIST } from '../../data/children'
import { questById, questsFor } from '../../data/quests'
import { assetUrl } from '../../game/assets'
import { useGameState, useRepository } from '../../storage/hooks'
import { sha256Hex } from '../../storage/pin'
import { LeagueBadge } from '../components/LeagueBadge'
import { leagueTitle } from '../../data/leagues'
import { PROJECTS, projectById } from '../../data/city'

type PinStage = 'set' | 'confirm' | 'enter'

export function Grownups({ onExit }: { onExit: () => void }) {
  const state = useGameState()
  const repo = useRepository()
  const [unlocked, setUnlocked] = useState(false)
  const defaultStage: PinStage = state.parentPinHash ? 'enter' : 'set'
  const [stage, setStage] = useState<{ hash: string | null; stage: PinStage }>({
    hash: state.parentPinHash,
    stage: defaultStage,
  })
  const [firstPin, setFirstPin] = useState('')
  const [entry, setEntry] = useState('')
  const [error, setError] = useState('')

  // Re-sync the PIN stage if the stored hash changes while this screen is open.
  if (stage.hash !== state.parentPinHash) {
    setStage({ hash: state.parentPinHash, stage: defaultStage })
    setEntry('')
    setFirstPin('')
  }
  const pinStage = stage.stage

  const submitPin = async (pin: string) => {
    setError('')
    if (pinStage === 'set') {
      setFirstPin(pin)
      setStage({ hash: state.parentPinHash, stage: 'confirm' })
      setEntry('')
      return
    }
    if (pinStage === 'confirm') {
      if (pin !== firstPin) {
        setError('Those PINs did not match — try again.')
        setStage({ hash: state.parentPinHash, stage: 'set' })
        setFirstPin('')
        setEntry('')
        return
      }
      const pinHash = await sha256Hex(pin)
      void repo.dispatch({ type: 'setParentPin', pin, pinHash })
      setUnlocked(true)
      return
    }
    const pinHash = await sha256Hex(pin)
    if (pinHash === state.parentPinHash) {
      setUnlocked(true)
    } else {
      setError('Not quite — try again.')
      setEntry('')
    }
  }

  const press = (d: string) => {
    if (d === 'del') {
      setEntry((e) => e.slice(0, -1))
      return
    }
    const next = (entry + d).slice(0, 4)
    setEntry(next)
    if (next.length === 4) void submitPin(next)
  }

  if (!unlocked) {
    return (
      <div className="screen grownups-screen">
        <h2 className="screen-title">Grown-ups</h2>
        <p className="pin-prompt">
          {pinStage === 'set' && 'Choose a 4-digit PIN'}
          {pinStage === 'confirm' && 'Tap the same PIN again'}
          {pinStage === 'enter' && 'Enter your PIN'}
        </p>
        <div className="pin-dots" aria-label={`${entry.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pin-dot ${i < entry.length ? 'filled' : ''}`} />
          ))}
        </div>
        {error && <p className="pin-error" role="alert">{error}</p>}
        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((d, i) =>
            d === '' ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                className="pin-key"
                onClick={() => press(d)}
                aria-label={d === 'del' ? 'Delete' : `Digit ${d}`}
              >
                {d === 'del' ? '⌫' : d}
              </button>
            ),
          )}
        </div>
        <button className="btn btn-ghost" onClick={onExit}>
          Back to the island
        </button>
      </div>
    )
  }

  const pending = pendingClaims(state)
  const today = localDateKey(new Date())

  return (
    <div className="screen grownups-screen">
      <h2 className="screen-title">Grown-ups</h2>

      <section className="panel pending-panel">
        <h3>Waiting for you</h3>
        {pending.length === 0 && <p className="muted">Nothing waiting — all caught up!</p>}
        <ul className="claim-list">
          {pending.map((claim) => {
            const quest = questById(claim.questId)
            const child = CHILD_LIST.find((c) => c.id === claim.childId)
            return (
              <li key={claim.id} className="claim-row">
                <div className="claim-info">
                  <strong style={{ color: child?.darkColor }}>{child?.name}</strong>
                  <span>{quest?.label ?? claim.questId}</span>
                  <span className="muted">{claim.activityDate}</span>
                </div>
                <div className="claim-actions">
                  <button
                    className="btn btn-yes"
                    onClick={() => void repo.dispatch({ type: 'approveClaim', claimId: claim.id })}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => void repo.dispatch({ type: 'rejectClaim', claimId: claim.id })}
                  >
                    Not yet
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {state.city.currentProjectId === null && (
        <section className="panel next-building" aria-label="Choose the next building">
          <h3>Next building</h3>
          {state.city.suggestedProjectId && (
            <p className="muted">
              The explorers suggested the{' '}
              <strong>{projectById(state.city.suggestedProjectId)?.label}</strong>.
            </p>
          )}
          <ul className="claim-list">
            {PROJECTS.filter((p) => state.city.projects[p.id].status === 'locked').map((p) => (
              <li
                key={p.id}
                className={`claim-row ${state.city.suggestedProjectId === p.id ? 'row-suggested' : ''}`}
              >
                <div className="claim-info">
                  <span className="quest-icon-small" style={{ background: p.color }}>
                    <img src={assetUrl(p.iconKey)} alt="" />
                  </span>
                  <span>
                    {p.name} <span className="muted">· {p.kits} kits</span>
                    {state.city.suggestedProjectId === p.id && (
                      <span className="tag tag-suggested">Suggested</span>
                    )}
                  </span>
                </div>
                <div className="claim-actions">
                  <button
                    className="btn btn-yes"
                    onClick={() => void repo.dispatch({ type: 'chooseNextProject', projectId: p.id })}
                  >
                    Build this next
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel settings-panel">
        <h3>Settings</h3>
        <label className="sound-toggle">
          <span>Sound</span>
          <button
            className={`btn btn-small ${state.settings.sound ? 'btn-yes' : 'btn-ghost'}`}
            role="switch"
            aria-checked={state.settings.sound}
            onClick={() => void repo.dispatch({ type: 'setSound', enabled: !state.settings.sound })}
          >
            {state.settings.sound ? 'On' : 'Off'}
          </button>
        </label>
      </section>

      {CHILD_LIST.map((child) => {
        const todayStatuses = todayQuestsFor(
          state,
          child.id,
          questsFor(child.id).map((q) => q.id),
          new Date(),
        )
        const league = state.children[child.id].league
        return (
          <section key={child.id} className="panel">
            <h3 style={{ color: child.darkColor }}>
              {child.name}&rsquo;s quests{' '}
              <span className="league-inline">
                <LeagueBadge rank={league.rank} size={30} /> {leagueTitle(league.rank)}
              </span>
            </h3>
            <ul className="claim-list">
              {questsFor(child.id).map((quest) => {
                const status = todayStatuses.find((t) => t.questId === quest.id)
                return (
                  <li key={quest.id} className="claim-row">
                    <div className="claim-info">
                      <img src={assetUrl(quest.iconKey)} alt="" className="quest-icon-small" />
                      <span>{quest.label}</span>
                    </div>
                    <div className="claim-actions">
                      {status?.status === 'available' && (
                        <button
                          className="btn btn-yes"
                          onClick={() =>
                            void repo.dispatch({
                              type: 'parentCompleteAndApprove',
                              childId: child.id,
                              questId: quest.id,
                              claimId: `parent:${child.id}:${quest.id}:${today}`,
                            })
                          }
                        >
                          Done &amp; approve
                        </button>
                      )}
                      {status?.status === 'pending' && <span className="tag tag-waiting">Waiting</span>}
                      {status?.status === 'done' && (
                        <span className="tag tag-done">
                          <img src={assetUrl('star')} alt="" className="tag-star" /> Done
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <button className="btn btn-ghost" onClick={onExit}>
        Done — back to explorers
      </button>
    </div>
  )
}
