import { useEffect, useRef, useState } from 'react'
import { islandProgress, todayQuestsFor } from '../../domain/selectors'
import type { ChildId } from '../../domain/types'
import { CHILDREN } from '../../data/children'
import { itemById } from '../../data/catalogue'
import { CHAPTER_ONE } from '../../data/island'
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

export function ChildHome({ childId }: { childId: ChildId }) {
  const state = useGameState()
  const repo = useRepository()
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const [sceneReady, setSceneReady] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationData | null>(null)
  const prev = useRef<{ childId: ChildId; coins: number; stars: number } | null>(null)

  const quests = questsFor(childId)
  const today = todayQuestsFor(
    state,
    childId,
    quests.map((q) => q.id),
    new Date(),
  )
  const progress = islandProgress(state, CHAPTER_ONE.planks)

  // League weeks end Sunday night — evaluate any that closed since last visit.
  useEffect(() => {
    repo.dispatch({ type: 'evaluateLeagues' })
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

  // Push world state into the island scene once it is listening.
  useEffect(() => {
    if (!sceneReady) return
    EventBus.emit('island-state', {
      planks: progress.placed,
      total: progress.total,
      complete: progress.complete,
      hats: {
        theodore: state.children.theodore.equipped.hat,
        leonard: state.children.leonard.equipped.hat,
      },
    })
  }, [state, sceneReady, progress.placed, progress.total, progress.complete])

  const wish = child.wishItem ? itemById(child.wishItem) : undefined
  const promotion = child.league.unseenPromotion

  return (
    <div className="screen home-screen" style={{ ['--accent' as string]: def.color }}>
      <div className="home-main">
        <div className="island-wrap">
          <PhaserGame scene="island" onSceneReady={setSceneReady} />
        </div>

        <div className="home-side">
          <p className="sr-only" data-testid="bridge-status">
            Bridge: {progress.placed} of {progress.total} planks
          </p>

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
                        repo.dispatch({
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

      {promotion && (
        <PromotionOverlay
          childId={childId}
          from={promotion.from}
          to={promotion.to}
          soundOn={state.settings.sound}
          onDone={() => repo.dispatch({ type: 'acknowledgePromotion', childId })}
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
