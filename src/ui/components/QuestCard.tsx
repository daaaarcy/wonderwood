import type { ReactNode } from 'react'
import type { ChildId, ClaimDetails } from '../../domain/types'
import type { QuestDef } from '../../data/quests'
import { useGameState } from '../../storage/hooks'
import { assetUrl } from '../../game/assets'
import { SpeakerIcon } from './SpeakerIcon'

type SheetFn = (s: { kind: 'reading' } | { kind: 'housework' } | { kind: 'challenge'; quest: QuestDef }) => void

export function QuestCard({
  quest,
  status,
  childId,
  offline,
  claimQuest,
  openSheet,
  subtitle,
}: {
  quest: QuestDef
  status: 'available' | 'pending' | 'done'
  childId: ChildId
  offline: boolean
  claimQuest: (details?: ClaimDetails) => void
  openSheet: SheetFn
  subtitle?: ReactNode
}) {
  const state = useGameState()
  const config = state.config[childId]
  const url =
    quest.kind.type === 'external'
      ? quest.id === 'typing'
        ? config.typingUrl
        : quest.kind.url
      : undefined

  const act = () => {
    if (quest.id === 'housework') return openSheet({ kind: 'housework' })
    claimQuest()
  }

  return (
    <article className={`quest-card quest-${status}`}>
      <span className={`quest-node node-${status}`}>
        <img src={assetUrl(quest.iconKey)} alt="" className="quest-icon" />
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
        <p className="quest-label">{quest.label}</p>
        {subtitle && <p className="quest-sub">{subtitle}</p>}
        {status === 'available' && quest.kind.type === 'external' && url && (
          <a
            className="open-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
              <path d="M14 4h6v6M20 4l-9 9M18 13v6H5V5h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {quest.kind.buttonLabel ?? 'Open'}
          </a>
        )}
      </div>
      <button
        className="icon-btn speak-btn"
        aria-label={`Hear the quest: ${quest.label}`}
        onClick={() => {
          if ('speechSynthesis' in window) {
            speechSynthesis.cancel()
            speechSynthesis.speak(new SpeechSynthesisUtterance(quest.label))
          }
        }}
      >
        <SpeakerIcon />
      </button>
      {status === 'available' && (
        <span className="quest-actions">
          {quest.kind.type === 'challenge' && (
            <button className="btn btn-big btn-yes" onClick={() => openSheet({ kind: 'challenge', quest })}>
              Start
            </button>
          )}
          {quest.kind.type === 'reading' && (
            <button className="btn btn-big btn-yes" onClick={() => openSheet({ kind: 'reading' })}>
              I read!
            </button>
          )}
          {(quest.kind.type === 'real-world' || quest.kind.type === 'external') && (
            <button className="btn btn-big btn-yes" disabled={offline} onClick={act}>
              I did it!
            </button>
          )}
        </span>
      )}
      {status === 'pending' && <span className="quest-status">Waiting for a grown-up…</span>}
      {quest.kind.type === 'reading' && status !== 'available' && (
        <button className="btn btn-neutral btn-small" onClick={() => openSheet({ kind: 'reading' })}>
          I read another!
        </button>
      )}
      {status === 'done' && (
        <span className="quest-status quest-done">
          <img src={assetUrl('star')} alt="" /> Done!
        </span>
      )}
    </article>
  )
}
