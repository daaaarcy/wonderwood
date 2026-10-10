import { useEffect, useRef, useState } from 'react'
import type { ChildId } from '../../domain/types'
import { CHILDREN } from '../../data/children'
import { assetUrl } from '../../game/assets'
import { useGameState } from '../../storage/hooks'
import { CharacterAvatar } from './CharacterAvatar'
import { LeagueBadge } from './LeagueBadge'

export type ChildTab = 'home' | 'shop' | 'room' | 'league'

interface Props {
  childId: ChildId
  tab: ChildTab
  onTab: (tab: ChildTab) => void
  onSwitch: () => void
  children: React.ReactNode
}

function TabIcon({ tab }: { tab: ChildTab }) {
  const p = { width: 26, height: 26, viewBox: '0 0 24 24', 'aria-hidden': true } as const
  switch (tab) {
    case 'home':
      return (
        <svg {...p}>
          <path d="M12 3 3 10 v10 h6 v-6 h6 v6 h6 V10 z" fill="currentColor" />
        </svg>
      )
    case 'shop':
      return (
        <svg {...p}>
          <path d="M6 8 h12 l1.5 12 a2 2 0 0 1 -2 2.2 h-11 a2 2 0 0 1 -2 -2.2 z" fill="currentColor" />
          <path d="M9 8 a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )
    case 'room':
      return (
        <svg {...p}>
          <path d="M4 6.5 V20" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M20 16.5 V20" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          <rect x="4" y="14" width="17" height="5" rx="2.5" fill="currentColor" />
          <rect x="5.4" y="10.4" width="5.4" height="3.8" rx="1.8" fill="currentColor" />
        </svg>
      )
    case 'league':
      return (
        <svg {...p}>
          <path d="M7 4 h10 v5 a5 5 0 0 1 -10 0 z" fill="currentColor" />
          <path d="M7 5 H4 a3 3 0 0 0 3 4 M17 5 h3 a3 3 0 0 1 -3 4" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="10.5" y="13" width="3" height="4" fill="currentColor" />
          <rect x="8" y="17" width="8" height="2.6" rx="1.3" fill="currentColor" />
        </svg>
      )
  }
}

const TABS: { id: ChildTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'shop', label: 'Shop' },
  { id: 'room', label: 'My room' },
  { id: 'league', label: 'League' },
]

function ExplorerMenu({ childId, onSwitch }: { childId: ChildId; onSwitch: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const state = useGameState()

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className="explorer-menu" ref={ref}>
      <button
        className="avatar-btn"
        aria-label="Explorer menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <CharacterAvatar
          childId={childId}
          hatItemId={state.children[childId].equipped.hat}
          size={44}
          headOnly
        />
      </button>
      {open && (
        <div className="menu-card" role="menu">
          <button
            role="menuitem"
            className="btn btn-neutral btn-small menu-item"
            onClick={() => {
              setOpen(false)
              onSwitch()
            }}
          >
            Switch explorer
          </button>
        </div>
      )}
    </div>
  )
}

export function ChildChrome({ childId, tab, onTab, onSwitch, children }: Props) {
  const state = useGameState()
  const child = state.children[childId]

  return (
    <div className="chrome">
      <header className="stat-bar">
        <ExplorerMenu childId={childId} onSwitch={onSwitch} />
        <span className="stat-name">{CHILDREN[childId].name}</span>
        <div className="stat-spacer" />
        <div className="stat-chips">
          <button
            className="badge-btn"
            onClick={() => onTab('league')}
            aria-label={`${CHILDREN[childId].name}'s league`}
          >
            <LeagueBadge rank={child.league.rank} size={40} />
          </button>
          <span className="chip chip-coin" aria-label={`${child.coins} coins`}>
            <img src={assetUrl('coin')} alt="" />
            <b data-testid="coin-count">{child.coins}</b>
          </span>
          <span className="chip chip-star" aria-label={`${child.stars} stars`}>
            <img src={assetUrl('star')} alt="" />
            <b>{child.stars}</b>
          </span>
        </div>
      </header>

      <main className="chrome-content">{children}</main>

      <nav className="main-nav" aria-label="Explorer navigation">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => onTab(t.id)}
          >
            <TabIcon tab={t.id} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
