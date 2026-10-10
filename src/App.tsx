import { useEffect, useState } from 'react'
import type { ChildId } from './domain/types'
import { LEAGUES } from './data/leagues'
import { RepositoryProvider } from './storage/repo-context'
import { useRepository } from './storage/hooks'
import { LeagueBadge } from './ui/components/LeagueBadge'
import { ProfilePicker } from './ui/screens/ProfilePicker'
import { ChildHome } from './ui/screens/ChildHome'
import { Grownups } from './ui/screens/Grownups'
import { LeagueScreen } from './ui/screens/LeagueScreen'
import { Shop } from './ui/screens/Shop'
import { RoomScreen } from './ui/screens/RoomScreen'

export type Screen = 'picker' | 'home' | 'shop' | 'room' | 'grownups' | 'league'

function BadgeGallery() {
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <h1 className="game-title" style={{ fontSize: '2rem' }}>Explorer Leagues</h1>
      <div className="badge-gallery">
        {LEAGUES.map((l) => (
          <figure key={l.rank} className="badge-cell">
            <LeagueBadge rank={l.rank} size={96} animated />
            <figcaption>{l.name} League</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function Shell() {
  const [screen, setScreen] = useState<Screen>('picker')
  const [childId, setChildId] = useState<ChildId | null>(null)
  const repo = useRepository()

  // Close out any fully-ended league weeks at app start.
  useEffect(() => {
    repo.dispatch({ type: 'evaluateLeagues' })
  }, [repo])

  if (new URLSearchParams(window.location.search).has('badges')) {
    return <BadgeGallery />
  }

  const pickChild = (id: ChildId) => {
    setChildId(id)
    setScreen('home')
  }

  if (screen === 'picker' || childId === null) {
    return <ProfilePicker onPick={pickChild} onGrownups={() => setScreen('grownups')} />
  }
  if (screen === 'grownups') {
    return <Grownups onExit={() => setScreen('picker')} />
  }
  if (screen === 'shop') {
    return <Shop childId={childId} onBack={() => setScreen('home')} />
  }
  if (screen === 'room') {
    return <RoomScreen childId={childId} onBack={() => setScreen('home')} />
  }
  if (screen === 'league') {
    return <LeagueScreen childId={childId} onBack={() => setScreen('home')} />
  }
  return (
    <ChildHome
      childId={childId}
      onShop={() => setScreen('shop')}
      onRoom={() => setScreen('room')}
      onLeague={() => setScreen('league')}
      onSwitch={() => setScreen('picker')}
    />
  )
}

export function App() {
  return (
    <RepositoryProvider>
      <Shell />
    </RepositoryProvider>
  )
}
