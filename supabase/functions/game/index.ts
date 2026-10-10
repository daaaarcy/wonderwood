// Wonderwood `game` edge function — thin adapter; all logic lives in handle.ts.
// Run with verify_jwt on. Secrets are injected by the platform
// (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2'
import { handle, type AuthContext, type Reply, type Store } from './handle.ts'

const URL_ = Deno.env.get('SUPABASE_URL')!
const SECRET = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']
const PUBLISHABLE = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)['default']
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, 'public', any>

function admin(): AnyClient {
  return createClient(URL_, SECRET)
}

function dbStore(db: AnyClient): Store {
  return {
    async householdIdFor(userId) {
      const { data } = await db
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      return data?.household_id ?? null
    },
    async getMembership(householdId, userId) {
      const { data } = await db
        .from('household_members')
        .select('role')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .maybeSingle()
      return data
    },
    async createHouseholdRow(state) {
      const { data, error } = await db.from('households').insert({ state }).select('id').single()
      if (error) throw error
      return { id: data.id }
    },
    async loadHousehold(householdId) {
      const { data } = await db
        .from('households')
        .select('state, version')
        .eq('id', householdId)
        .maybeSingle()
      return data
    },
    async conditionalUpdate(householdId, expectedVersion, state) {
      const { data } = await db
        .from('households')
        .update({ state, version: expectedVersion + 1, updated_at: new Date().toISOString() })
        .eq('id', householdId)
        .eq('version', expectedVersion)
        .select('version')
      return (data?.length ?? 0) > 0
    },
    async addMember(householdId, userId, role, label) {
      const { error } = await db
        .from('household_members')
        .insert({ household_id: householdId, user_id: userId, role, label })
      if (error) throw error
    },
    async listMembers(householdId) {
      const { data } = await db
        .from('household_members')
        .select('user_id, role, label')
        .eq('household_id', householdId)
      return data ?? []
    },
    async removeMember(householdId, userId) {
      await db.from('household_members').delete().eq('household_id', householdId).eq('user_id', userId)
    },
    async setPin(householdId, pin) {
      const { error } = await db.rpc('set_household_pin', { hid: householdId, pin })
      if (error) throw error
    },
    async checkPin(householdId, pin) {
      const { data: s } = await db
        .from('household_secrets')
        .select('locked_until')
        .eq('household_id', householdId)
        .maybeSingle()
      if (s?.locked_until && new Date(s.locked_until) > new Date()) return 'locked'
      const { data } = await db.rpc('check_household_pin', { hid: householdId, pin })
      return data === true ? 'ok' : 'wrong'
    },
    async hasPin(householdId) {
      const { data } = await db
        .from('household_secrets')
        .select('household_id')
        .eq('household_id', householdId)
        .not('pin_hash', 'is', null)
        .maybeSingle()
      return data !== null
    },
    async createPairingCodeRow(householdId, code, expiresAt) {
      await db.from('pairing_codes').insert({ code, household_id: householdId, expires_at: expiresAt })
    },
    async consumePairingCode(code, now) {
      const { data } = await db.from('pairing_codes').select('*').eq('code', code).maybeSingle()
      if (!data) return 'missing'
      if (data.used_at) return 'used'
      if (new Date(data.expires_at) <= now) return 'expired'
      const { data: upd } = await db
        .from('pairing_codes')
        .update({ used_at: now.toISOString() })
        .eq('code', code)
        .is('used_at', null)
        .select('household_id')
      if (!upd || upd.length === 0) return 'used'
      return upd[0].household_id
    },
    async pairingFailures(userId, since) {
      const { count } = await db
        .from('pairing_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('attempted_at', since.toISOString())
      return count ?? 0
    },
    async recordPairingAttempt(userId) {
      await db.from('pairing_attempts').insert({ user_id: userId })
    },
  }
}

function cors(origin: string | null): Record<string, string> {
  const allow =
    origin &&
    (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === APP_ORIGIN)
      ? origin
      : 'null'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function send(reply: Reply, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(reply.json), {
    status: reply.status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

async function authContext(jwt: string | undefined): Promise<AuthContext | null> {
  if (!jwt) return null
  const client = createClient(URL_, PUBLISHABLE)
  const { data, error } = await client.auth.getUser(jwt)
  if (error || !data.user) return null
  return { userId: data.user.id, isAnonymous: data.user.is_anonymous === true }
}

Deno.serve(async (req) => {
  const corsHeaders = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return send({ status: 405, json: { error: 'method-not-allowed' } }, corsHeaders)
  }
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '')
  const auth = await authContext(jwt)
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return send({ status: 400, json: { error: 'bad-json' } }, corsHeaders)
  }
  const reply = await handle(String(body.action ?? ''), body, auth, dbStore(admin()), new Date())
  // notify subscribers; broadcast is fire-and-forget
  if (
    reply.status === 200 &&
    body.action === 'command' &&
    (reply.json as { result?: { ok?: boolean } }).result?.ok === true
  ) {
    const hid = String(body.householdId ?? '')
    const version = (reply.json as { version?: number }).version
    try {
      await fetch(`${URL_}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SECRET,
          Authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({
          messages: [
            { topic: `household:${hid}`, event: 'update', payload: { version } },
          ],
        }),
      })
    } catch {
      // best-effort — clients also poll
    }
  }
  return send(reply, corsHeaders)
})
