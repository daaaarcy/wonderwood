import type { CustomQuest } from '../../domain/types'
import { assetUrl } from '../../game/assets'
import { FlatIcon } from './FlatIcons'

/** Little clipboard badge for grown-up-written tasks. */
const TaskIcon = () => (
  <FlatIcon size={34}>
    <rect x="12" y="8" width="24" height="34" rx="5" fill="#c98a5a" />
    <rect x="15" y="12" width="18" height="26" rx="3" fill="#fff3e4" />
    <rect x="19" y="4" width="10" height="9" rx="4.5" fill="#96683f" />
    <path d="M19 24 l4 4 7 -8" fill="none" stroke="#58cc02" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="19" y="32" width="11" height="3.4" rx="1.7" fill="#e0aa6b" />
  </FlatIcon>
)

export function CustomQuestCard({
  quest,
  title,
  status,
  offline,
  onClaim,
}: {
  quest: CustomQuest | undefined
  /** fallback title stored on the claim (archived tasks still render) */
  title?: string
  status: 'available' | 'pending' | 'done'
  offline: boolean
  onClaim: () => void
}) {
  const coins = quest?.coins ?? 0
  const stars = quest?.stars ?? 0
  const reward =
    coins > 0 || stars > 0
      ? `+${coins > 0 ? `${coins} coins` : ''}${coins > 0 && stars > 0 ? ', ' : ''}${stars > 0 ? `${stars} star${stars === 1 ? '' : 's'}` : ''}`
      : null
  return (
    <article className={`quest-card custom-card quest-${status}`} data-testid="custom-card">
      <span className={`quest-node node-${status}`}>
        <TaskIcon />
        {status === 'pending' && (
          <svg className="node-mark" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="3" />
            <path d="M12 7 v5 l3.5 2" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {status === 'done' && (
          <svg className="node-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 13 l4.5 4.5 L19 7" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className="quest-text">
        <p className="quest-label">{quest?.title ?? title ?? 'A task'}</p>
        {reward && (
          <p className="quest-sub reward-pill" data-testid="custom-reward">
            <img src={assetUrl('coin')} alt="" /> {reward}
          </p>
        )}
      </div>
      {status === 'available' && (
        <span className="quest-actions">
          <button className="btn btn-big btn-yes" disabled={offline} onClick={onClaim}>
            I did it!
          </button>
        </span>
      )}
      {status === 'pending' && <span className="quest-status">Waiting for a grown-up…</span>}
      {status === 'done' && (
        <span className="quest-status quest-done">
          <img src={assetUrl('star')} alt="" /> Done!
        </span>
      )}
    </article>
  )
}
