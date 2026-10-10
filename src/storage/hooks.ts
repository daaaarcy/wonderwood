import { useContext, useSyncExternalStore } from 'react'
import type { GameState } from '../domain/types'
import type { GameRepository } from './GameRepository'
import { RepositoryContext } from './context'

export function useRepository(): GameRepository {
  const repo = useContext(RepositoryContext)
  if (!repo) throw new Error('useRepository must be used inside <RepositoryProvider>')
  return repo
}

export function useRepoStatus(): 'loading' | 'ready' | 'offline' {
  const repo = useRepository()
  return useSyncExternalStore(
    (onChange) => repo.subscribeStatus?.(onChange) ?? (() => {}),
    () => repo.status ?? 'ready',
  )
}

export function useGameState(): GameState {
  const repo = useRepository()
  return useSyncExternalStore(
    (onChange) => repo.subscribe(onChange),
    () => repo.load(),
  )
}
