import { useCallback, useEffect, useState } from 'react'
import { localDateKey } from '../../domain/week'
import { pendingClaims, todayQuestsFor } from '../../domain/selectors'
import { rewardForApproval } from '../../domain/commands'
import type { Claim } from '../../domain/types'
import { CHILD_LIST } from '../../data/children'
import { questById } from '../../data/quests'
import { ScheduleEditor } from '../components/ScheduleEditor'
import { RepairsPanel } from '../components/RepairsPanel'
import { assetUrl } from '../../game/assets'
import { useGameState, useRepository } from '../../storage/hooks'
import { LeagueBadge } from '../components/LeagueBadge'
import { leagueTitle } from '../../data/leagues'
import { PROJECTS, projectById } from '../../data/city'

type PinStage = 'set' | 'confirm' | 'enter'

export function Grownups({ onExit }: { onExit: () => void }) {
  const state = useGameState()
  const repo = useRepository()
  const gate = repo.gate
  const [unlockedPin, setUnlockedPin] = useState<string | null>(null)
  const [stage, setStage] = useState<{ ready: boolean; stage: PinStage }>({ ready: false, stage: 'set' })
  const [firstPin, setFirstPin] = useState('')
  const [entry, setEntry] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    void gate.hasPin().then((has) => {
      if (live) setStage({ ready: true, stage: has ? 'enter' : 'set' })
    })
    return () => {
      live = false
    }
  }, [gate])

  const pinStage = stage.stage
  const unlocked = unlockedPin !== null

  const submitPin = async (pin: string) => {
    setError('')
    if (pinStage === 'set') {
      setFirstPin(pin)
      setStage({ ready: true, stage: 'confirm' })
      setEntry('')
      return
    }
    if (pinStage === 'confirm') {
      if (pin !== firstPin) {
        setError('Those PINs did not match — try again.')
        setStage({ ready: true, stage: 'set' })
        setFirstPin('')
        setEntry('')
        return
      }
      await gate.setPin(pin)
      setUnlockedPin(pin)
      return
    }
    const result = await gate.verify(pin)
    if (result === 'ok') {
      setUnlockedPin(pin)
    } else if (result === 'locked') {
      setError('Too many tries — take a little break and come back soon.')
      setEntry('')
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
    if (!stage.ready) return <div className="screen grownups-screen" />
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
          Back to the explorers
        </button>
      </div>
    )
  }

  const pending = pendingClaims(state)
  const today = localDateKey(new Date(), state.timeZone)

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
                  <span className={`tag role-tag role-${claim.role}`}>
                    {claim.role === 'core' ? 'Core' : 'Bonus'}
                  </span>
                  {claim.details && <span className="muted">{detailText(claim)}</span>}
                  <span className="muted">
                    {claim.activityDate}
                    {' → '}
                    {(() => {
                      const r = rewardForApproval(state, claim)
                      return r.coins > 0 || r.stars > 0
                        ? `${r.coins > 0 ? `+${r.coins} coins` : ''}${r.stars > 0 ? ' +1 star' : ''}`
                        : 'recorded (0 coins)'
                    })()}
                  </span>
                </div>
                <div className="claim-actions">
                  <button
                    className="btn btn-yes"
                    onClick={() => void repo.dispatch({ type: 'approveClaim', claimId: claim.id }, { pin: unlockedPin ?? undefined })}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => void repo.dispatch({ type: 'rejectClaim', claimId: claim.id }, { pin: unlockedPin ?? undefined })}
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
                    onClick={() => void repo.dispatch({ type: 'chooseNextProject', projectId: p.id }, { pin: unlockedPin ?? undefined })}
                  >
                    Build this next
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {repo.devices && (
        <section className="panel" aria-label="Devices">
          <h3>Devices</h3>
          <DevicesSection devices={repo.devices} />
        </section>
      )}

      <section className="panel settings-panel">
        <h3>Settings</h3>
        <button
          className="btn btn-neutral"
          onClick={() => {
            setUnlockedPin(null)
            setStage({ ready: true, stage: 'set' })
            setFirstPin('')
            setEntry('')
          }}
        >
          Change PIN
        </button>
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
        const todayView = todayQuestsFor(state, child.id, new Date())
        const league = state.children[child.id].league
        return (
          <section key={child.id} className="panel">
            <h3 style={{ color: child.darkColor }}>
              {child.name}&rsquo;s quests{' '}
              <span className="league-inline">
                <LeagueBadge rank={league.rank} size={30} /> {leagueTitle(league.rank)}
              </span>
            </h3>
            {todayView.restDay ? (
              <p className="muted">Rest day today.</p>
            ) : (
              <ul className="claim-list">
                {[...todayView.core, ...todayView.bonus].map((t) => {
                  const quest = questById(t.questId)
                  if (!quest) return null
                  const isCore = todayView.core.some((c) => c.questId === t.questId)
                  return (
                    <li key={quest.id} className="claim-row">
                      <div className="claim-info">
                        <img src={assetUrl(quest.iconKey)} alt="" className="quest-icon-small" />
                        <span>
                          {quest.label}
                          {quest.id === 'violin' && state.config[child.id].violinGoal && (
                            <span className="muted"> — {state.config[child.id].violinGoal}</span>
                          )}
                        </span>
                        <span className={`tag role-tag role-${isCore ? 'core' : 'bonus'}`}>
                          {isCore ? 'Core' : 'Bonus'}
                        </span>
                      </div>
                      <div className="claim-actions">
                        {t.status === 'available' && (
                          <button
                            className="btn btn-yes"
                            onClick={() =>
                              void repo.dispatch(
                                {
                                  type: 'parentCompleteAndApprove',
                                  childId: child.id,
                                  questId: quest.id,
                                  claimId: `parent:${child.id}:${quest.id}:${today}`,
                                },
                                { pin: unlockedPin ?? undefined },
                              )
                            }
                          >
                            Done &amp; approve
                          </button>
                        )}
                        {t.status === 'pending' && <span className="tag tag-waiting">Waiting</span>}
                        {t.status === 'done' && (
                          <span className="tag tag-done">
                            <img src={assetUrl('star')} alt="" className="tag-star" /> Done
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <details className="schedule-disclosure">
              <summary>Schedule &amp; settings</summary>
              <ScheduleEditor childId={child.id} pin={unlockedPin} />
            </details>
          </section>
        )
      })}

      <RepairsPanel pin={unlockedPin} />

      <button className="btn btn-ghost" onClick={onExit}>
        Done — back to explorers
      </button>
    </div>
  )
}


interface DeviceApis {
  list(): Promise<{ userId: string; role: string; label: string | null }[]>
  createPairingCode(): Promise<{ code: string; expiresAt: string }>
  remove(userId: string): Promise<void>
}

function DevicesSection({ devices }: { devices: DeviceApis }) {
  const [members, setMembers] = useState<{ userId: string; role: string; label: string | null }[] | null>(null)
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [secsLeft, setSecsLeft] = useState(0)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    devices
      .list()
      .then(setMembers)
      .catch(() => setError('Could not load devices.'))
  }, [devices])

  useEffect(refresh, [refresh])

  useEffect(() => {
    if (!code) return
    const tick = () => setSecsLeft(Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [code])

  const addDevice = async () => {
    try {
      setCode(await devices.createPairingCode())
    } catch {
      setError('Could not make a code — try again.')
    }
  }

  return (
    <>
      <ul className="claim-list">
        {(members ?? []).map((m) => (
          <li key={m.userId} className="claim-row">
            <div className="claim-info">
              <span>
                {m.role === 'grown_up' ? 'Grown-up phone' : (m.label ?? 'Kids device')}
                {m.role === 'grown_up' && <span className="tag">Grown-up</span>}
              </span>
            </div>
            {m.role !== 'grown_up' && (
              <div className="claim-actions">
                <button
                  className="btn btn-neutral"
                  onClick={() => void devices.remove(m.userId).then(refresh).catch(() => setError('Could not remove.'))}
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="form-error">{error}</p>}
      {code ? (
        <div className="pairing-code">
          <p className="muted">On the kids’ device, tap “This is a kids’ device” and enter:</p>
          <p className="pairing-digits">{code.code}</p>
          <p className="muted">{secsLeft > 0 ? `Good for ${Math.ceil(secsLeft / 60)} more min` : 'Expired — make a new one'}</p>
          <button className="btn btn-neutral" onClick={() => { setCode(null); refresh() }}>
            Done
          </button>
        </div>
      ) : (
        <button className="btn" onClick={() => void addDevice()}>
          Add a device
        </button>
      )}
    </>
  )
}

/** Short human summary of claim details for the approvals list. */
function detailText(claim: Claim): string {
  const d = claim.details
  if (!d) return ''
  if (d.kind === 'reading') {
    return `${d.unit === 'book' ? 'Book' : 'Chapter'}${d.title ? ` “${d.title}”` : ''}${d.withGrownUp ? ' · with a grown-up' : ''}`
  }
  if (d.kind === 'challenge') {
    return `${d.correctFirstTry} first-try · ${d.hintsUsed} hint${d.hintsUsed === 1 ? '' : 's'}`
  }
  if (d.kind === 'housework') return d.job
  return ''
}
