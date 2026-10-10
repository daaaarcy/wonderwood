import { useEffect, useRef, useState } from 'react'
import { projectView, todayQuestsFor } from '../../domain/selectors'
import type { ChildId, ProjectId } from '../../domain/types'
import { CHILDREN } from '../../data/children'
import { itemById } from '../../data/catalogue'
import { KIT_PRICE, PROJECTS, projectById } from '../../data/city'
import { questsFor } from '../../data/quests'
import { assetUrl } from '../../game/assets'
import { EventBus } from '../../game/EventBus'
import { PhaserGame } from '../../game/PhaserGame'
import { useGameState, useRepository } from '../../storage/hooks'
import { Celebration, type CelebrationData } from '../components/Celebration'
import { PromotionOverlay } from '../components/PromotionOverlay'

function speak(text: string) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }
}

/** Per-device record of building openings already celebrated. */
const OPENINGS_KEY = 'wonderwood:seen-openings'

function seenOpenings(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OPENINGS_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function markOpeningSeen(key: string) {
  try {
    const seen = seenOpenings()
    if (!seen.includes(key)) {
      localStorage.setItem(OPENINGS_KEY, JSON.stringify([...seen, key]))
    }
  } catch {
    // private mode etc — harmless
  }
}

type Sheet =
  | { kind: 'plot'; projectId: ProjectId }
  | { kind: 'bridge'; planks: number }
  | { kind: 'buy-kit' }

export function ChildHome({ childId }: { childId: ChildId }) {
  const state = useGameState()
  const repo = useRepository()
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const [sceneReady, setSceneReady] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationData | null>(null)
  const [opening, setOpening] = useState<ProjectId | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [busy, setBusy] = useState(false)
  const prev = useRef<{ childId: ChildId; coins: number; stars: number } | null>(null)
  const prevOpenings = useRef<Set<string> | null>(null)

  const city = state.city
  const quests = questsFor(childId)
  const today = todayQuestsFor(
    state,
    childId,
    quests.map((q) => q.id),
    new Date(),
  )

  // League weeks end Sunday night — evaluate any that closed since last visit.
  useEffect(() => {
    void repo.dispatch({ type: 'evaluateLeagues' })
  }, [repo])

  // Celebrate when this child's coins/stars grow while the home screen is open.
  useEffect(() => {
    const c = state.children[childId]
    if (!prev.current || prev.current.childId !== childId) {
      prev.current = { childId, coins: c.coins, stars: c.stars }
      return
    }
    const dCoins = c.coins - prev.current.coins
    const dStars = c.stars - prev.current.stars
    prev.current = { childId, coins: c.coins, stars: c.stars }
    if (dCoins > 0 || dStars > 0) {
      setCelebration({ coins: Math.max(0, dCoins), stars: Math.max(0, dStars) })
    }
  }, [state, childId])

  // A building that just opened (and hasn't been celebrated on this device)
  // gets the big opening-day moment.
  useEffect(() => {
    if (prevOpenings.current === null) {
      // first paint: only celebrate transitions from now on
      prevOpenings.current = new Set(
        PROJECTS.map((p) => {
          const o = city.projects[p.id].openedAt
          return o ? `${p.id}:${o}` : ''
        }).filter(Boolean),
      )
      return
    }
    for (const p of PROJECTS) {
      const o = city.projects[p.id].openedAt
      if (!o) continue
      const key = `${p.id}:${o}`
      if (!prevOpenings.current.has(key) && !seenOpenings().includes(key)) {
        prevOpenings.current.add(key)
        setOpening(p.id)
      } else {
        prevOpenings.current.add(key)
      }
    }
  }, [city])

  // Push world state into the town scene once it is listening.
  useEffect(() => {
    if (!sceneReady) return
    EventBus.emit('town-state', {
      projects: Object.fromEntries(
        PROJECTS.map((p) => [p.id, { kits: city.projects[p.id].kits, status: city.projects[p.id].status }]),
      ),
      currentProjectId: city.currentProjectId,
      suggestedProjectId: city.suggestedProjectId,
      hats: {
        theodore: state.children.theodore.equipped.hat,
        leonard: state.children.leonard.equipped.hat,
      },
      foundersPlanks: city.foundersBridgePlanks,
    })
  }, [state, sceneReady, city])

  // Taps inside the scene bubble up as info sheets.
  useEffect(() => {
    const onTap = (e: { kind: string; projectId?: ProjectId; planks?: number }) => {
      if (e.kind === 'plot' && e.projectId) setSheet({ kind: 'plot', projectId: e.projectId })
      if (e.kind === 'bridge' && e.planks) setSheet({ kind: 'bridge', planks: e.planks })
    }
    EventBus.on('town-tap', onTap)
    return () => {
      EventBus.off('town-tap', onTap)
    }
  }, [])

  const wish = child.wishItem ? itemById(child.wishItem) : undefined
  const promotion = child.league.unseenPromotion
  const current = city.currentProjectId ? projectById(city.currentProjectId) : undefined
  const currentView = city.currentProjectId ? projectView(state, city.currentProjectId) : undefined
  const suggested = city.suggestedProjectId ? projectById(city.suggestedProjectId) : undefined
  const canAffordKit = child.coins >= KIT_PRICE

  const buyKit = async () => {
    if (!city.currentProjectId || busy) return
    setBusy(true)
    try {
      await repo.dispatch({
        type: 'buyKit',
        childId,
        projectId: city.currentProjectId,
        kitPurchaseId: crypto.randomUUID(),
      })
      setSheet(null)
    } finally {
      setBusy(false)
    }
  }

  const sheetProject = sheet?.kind === 'plot' ? projectById(sheet.projectId) : undefined
  const sheetView = sheet?.kind === 'plot' ? projectView(state, sheet.projectId) : undefined

  return (
    <div className="screen home-screen" style={{ ['--accent' as string]: def.color }}>
      <div className="home-main">
        <div className="island-wrap">
          <PhaserGame scene="town" onSceneReady={setSceneReady} />
        </div>

        <div className="home-side">
          {/* hidden status for tests */}
          {PROJECTS.map((p) => (
            <p key={p.id} className="sr-only" data-testid={`project-${p.id}`}>
              {p.label}: {city.projects[p.id].status === 'open' ? 'open' : `${city.projects[p.id].kits} of ${p.kits} kits`}
            </p>
          ))}
          <p className="sr-only" data-testid="founders-bridge">
            {city.foundersBridgePlanks > 0
              ? `Founders' Bridge: ${city.foundersBridgePlanks} planks`
              : 'no founders bridge'}
          </p>

          {/* project card */}
          {current && currentView ? (
            <section className="panel project-card" aria-label="Current building project">
              <div className="project-head">
                <span className="project-node" style={{ background: current.color }}>
                  <img src={assetUrl(current.iconKey)} alt="" className="quest-icon" />
                </span>
                <div>
                  <h3 className="project-name">Our {current.label}</h3>
                  <p className="muted">
                    Building supplies: {currentView.kits} of {currentView.required} kits
                  </p>
                </div>
              </div>
              <div className="kit-pips" aria-hidden="true">
                {Array.from({ length: currentView.required }, (_, i) => (
                  <img
                    key={i}
                    src={assetUrl('kit-box')}
                    alt=""
                    className={i < currentView.kits ? 'kit-pip filled' : 'kit-pip'}
                  />
                ))}
              </div>
              <button
                className="btn btn-big btn-yes"
                disabled={!canAffordKit || busy}
                onClick={() => setSheet({ kind: 'buy-kit' })}
              >
                {canAffordKit
                  ? `Buy & add one kit — ${KIT_PRICE} coins`
                  : `Need ${KIT_PRICE - child.coins} more coin${KIT_PRICE - child.coins === 1 ? '' : 's'}`}
              </button>
            </section>
          ) : (
            <section className="panel project-card" aria-label="Next building project">
              <h3 className="project-name">Pick the next building with a grown-up</h3>
              <p className="muted">
                {suggested
                  ? `${CHILDREN[childId].name} suggested the ${suggested.label} — a grown-up can say yes.`
                  : 'Tap a ? plot in town to suggest one!'}
              </p>
            </section>
          )}

          {wish && (
            <div className="wish-bar">
              <img src={assetUrl(wish.assetKey)} alt="" className="wish-icon" />
              <div className="wish-info">
                <span>Saving for {wish.name}</span>
                <div className="wish-track">
                  <div
                    className="wish-fill"
                    style={{ width: `${Math.min(100, (child.coins / Math.max(1, wish.price)) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="wish-count">
                {child.coins}/{wish.price}
              </span>
            </div>
          )}

          <section className="quest-panel" aria-label="Today's quests">
            {quests.map((quest) => {
              const status = today.find((t) => t.questId === quest.id)
              return (
                <article key={quest.id} className={`quest-card quest-${status?.status ?? 'available'}`}>
                  <span className={`quest-node node-${status?.status ?? 'available'}`}>
                    <img src={assetUrl(quest.iconKey)} alt="" className="quest-icon" />
                    {status?.status === 'pending' && (
                      <svg className="node-mark" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="3" />
                        <path d="M12 7 v5 l3.5 2" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    )}
                    {status?.status === 'done' && (
                      <svg className="node-mark" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 13 l4.5 4.5 L19 7" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <p className="quest-label">{quest.label}</p>
                  <button
                    className="icon-btn speak-btn"
                    aria-label={`Hear the quest: ${quest.label}`}
                    onClick={() => speak(quest.label)}
                  >
                    <SpeakerIcon />
                  </button>
                  {status?.status === 'available' && (
                    <button
                      className="btn btn-big btn-yes"
                      onClick={() =>
                        // Fresh id per tap; double-tap safety lives in the domain's
                        // one-active-claim-per-quest-per-day rule.
                        void repo.dispatch({
                          type: 'claimQuest',
                          childId,
                          questId: quest.id,
                          claimId: crypto.randomUUID(),
                        })
                      }
                    >
                      I did it!
                    </button>
                  )}
                  {status?.status === 'pending' && (
                    <span className="quest-status">Waiting for a grown-up…</span>
                  )}
                  {status?.status === 'done' && (
                    <span className="quest-status quest-done">
                      <img src={assetUrl('star')} alt="" /> Done!
                    </span>
                  )}
                </article>
              )
            })}
          </section>
        </div>
      </div>

      {/* bottom sheets */}
      {sheet?.kind === 'buy-kit' && current && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Buy a building kit" onClick={(e) => e.stopPropagation()}>
            <img src={assetUrl('kit-box')} alt="" className="sheet-icon" />
            <p className="sheet-title">Add one kit to the {current.label} for {KIT_PRICE} coins?</p>
            <div className="sheet-actions">
              <button className="btn btn-yes" onClick={() => void buyKit()} disabled={busy}>
                {busy ? 'Adding…' : 'Yes, add it!'}
              </button>
              <button className="btn btn-neutral" onClick={() => setSheet(null)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet?.kind === 'plot' && sheetProject && sheetView && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div
            className="sheet"
            role="dialog"
            aria-label={sheetProject.name}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="project-node" style={{ background: sheetProject.color }}>
              <img src={assetUrl(sheetProject.iconKey)} alt="" className="quest-icon" />
            </span>
            <p className="sheet-title">{sheetProject.name}</p>
            <p className="muted">
              {sheetView.status === 'open'
                ? 'It\u2019s open — hooray!'
                : sheetView.status === 'building'
                  ? `${sheetView.kits} of ${sheetView.required} kits so far`
                  : `Needs ${sheetView.required} kits to build`}
            </p>
            {sheetView.status === 'locked' && city.currentProjectId === null && (
              <button
                className="btn"
                onClick={() => {
                  void repo.dispatch({ type: 'suggestProject', childId, projectId: sheetProject.id })
                  setSheet(null)
                }}
              >
                Suggest this
              </button>
            )}
            <button className="btn btn-neutral" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === 'bridge' && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Founders' Bridge" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Founders&rsquo; Bridge</p>
            <p className="muted">
              {sheet.planks} planks laid by Theodore &amp; Leonard on the old island.
            </p>
            <button className="btn btn-neutral" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* opening-day celebration */}
      {opening && (
        <div className="celebration" role="dialog" aria-label="A building opened!">
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 26 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 37) % 100}%`,
                  width: 12,
                  height: 12 + (i % 3) * 4,
                  background: ['#58cc02', '#1cb0f6', '#ffc800', '#ff9600', '#ce82ff'][i % 5],
                  animationDelay: `${(i % 8) * 0.14}s`,
                  ['--drift' as string]: `${(i % 5 - 2) * 40}px`,
                }}
              />
            ))}
          </div>
          <div className="celebration-card">
            <div className="opening-explorers">
              <img className="celebration-cheer" src={assetUrl('explorer-theodore-cheer')} alt="" />
              <img className="celebration-cheer cheer-right" src={assetUrl('explorer-leonard-cheer')} alt="" />
            </div>
            <p className="celebration-text">The {projectById(opening)?.label} is open!</p>
            <p className="celebration-sub">The whole town says thank you!</p>
            <button
              className="btn btn-big btn-yes"
              onClick={() => {
                const o = city.projects[opening].openedAt
                if (o) markOpeningSeen(`${opening}:${o}`)
                setOpening(null)
              }}
            >
              Hooray!
            </button>
          </div>
        </div>
      )}

      {promotion && (
        <PromotionOverlay
          childId={childId}
          from={promotion.from}
          to={promotion.to}
          soundOn={state.settings.sound}
          onDone={() => void repo.dispatch({ type: 'acknowledgePromotion', childId })}
        />
      )}

      {celebration && !promotion && (
        <Celebration childId={childId} data={celebration} onDone={() => setCelebration(null)} />
      )}
    </div>
  )
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M4 9 v6 h4 l6 5 V4 L8 9 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M17 8 q3 4 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
