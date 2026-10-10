import { createContext } from 'react'
import type { GameRepository } from './GameRepository'

export const RepositoryContext = createContext<GameRepository | null>(null)
