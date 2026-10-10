import { useEffect, useRef, useState } from 'react'
import {
  projectView,
  todayQuestsFor,
  unacknowledgedRepairs,
  weeklyView,
} from '../../domain/selectors'
import { localDateKey, mondayKeyOf } from '../../domain/week'
import { weeklyTemplateById } from '../../data/weekly'
import type { ChildId, ProjectId } from '../../domain/types'
import { CHILDREN } from '../../data/children'
import { itemById } from '../../data/catalogue'
import { KIT_PRICE, PROJECTS, projectById } from '../../data/city'
import { questById, type QuestDef } from '../../data/quests'
import { QuestCard } from '../components/QuestCard'
import { ReadingSheet } from '../components/ReadingSheet'
import { assetUrl } from '../../game/assets'
import { EventBus } from '../../game/EventBus'
import { PhaserGame } from '../../game/PhaserGame'
import { useGameState, useRepository, useRepoStatus } from '../../storage/hooks'
import { ChallengeModal } from '../challenges/ChallengeModal'
import { Celebration, type CelebrationData } from '../components/Celebration'
import { ReadingJournal } from '../components/ReadingJournal'
import { PromotionOverlay } from '../components/PromotionOverlay'
import { PlayView } from '../play/PlayView'
import { PostcardAlbum } from '../components/Postcard'
import { CustomizeSheet, NameCitySheet } from '../components/Personalize'

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
  | { kind: 'reading' }
  | { kind: 'housework' }
  | { kind: 'journal' }
  | { kind: 'challenge'; quest: QuestDef }
  | { kind: 'play'; projectId: ProjectId }
  | { kind: 'customize'; projectId: ProjectId }
  | { kind: 'name-city' }
  | { kind: 'album' }

export function ChildHome({ childId }: { childId: ChildId }) {
  const state = useGameState()
  const repo = useRepository()
  const repoStatus = useRepoStatus()
  const offline = repoStatus === 'offline'
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const [sceneReady, setSceneReady] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationData | null>(null)
  const [opening, setOpening] = useState<ProjectId | null>(null)
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 640
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const sheetRef = useRef<Sheet | null>(null)
  useEffect(() => {
    sheetRef.current = sheet
  }, [sheet])
  // Defer closes slightly so the closing gesture's pointerup can't click-through
  // to the town canvas underneath (would open a plot sheet).
  const closeSheet = () => {
    const current = sheetRef.current
    setTimeout(() => setSheet((s) => (s === current ? null : s)), 140)
  }
  const [busy, setBusy] = useState(false)
  const prev = useRef<{ childId: ChildId; coins: number; stars: number } | null>(null)
  const prevBadges = useRef<number | null>(null)
  const [badgeCelebration, setBadgeCelebration] = useState<string | null>(null)
  const prevOpenings = useRef<Set<string> | null>(null)

  const city = state.city
  const today = todayQuestsFor(state, childId, new Date())

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

  // A freshly-earned weekly badge gets a small celebration.
  useEffect(() => {
    const n = state.badges.filter((b) => b.childId === childId).length
    if (prevBadges.current === null) {
      prevBadges.current = n
      return
    }
    if (n > prevBadges.current) {
      const badge = state.badges.filter((b) => b.childId === childId).at(-1)
      setBadgeCelebration(badge ? (weeklyTemplateById(badge.templateId)?.title ?? 'Weekly challenge') : 'Weekly challenge')
    }
    prevBadges.current = n
  }, [state.badges, childId])

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
      cityName: city.name ?? null,
      looks: Object.fromEntries(
        PROJECTS.map((p) => [
          p.id,
          { color: city.projects[p.id].color ?? null, name: city.projects[p.id].name ?? null },
        ]),
      ) as Record<ProjectId, { color: string | null; name: string | null }>,
    })
  }, [state, sceneReady, city])

  // Taps inside the scene bubble up as info sheets.
  useEffect(() => {
    const onTap = (e: { kind: string; projectId?: ProjectId; planks?: number }) => {
      // Phaser listens at window level — a tap on a sheet above the canvas still
      // reaches the scene. Ignore scene taps while any sheet/overlay is open.
      if (sheetRef.current) return
      if (e.kind === 'plot' && e.projectId) setSheet({ kind: 'plot', projectId: e.projectId })
      if (e.kind === 'bridge' && e.planks) setSheet({ kind: 'bridge', planks: e.planks })
      if (e.kind === 'truck') EventBus.emit('town-ride', childId)
    }
    EventBus.on('town-tap', onTap)
    return () => {
      EventBus.off('town-tap', onTap)
    }
  }, [childId])

  const wish = child.wishItem ? itemById(child.wishItem) : undefined
  const weekKey = mondayKeyOf(localDateKey(new Date(), state.timeZone))
  const weekly = weeklyView(state, childId, weekKey)
  const badgeForWeek = state.badges.find((b) => b.childId === childId && b.weekKey === weekKey)
  const weeklyTemplate = weekly ? weeklyTemplateById(weekly.templateId) : undefined
  const pendingRepair = unacknowledgedRepairs(state, childId)[0]
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
      closeSheet()
    } finally {
      setBusy(false)
    }
  }

  const sheetProject = sheet?.kind === 'plot' ? projectById(sheet.projectId) : undefined
  const sheetView = sheet?.kind === 'plot' ? projectView(state, sheet.projectId) : undefined

  return (
    <div className="screen home-screen" style={{ ['--accent' as string]: def.color }}>
      {offline && <p className="offline-banner">Waiting for internet…</p>}
      <div className="home-main">
        <div className="island-wrap">
          <PhaserGame scene="town" onSceneReady={setSceneReady} />
          <button className="town-name-tag" onClick={() => setSheet({ kind: 'name-city' })}>
            {city.name ? `🏡 ${city.name}` : '🏡 Name our town'}
          </button>
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
                disabled={!canAffordKit || busy || offline}
                onClick={() => setSheet({ kind: 'buy-kit' })}
              >
                {canAffordKit ? (
                  <>
                    Add a kit <img src={assetUrl('coin')} alt="" className="btn-coin" /> {KIT_PRICE}
                  </>
                ) : (
                  `Need ${KIT_PRICE - child.coins} more coin${KIT_PRICE - child.coins === 1 ? '' : 's'}`
                )}
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

          {pendingRepair && (
            <article className="quest-card repair-card" data-testid="repair-ack">
              <p className="quest-label">Thanks for making it right, {CHILDREN[childId].name}!</p>
              <button
                className="btn btn-yes"
                onClick={() => void repo.dispatch({ type: 'acknowledgeRepair', incidentId: pendingRepair.id })}
              >
                Okay!
              </button>
            </article>
          )}

          {weekly && weeklyTemplate && (
            <article className="quest-card weekly-card" data-testid="weekly-card">
              <div className="quest-text">
                <p className="quest-label">This week: {weekly.title}</p>
                <p className="quest-sub">
                  {weekly.completedAt
                    ? `Done! +20 coins — badge earned!`
                    : `${'●'.repeat(weekly.done)}${'○'.repeat(weekly.days - weekly.done)} ${weekly.done} of ${weekly.days} days`}
                </p>
              </div>
              <span className="weekly-badge" aria-hidden="true">
                {badgeForWeek ? '🏅' : '✨'}
              </span>
            </article>
          )}

          <section className="quest-panel" aria-label="Today's quests">
            {today.restDay ? (
              <article className="quest-card rest-card">
                <p className="quest-label">Rest day — enjoy!</p>
              </article>
            ) : (
              <>
                {today.core.map((t) => {
                  const quest = questById(t.questId)
                  if (!quest) return null
                  return (
                    <QuestCard
                      key={quest.id}
                      quest={quest}
                      status={t.status}
                      childId={childId}
                      offline={offline}
                      openSheet={setSheet}
                      claimQuest={(details) =>
                        void repo.dispatch({
                          type: 'claimQuest',
                          childId,
                          questId: quest.id,
                          claimId: crypto.randomUUID(),
                          details,
                        })
                      }
                      subtitle={
                        quest.id === 'violin'
                          ? state.config[childId].violinGoal
                          : quest.kind.type === 'external' && quest.kind.buttonLabel
                            ? undefined
                            : undefined
                      }
                    />
                  )
                })}

                {today.bonus.length > 0 && (
                  <details className="bonus-fold" open={!isSmallScreen}>
                    <summary className="bonus-head">
                      <span className="bonus-title">Bonus</span>
                      <span className="bonus-pips" aria-label={`${today.bonusSlotsLeft} bonus coins left today`}>
                        {today.bonusSlotsLeft > 0
                          ? `Bonus coins left today: ${'●'.repeat(today.bonusSlotsLeft)}${'○'.repeat(2 - today.bonusSlotsLeft)}`
                          : 'Bonus coins are full today — amazing effort!'}
                      </span>
                    </summary>
                    {today.bonus.map((t) => {
                      const quest = questById(t.questId)
                      if (!quest) return null
                      return (
                        <QuestCard
                          key={quest.id}
                          quest={quest}
                          status={t.status}
                          childId={childId}
                          offline={offline}
                          openSheet={setSheet}
                          claimQuest={(details) =>
                            void repo.dispatch({
                              type: 'claimQuest',
                              childId,
                              questId: quest.id,
                              claimId: crypto.randomUUID(),
                              details,
                            })
                          }
                        />
                      )
                    })}
                  </details>
                )}

                {(today.readingClaims.length > 0 ||
                  today.core.some((t) => t.questId === 'reading')) && (
                  <button className="btn btn-neutral journal-btn" onClick={() => setSheet({ kind: 'journal' })}>
                    My reading journal
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {/* bottom sheets */}
      {sheet?.kind === 'buy-kit' && current && (
        <div className="sheet-backdrop" onClick={closeSheet}>
          <div className="sheet" role="dialog" aria-label="Buy a building kit" onClick={(e) => e.stopPropagation()}>
            <img src={assetUrl('kit-box')} alt="" className="sheet-icon" />
            <p className="sheet-title">Add one kit to the {current.label} for {KIT_PRICE} coins?</p>
            <div className="sheet-actions">
              <button className="btn btn-yes" onClick={() => void buyKit()} disabled={busy}>
                {busy ? 'Adding…' : 'Yes, add it!'}
              </button>
              <button className="btn btn-neutral" onClick={closeSheet}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet?.kind === 'plot' && sheetProject && sheetView && (
        <div className="sheet-backdrop" onClick={closeSheet}>
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
            {sheetView.status === 'open' && sheet.projectId === 'road' && (
              <button
                className="btn btn-yes"
                onClick={() => {
                  EventBus.emit('town-ride', childId)
                  closeSheet()
                }}
              >
                Ride along!
              </button>
            )}
            {sheetView.status === 'open' && sheet.projectId !== 'road' && (
              <button
                className="btn btn-yes"
                onClick={() => setSheet({ kind: 'play', projectId: sheet.projectId })}
              >
                Play!
              </button>
            )}
            {sheetView.status === 'open' && (
              <button
                className="btn"
                onClick={() => setSheet({ kind: 'customize', projectId: sheet.projectId })}
              >
                Change colors
              </button>
            )}
            {sheetView.status === 'locked' && city.currentProjectId === null && (
              <button
                className="btn"
                onClick={() => {
                  void repo.dispatch({ type: 'suggestProject', childId, projectId: sheetProject.id })
                  closeSheet()
                }}
              >
                Suggest this
              </button>
            )}
            <button className="btn btn-neutral" onClick={closeSheet}>
              Close
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === 'bridge' && (
        <div className="sheet-backdrop" onClick={closeSheet}>
          <div className="sheet" role="dialog" aria-label="Founders' Bridge" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Founders&rsquo; Bridge</p>
            <p className="muted">
              {sheet.planks} planks laid by Theodore &amp; Leonard on the old island.
            </p>
            <button className="btn btn-neutral" onClick={closeSheet}>
              Close
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === 'reading' && (
        <div className="sheet-backdrop" onClick={closeSheet}>
          <ReadingSheet
            onDone={(details) => {
              void repo.dispatch({
                type: 'claimQuest',
                childId,
                questId: 'reading',
                claimId: crypto.randomUUID(),
                details,
              })
              closeSheet()
            }}
          />
        </div>
      )}

      {sheet?.kind === 'housework' && (
        <div className="sheet-backdrop" onClick={closeSheet}>
          <div className="sheet" role="dialog" aria-label="Choose the job" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Which job did you do?</p>
            <div className="sheet-actions">
              {state.config[childId].houseworkJobs.map((job) => (
                <button
                  key={job}
                  className="btn btn-neutral"
                  onClick={() => {
                    void repo.dispatch({
                      type: 'claimQuest',
                      childId,
                      questId: 'housework',
                      claimId: crypto.randomUUID(),
                      details: { kind: 'housework', job },
                    })
                    closeSheet()
                  }}
                >
                  {job}
                </button>
              ))}
              <button className="btn btn-ghost" onClick={closeSheet}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet?.kind === 'customize' && sheet && (
        <CustomizeSheet
          state={state}
          projectId={sheet.projectId}
          onDone={(color, name) => {
            void repo.dispatch({
              type: 'customizeBuilding',
              childId,
              projectId: sheet.projectId,
              color,
              name,
            })
            closeSheet()
          }}
        />
      )}

      {sheet?.kind === 'album' && (
        <div className="sheet-backdrop" onClick={closeSheet}>
          <div className="sheet" role="dialog" aria-label="Postcard album" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Our postcards</p>
            <PostcardAlbum state={state} />
            <button className="btn btn-neutral" onClick={closeSheet}>
              Close
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === 'name-city' && (
        <NameCitySheet
          current={city.name ?? null}
          onDone={(name) => {
            void repo.dispatch({ type: 'nameCity', childId, name })
            closeSheet()
          }}
          onCancel={closeSheet}
        />
      )}

      {sheet?.kind === 'play' && (
        <PlayView projectId={sheet.projectId} state={state} childId={childId} onClose={closeSheet} />
      )}

      {sheet?.kind === 'journal' && (
        <div className="sheet-backdrop" onClick={closeSheet}>
          <div className="sheet journal-sheet" role="dialog" aria-label="Reading journal" onClick={(e) => e.stopPropagation()}>
            <ReadingJournal state={state} childId={childId} />
            <button className="btn btn-neutral" onClick={closeSheet}>
              Close
            </button>
          </div>
        </div>
      )}

      {sheet?.kind === 'challenge' && (
        <ChallengeModal
          childId={childId}
          questId={sheet.quest.id}
          level={state.config[childId].mathLevel}
          runIndex={
            today.restDay
              ? 0
              : Object.values(state.claims).filter(
                  (c) =>
                    c.childId === childId &&
                    c.questId === sheet.quest.id &&
                    c.activityDate === new Date().toISOString().slice(0, 10),
                ).length
          }
          today={new Date().toISOString().slice(0, 10)}
          replay={
            !today.restDay &&
            [...today.core, ...today.bonus].some(
              (t) => t.questId === sheet.quest.id && t.status !== 'available',
            )
          }
          onClose={closeSheet}
        />
      )}

      {/* weekly badge celebration */}
      {badgeCelebration && (
        <div className="celebration" role="dialog" aria-label="Weekly challenge complete!">
          <div className="celebration-card">
            <p className="celebration-text">🏅 {badgeCelebration} — done!</p>
            <p className="celebration-sub">+20 coins and a new badge!</p>
            <button className="btn btn-yes" onClick={() => setBadgeCelebration(null)}>
              Hooray!
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
              className="btn btn-yes"
              onClick={() => {
                if (opening) {
                  markOpeningSeen(`${opening}:${city.projects[opening].openedAt}`)
                  setOpening(null)
                  setSheet({ kind: 'customize', projectId: opening })
                }
              }}
            >
              Make it yours
            </button>
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

