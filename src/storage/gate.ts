import { sha256Hex } from './pin'

/**
 * The grown-up PIN gate. In local mode the hash lives in a separate
 * localStorage key (never inside game state); in Supabase mode it is a
 * pgcrypto bcrypt hash checked server-side with lockout.
 */
export interface GrownUpGate {
  hasPin(): Promise<boolean>
  verify(pin: string): Promise<'ok' | 'wrong' | 'locked'>
  setPin(pin: string): Promise<void>
}

const LOCAL_PIN_KEY = 'wonderwood:local-pin'

export function localGrownUpGate(): GrownUpGate {
  return {
    async hasPin() {
      return localStorage.getItem(LOCAL_PIN_KEY) !== null
    },
    async verify(pin) {
      const stored = localStorage.getItem(LOCAL_PIN_KEY)
      if (stored === null) return 'ok' // nothing set yet — Grownups will set one
      const hash = await sha256Hex(pin)
      return hash === stored ? 'ok' : 'wrong'
    },
    async setPin(pin) {
      localStorage.setItem(LOCAL_PIN_KEY, await sha256Hex(pin))
    },
  }
}
