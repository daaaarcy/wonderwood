import { useEffect, useMemo, useState } from 'react'
import type { ChildId } from './domain/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LEAGUES } from './data/leagues'
import { RepositoryProvider } from './storage/repo-context'
import { useRepository } from './storage/hooks'
import { BACKEND, getSupabase } from './backend/supabase'
import { SupabaseRepository } from './storage/SupabaseRepository'
import { Onboarding } from './ui/screens/Onboarding'
import { LeagueBadge } from './ui/components/LeagueBadge'
import { ChildChrome, type ChildTab } from './ui/components/ChildChrome'
import { ProfilePicker } from './ui/screens/ProfilePicker'
import { ChildHome } from './ui/screens/ChildHome'
import { Grownups } from './ui/screens/Grownups'
import { LeagueScreen } from './ui/screens/LeagueScreen'
import { Shop } from './ui/screens/Shop'
import { RoomScreen } from './ui/screens/RoomScreen'
import { AvatarEditor } from './ui/screens/AvatarEditor'

export type Screen = 'picker' | 'grownups' | 'look' | ChildTab

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

/**
 * Offline fake of the Supabase surface Onboarding uses — lets every onboarding
 * screen be exercised/screenshot in local mode via `?onboard`.
 */
function stubSupabase(): SupabaseClient {
  const listeners = new Set<(event: string, session: unknown) => void>()
  return {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        listeners.add(cb)
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
      },
      signInWithPassword: async () => {
        const session = { user: { id: 'qa-grownup' } }
        for (const cb of listeners) cb('SIGNED_IN', session)
        return { data: { session }, error: null }
      },
      signUp: async () => ({ data: {}, error: null }),
      signInAnonymously: async () => ({ data: { user: { id: 'qa-kid' }, session: {} }, error: null }),
    },
    functions: {
      invoke: async () => ({ data: { householdId: 'qa-household' }, error: null }),
    },
  } as unknown as SupabaseClient
}

/** Device-local "who was playing" — not game state, never synced. */
const ACTIVE_CHILD_KEY = 'wonderwood:activeChild'

function readActiveChild(): ChildId | null {
  try {
    const v = window.localStorage.getItem(ACTIVE_CHILD_KEY)
    return v === 'theodore' || v === 'leonard' ? v : null
  } catch {
    return null // private mode etc.
  }
}
function writeActiveChild(id: ChildId | null) {
  try {
    if (id === null) window.localStorage.removeItem(ACTIVE_CHILD_KEY)
    else window.localStorage.setItem(ACTIVE_CHILD_KEY, id)
  } catch {
    // private mode — the picker will just show again next load
  }
}

function Shell() {
  const [remembered] = useState<ChildId | null>(() => readActiveChild())
  const [screen, setScreen] = useState<Screen>(remembered ? 'home' : 'picker')
  const [childId, setChildId] = useState<ChildId | null>(remembered)
  /** Where "Change my look" was opened from — return there on Done/Cancel. */
  const [lookReturn, setLookReturn] = useState<ChildTab>('home')
  const [onboardDone, setOnboardDone] = useState(false)
  const repo = useRepository()
  const qaOnboard = useMemo(
    () => new URLSearchParams(window.location.search).has('onboard'),
    [],
  )

  // Close out any fully-ended league weeks at app start.
  useEffect(() => {
    repo.dispatch({ type: 'evaluateLeagues' })
  }, [repo])

  if (new URLSearchParams(window.location.search).has('badges')) {
    return <BadgeGallery />
  }
  if (qaOnboard && !onboardDone) {
    return <Onboarding sb={stubSupabase()} onHousehold={() => setOnboardDone(true)} />
  }

  const pickChild = (id: ChildId) => {
    writeActiveChild(id)
    setChildId(id)
    setScreen('home')
  }

  const switchExplorer = () => {
    writeActiveChild(null)
    setChildId(null)
    setScreen('picker')
  }

  if (screen === 'grownups') {
    // "Back to explorers" → the remembered child's home if there is one.
    return <Grownups onExit={() => setScreen(readActiveChild() ? 'home' : 'picker')} />
  }
  if (screen === 'picker' || childId === null) {
    return <ProfilePicker onPick={pickChild} onGrownups={() => setScreen('grownups')} />
  }
  return (
    <ChildChrome
      childId={childId}
      tab={screen}
      onTab={(t) => setScreen(t)}
      onSwitch={switchExplorer}
      onLook={() => {
        if (screen !== 'look') setLookReturn(screen)
        setScreen('look')
      }}
    >
      {screen === 'shop' && <Shop childId={childId} />}
      {screen === 'room' && (
        <RoomScreen
          childId={childId}
          onEditLook={() => {
            setLookReturn('room')
            setScreen('look')
          }}
        />
      )}
      {screen === 'league' && <LeagueScreen childId={childId} />}
      {screen === 'home' && <ChildHome childId={childId} />}
      {screen === 'look' && (
        <AvatarEditor childId={childId} onDone={() => setScreen(lookReturn)} />
      )}
    </ChildChrome>
  )
}

/** Supabase mode: session → membership → repository, with onboarding in front. */
function SupabaseShell() {
  const [repo, setRepo] = useState<SupabaseRepository | null>(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [error, setError] = useState('')
  const [pairedAt, setPairedAt] = useState(0)

  useEffect(() => {
    const sb = getSupabase()
    let live = true

    const findHousehold = async () => {
      const { data: session } = await sb.auth.getSession()
      if (!session.session) {
        if (live) setNeedsOnboarding(true)
        return
      }
      const { data: member } = await sb
        .from('household_members')
        .select('household_id')
        .eq('user_id', session.session.user.id)
        .limit(1)
        .maybeSingle()
      if (!member) {
        if (live) setNeedsOnboarding(true)
        return
      }
      const { data: row, error: rowErr } = await sb
        .from('households')
        .select('state, version')
        .eq('id', member.household_id)
        .single()
      if (rowErr || !row) {
        if (live) setError('Could not reach the town — check the internet and reload.')
        return
      }
      if (live) {
        setRepo(
          new SupabaseRepository(
            sb,
            member.household_id as string,
            row as { state: never; version: number },
          ),
        )
      }
    }
    void findHousehold()

    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session && live) void findHousehold()
    })
    return () => {
      live = false
      sub.subscription.unsubscribe()
    }
  }, [pairedAt])

  if (repo) {
    return (
      <RepositoryProvider repository={repo}>
        <Shell />
      </RepositoryProvider>
    )
  }
  if (needsOnboarding) {
    return (
      <Onboarding
        sb={getSupabase()}
        onHousehold={() => setPairedAt((n) => n + 1)}
      />
    )
  }
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <p className="muted">{error || 'Loading…'}</p>
    </div>
  )
}

export function App() {
  if (BACKEND === 'supabase') return <SupabaseShell />
  return (
    <RepositoryProvider>
      <Shell />
    </RepositoryProvider>
  )
}
