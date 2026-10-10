import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

interface Props {
  sb: SupabaseClient
  /** called when this device belongs to a household */
  onHousehold: (householdId: string) => void
}

type Mode =
  | { kind: 'pick' }
  | { kind: 'grownup-auth' }
  | { kind: 'grownup-email-sent'; email: string }
  | { kind: 'create' } // signed in, no household yet
  | { kind: 'kid-code' }

function invoke<T>(sb: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  return sb.functions.invoke<T>('game', { body }).then(({ data, error }) => {
    if (error) throw error
    return data as T
  })
}

export function Onboarding({ sb, onHousehold }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'pick' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hasSave] = useState(() => window.localStorage.getItem('wonderwood:v1') !== null)
  const [bringSave, setBringSave] = useState(false)

  useEffect(() => {
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      // when a grown-up signs in, move on to household creation
      if (session) setMode((m) => (m.kind === 'grownup-auth' ? { kind: 'create' } : m))
    })
    return () => sub.subscription.unsubscribe()
  }, [sb])

  const fail = (e: unknown) => {
    const msg = (e as Error).message || 'Something went wrong — try again.'
    setError(msg.includes('offline') || msg.includes('fetch') ? 'No internet right now — try again when connected.' : msg)
    setBusy(false)
  }

  const signIn = async (signUp: boolean) => {
    setBusy(true)
    setError('')
    try {
      if (signUp) {
        const { error } = await sb.auth.signUp({ email, password })
        if (error) throw error
        setMode({ kind: 'grownup-email-sent', email })
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
        setMode({ kind: 'create' })
      }
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  const createHousehold = async () => {
    setBusy(true)
    setError('')
    try {
      const initialState =
        bringSave && hasSave
          ? JSON.parse(window.localStorage.getItem('wonderwood:v1') ?? 'null')
          : undefined
      const out = await invoke<{ householdId: string }>(sb, {
        action: 'createHousehold',
        initialState,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      onHousehold(out.householdId)
    } catch (e) {
      fail(e)
    }
    setBusy(false)
  }

  const pairKid = async () => {
    setBusy(true)
    setError('')
    try {
      const { data: s, error: signErr } = await sb.auth.signInAnonymously()
      if (signErr || !s.user) throw signErr ?? new Error('Could not sign in')
      const out = await invoke<{ householdId: string }>(sb, {
        action: 'pairDevice',
        code: code.trim(),
        label: 'kids device',
      })
      onHousehold(out.householdId)
    } catch (e) {
      const msg = (e as Error).message ?? ''
      setError(msg.includes('bad-code') || msg.includes('400') ? 'That code does not work — check it with a grown-up.' : msg)
    }
    setBusy(false)
  }

  return (
    <div className="screen onboarding">
      <h1 className="picker-title">Wonderwood</h1>

      {mode.kind === 'pick' && (
        <div className="onboard-cards">
          <button className="btn btn-big btn-yes" onClick={() => setMode({ kind: 'grownup-auth' })}>
            I&apos;m a grown-up
          </button>
          <button className="btn btn-big" onClick={() => setMode({ kind: 'kid-code' })}>
            This is a kids&apos; device
          </button>
          <p className="muted">A grown-up sets things up once, then the kids play on any paired device.</p>
        </div>
      )}

      {mode.kind === 'grownup-auth' && (
        <section className="panel onboard-panel">
          <h3>Set up Wonderwood</h3>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            <button className="btn btn-yes" disabled={busy || !email || password.length < 6} onClick={() => void signIn(false)}>
              {busy ? '…' : 'Sign in'}
            </button>
            <button className="btn" disabled={busy || !email || password.length < 6} onClick={() => void signIn(true)}>
              Create account
            </button>
          </div>
          <button className="btn btn-neutral" onClick={() => setMode({ kind: 'pick' })}>
            Back
          </button>
        </section>
      )}

      {mode.kind === 'grownup-email-sent' && (
        <section className="panel onboard-panel">
          <h3>Check your email</h3>
          <p>We sent a link to {mode.email} — tap it, then come back and sign in.</p>
          <button className="btn" onClick={() => setMode({ kind: 'grownup-auth' })}>
            Back to sign in
          </button>
        </section>
      )}

      {mode.kind === 'create' && (
        <section className="panel onboard-panel">
          <h3>Start your town</h3>
          {hasSave && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={bringSave}
                onChange={(e) => setBringSave(e.target.checked)}
              />
              Bring this device&apos;s progress
            </label>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-yes" disabled={busy} onClick={() => void createHousehold()}>
            {busy ? 'Building…' : 'Build the town!'}
          </button>
          <p className="muted">You&apos;ll pick a 4-digit PIN next, on the Grown-ups screen.</p>
        </section>
      )}

      {mode.kind === 'kid-code' && (
        <section className="panel onboard-panel">
          <h3>Pair this device</h3>
          <p className="muted">A grown-up can make a code on their phone: Grown-ups → Add a device.</p>
          <input
            className="code-input"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            aria-label="Pairing code"
          />
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-yes" disabled={busy || code.length !== 6} onClick={() => void pairKid()}>
            {busy ? 'Pairing…' : 'Join my town'}
          </button>
          <button className="btn btn-neutral" onClick={() => setMode({ kind: 'pick' })}>
            Back
          </button>
        </section>
      )}
    </div>
  )
}
