import { useEffect } from 'react'
import type { ChildId } from '../../domain/types'
import { assetUrl } from '../../game/assets'
import { explorerDataUrl } from '../../game/avatarSvg'
import { useGameState } from '../../storage/hooks'

export interface CelebrationData {
  coins: number
  stars: number
}

/**
 * Approval celebration: coins fly toward the purse plus a star.
 * With prefers-reduced-motion the CSS swaps the animation for a
 * static highlight — this component always renders the same markup.
 */
export function Celebration({
  childId,
  data,
  onDone,
}: {
  childId: ChildId
  data: CelebrationData
  onDone: () => void
}) {
  const state = useGameState()
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="celebration" role="status" onClick={onDone}>
      <div className="celebration-card">
        <img
          className="celebration-cheer"
          src={explorerDataUrl(state.children[childId].look, 'cheer')}
          alt=""
          aria-hidden="true"
        />
        <div className="celebration-burst" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <img key={i} className={`fly-coin fly-coin-${i}`} src={assetUrl('coin')} alt="" />
          ))}
          <img className="fly-star" src={assetUrl('star')} alt="" />
        </div>
        <p className="celebration-text">
          +{data.coins} coins{data.stars > 0 ? `, +${data.stars} star` : ''}!
        </p>
        <p className="celebration-sub">Great job, explorer!</p>
      </div>
    </div>
  )
}
