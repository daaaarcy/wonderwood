import { useState } from 'react'
import { projectById } from '../../data/city'
import { assetUrl } from '../../game/assets'
import type { GameState, Postcard } from '../../domain/types'

/** The building's little flat portrait — same art as the town. */
function BuildingScene({ color, iconKey, name }: { color: string; iconKey: string; name: string }) {
  return (
    <svg className="postcard-scene-art" viewBox="0 0 320 170" aria-hidden="true">
      {/* sky + sun + grass */}
      <rect width="320" height="170" fill="#bfe9f8" />
      <circle cx="42" cy="34" r="16" fill="#f2c40f" />
      <circle cx="260" cy="30" r="12" fill="#ffffff" opacity="0.9" />
      <circle cx="275" cy="36" r="8" fill="#ffffff" opacity="0.9" />
      <rect y="118" width="320" height="52" fill="#7ed957" />
      {/* trees */}
      <g transform="translate(26 118)">
        <rect x="-3" y="-14" width="6" height="16" rx="3" fill="#96683f" />
        <circle cy="-22" r="16" fill="#58cc02" />
      </g>
      <g transform="translate(292 118)">
        <rect x="-3" y="-14" width="6" height="16" rx="3" fill="#96683f" />
        <circle cy="-22" r="16" fill="#58cc02" />
      </g>
      {/* the building */}
      <g transform="translate(160 122)">
        <ellipse cx="0" cy="8" rx="72" ry="9" fill="#3c3c3c" opacity="0.08" />
        <rect x="-58" y="-58" width="116" height="66" rx="10" fill="#fff8ee" />
        <path d="M-68 -56 L68 -56 L0 -104 Z" fill={color} />
        <rect x="-13" y="-16" width="26" height="24" rx="7" fill="#96683f" />
        <rect x="-44" y="-44" width="22" height="18" rx="5" fill="#eafbff" />
        <rect x="22" y="-44" width="22" height="18" rx="5" fill="#eafbff" />
        <line x1="0" y1="-104" x2="0" y2="-118" stroke="#96683f" strokeWidth="3" />
        <path d="M0 -118 L22 -112 L0 -106 Z" fill={color} />
        <image href={assetUrl(iconKey)} x="-13" y="-90" width="26" height="26" />
      </g>
      {/* name plaque */}
      <g transform="translate(160 18)">
        <rect x="-70" y="-14" width="140" height="26" rx="9" fill="#ffffff" />
        <rect x="-70" y="-14" width="140" height="26" rx="9" fill="none" stroke={color} strokeWidth="3" />
        <text x="0" y="4" textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight="900" fontSize="14" fill="#3c3c3c">
          {name}
        </text>
      </g>
      {/* waving explorers */}
      <image href={assetUrl('explorer-theodore-cheer')} x="60" y="92" height="62" />
      <image href={assetUrl('explorer-leonard-cheer')} x="220" y="92" height="62" />
    </svg>
  )
}

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
      <div className="postcard-stamp" aria-hidden="true">
        <svg viewBox="0 0 40 46">
          <rect width="40" height="46" rx="4" fill="#dff5d8" />
          <path d="M20 8 L32 30 L24 30 L24 38 L16 38 L16 30 L8 30 Z" fill="#58cc02" />
          <circle cx="20" cy="8" r="4" fill="#58cc02" />
        </svg>
      </div>
      <BuildingScene color={color} iconKey={def?.iconKey ?? 'icon-library'} name={buildingName} />
      <div className="postcard-caption">
        <p className="postcard-sub">
          {state.city.name ? `Greetings from ${state.city.name}!` : 'Greetings from our town!'}
        </p>
        <p className="postcard-postmark">{date}</p>
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
        cards.map((p, i) => (
          <button
            key={p.id}
            className="postcard-button"
            style={{ transform: `rotate(${i % 2 === 0 ? -1.6 : 1.4}deg)` }}
            onClick={() => setBig(p)}
          >
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
