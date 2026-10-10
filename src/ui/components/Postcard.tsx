import { useState } from 'react'
import { projectById } from '../../data/city'
import { assetUrl } from '../../game/assets'
import type { GameState, Postcard } from '../../domain/types'

/** A collectible postcard stamped the day a building opened. */
export function PostcardCard({ postcard, state, big }: { postcard: Postcard; state: GameState; big?: boolean }) {
  const project = state.city.projects[postcard.projectId]
  const def = projectById(postcard.projectId)
  const color = project.color ?? def?.color ?? '#4a9ede'
  const buildingName = project.name ?? def?.name ?? 'Town'
  const date = new Date(postcard.openedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return (
    <div className={`postcard ${big ? 'postcard-big' : ''}`} data-testid={`postcard-${postcard.projectId}`}>
      <div className="postcard-scene" style={{ background: color }}>
        <img src={assetUrl(def?.iconKey ?? 'icon-library')} alt="" className="postcard-building" />
        <div className="postcard-pair">
          <img src={assetUrl('explorer-theodore')} alt="Theodore" />
          <img src={assetUrl('explorer-leonard')} alt="Leonard" />
        </div>
      </div>
      <div className="postcard-caption">
        <p className="postcard-name">{buildingName}</p>
        <p className="postcard-sub">
          {state.city.name ? `Greetings from ${state.city.name}!` : 'Greetings from our town!'}
        </p>
        <p className="postcard-date">{date}</p>
      </div>
    </div>
  )
}

export function PostcardAlbum({ state }: { state: GameState }) {
  const cards = state.city.postcards ?? []
  const [big, setBig] = useState<Postcard | null>(null)
  return (
    <div className="postcard-album">
      {cards.length === 0 ? (
        <p className="muted">No postcards yet — they arrive when a building opens!</p>
      ) : (
        cards.map((p) => (
          <button key={p.id} className="postcard-button" onClick={() => setBig(p)}>
            <PostcardCard postcard={p} state={state} />
          </button>
        ))
      )}
      {big && (
        <div className="postcard-big-backdrop" onClick={() => setBig(null)}>
          <PostcardCard postcard={big} state={state} big />
        </div>
      )}
    </div>
  )
}
