import { useMemo, type ReactNode } from 'react'
import { commandDeps } from '../data/registry'
import type { GameRepository } from './GameRepository'
import { RepositoryContext } from './context'
import { LocalStorageRepository } from './LocalStorageRepository'

/** QA hook: `?devices` gives the local repository a fake device API so the
 *  Grown-ups → Devices panel (Supabase-only in production) can be checked. */
function withStubDevices(repo: GameRepository): GameRepository {
  if (typeof window === 'undefined') return repo
  if (!new URLSearchParams(window.location.search).has('devices')) return repo
  if (repo.devices) return repo
  const members = [
    { userId: 'grown-up-1', role: 'grown_up', label: "Grown-up phone" },
    { userId: 'kid-1', role: 'player', label: "Theodore's tablet" },
    { userId: 'kid-2', role: 'player', label: 'Kitchen iPad' },
  ]
  repo.devices = {
    list: async () => members,
    createPairingCode: async () => ({
      code: '482913',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
    remove: async (userId: string) => {
      const i = members.findIndex((m) => m.userId === userId)
      if (i >= 0) members.splice(i, 1)
    },
  }
  return repo
}

export function RepositoryProvider({
  children,
  repository,
}: {
  children: ReactNode
  repository?: GameRepository
}) {
  const repo = useMemo<GameRepository>(
    () =>
      withStubDevices(
        repository ?? new LocalStorageRepository(window.localStorage, commandDeps),
      ),
    [repository],
  )
  return <RepositoryContext.Provider value={repo}>{children}</RepositoryContext.Provider>
}
