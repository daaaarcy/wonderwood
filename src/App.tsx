import { useEffect, useState } from 'react'
import type { ChildId } from './domain/types'
import { LEAGUES } from './data/leagues'
import { RepositoryProvider } from './storage/repo-context'
import { useRepository } from './storage/hooks'
import { LeagueBadge } from './ui/components/LeagueBadge'
import { ChildChrome, type ChildTab } from './ui/components/ChildChrome'
import { ProfilePicker } from './ui/screens/ProfilePicker'
import { ChildHome } from './ui/screens/ChildHome'
import { Grownups } from './ui/screens/Grownups'
import { LeagueScreen } from './ui/screens/LeagueScreen'
import { Shop } from './ui/screens/Shop'
import { RoomScreen } from './ui/screens/RoomScreen'

export type Screen = 'picker' | 'grownups' | ChildTab

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
  return (
    <ChildChrome childId={childId} tab={screen} onTab={setScreen} onSwitch={() => setScreen('picker')}>
      {screen === 'shop' && <Shop childId={childId} />}
      {screen === 'room' && <RoomScreen childId={childId} />}
      {screen === 'league' && <LeagueScreen childId={childId} />}
      {screen === 'home' && <ChildHome childId={childId} />}
    </ChildChrome>
  )
}

export function App() {
  return (
    <RepositoryProvider>
      <Shell />
    </RepositoryProvider>
  )
}
