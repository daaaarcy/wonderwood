import { useMemo, type ReactNode } from 'react'
import { commandDeps } from '../data/registry'
import type { GameRepository } from './GameRepository'
import { RepositoryContext } from './context'
import { LocalStorageRepository } from './LocalStorageRepository'

export function RepositoryProvider({
  children,
  repository,
}: {
  children: ReactNode
  repository?: GameRepository
}) {
  const repo = useMemo<GameRepository>(
    () => repository ?? new LocalStorageRepository(window.localStorage, commandDeps),
    [repository],
  )
  return <RepositoryContext.Provider value={repo}>{children}</RepositoryContext.Provider>
}
