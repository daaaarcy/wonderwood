#!/usr/bin/env node
/**
 * Live smoke test against the real Supabase project. Creates throwaway users
 * + a household, exercises the whole loop, then deletes only what it made.
 * Run: npm run smoke:supabase
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const URL_ = env.VITE_SUPABASE_URL ?? (env.SUPABASE_URL.startsWith('http') ? env.SUPABASE_URL : `https://${env.SUPABASE_URL}`)
const PUB = env.SUPABASE_PUBLISHABLE_KEY
const SECRET = env.SUPABASE_SECRET_KEY

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } })
const results = []
const created = { users: [], households: [] }
let step = ''
const mark = (s) => { step = s; console.log('…', s) }
const check = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) process.exitCode = 1
}

const grown = createClient(URL_, PUB, { auth: { persistSession: false } })
const kid = createClient(URL_, PUB, { auth: { persistSession: false } })
const stranger = createClient(URL_, PUB, { auth: { persistSession: false } })

try {
  // --- grown-up account (admin API, secret key) ---
  const email = `smoke-${Date.now()}@wonderwood.test`
  const password = `Pw!${Date.now()}x`
  mark('admin createUser'); const { data: u, error: ue } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (ue) throw ue
  created.users.push(u.user.id)
  mark('signInWithPassword'); const { data: s, error: se } = await grown.auth.signInWithPassword({ email, password })
  if (se) throw se
  check('grown-up signs in', !!s.user && !s.user.is_anonymous)

  const fn = (client, body) => client.functions.invoke('game', { body })

  // --- createHousehold ---
  const ch = await fn(grown, { action: 'createHousehold', timeZone: 'America/Los_Angeles' })
  const hid = ch.data?.householdId
  created.households.push(hid)
  check('createHousehold', !!hid)
  check('household state is v4 + tz', ch.data?.state?.schemaVersion === 4 && ch.data?.state?.timeZone === 'America/Los_Angeles')

  // anonymous cannot createHousehold
  mark('stranger anon'); const { error: ae } = await stranger.auth.signInAnonymously()
  check('anonymous sign-in works', !ae)
  created.users.push((await stranger.auth.getUser()).data.user.id)
  const anonCreate = await fn(stranger, { action: 'createHousehold' })
  check('anonymous createHousehold rejected', anonCreate.error !== null)

  // --- PIN ---
  mark('setPin'); const sp = await fn(grown, { action: 'setPin', householdId: hid, pin: '1234' })
  check('setPin', !sp.error)

  // --- pairing ---
  mark('createPairingCode'); const pc = await fn(grown, { action: 'createPairingCode', householdId: hid })
  const code = pc.data?.code
  check('createPairingCode (6 digits)', /^\d{6}$/.test(code ?? ''))

  mark('kid anon'); const { error: ke } = await kid.auth.signInAnonymously()
  check('kid anonymous sign-in', !ke)
  const kidUser = (await kid.auth.getUser()).data.user
  created.users.push(kidUser.id)
  mark('pairDevice'); const pd = await fn(kid, { action: 'pairDevice', code, label: 'smoke tablet' })
  check('pairDevice', pd.data?.householdId === hid)

  // --- claim as device (no pin needed) ---
  mark('claim'); const claim = await fn(kid, {
    action: 'command',
    householdId: hid,
    command: { type: 'claimQuest', childId: 'theodore', questId: 'theodore-language', claimId: `smoke-${Date.now()}` },
  })
  check('device claimQuest ok', claim.data?.result?.ok === true)
  const claimId = Object.keys(claim.data.state.claims)[0]

  // --- approve without pin → rejected; with pin → ok ---
  mark('approve no pin'); const noPin = await fn(kid, { action: 'command', householdId: hid, command: { type: 'approveClaim', claimId } })
  check('approve without PIN rejected', noPin.error !== null || noPin.data?.error === 'pin-required')
  mark('approve pin'); const withPin = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: { type: 'approveClaim', claimId } })
  check('approve with PIN ok', withPin.data?.result?.ok === true, `coins=${withPin.data?.state?.children?.theodore?.coins}`)

  // --- realtime: kid subscription sees the next update ---
  mark('subscribe realtime'); let markSubscribed = () => {}
  const subscribed = new Promise((r) => (markSubscribed = r))
  const rtPromise = new Promise((resolve) => {
    kid
      .channel(`household:${hid}`)
      .on('broadcast', { event: 'update' }, (p) => resolve(p.payload))
      .subscribe((status) => status === 'SUBSCRIBED' && markSubscribed(null))
    setTimeout(() => resolve(null), 10000)
  })
  await Promise.race([subscribed, new Promise((r) => setTimeout(r, 8000))])
  // race two buys for the road's final kit — but first give road kit #1
  await fn(kid, {
    action: 'command',
    householdId: hid,
    command: { type: 'buyKit', childId: 'theodore', projectId: 'road', kitPurchaseId: `k1-${Date.now()}` },
  })
  const buy = (id, childId) =>
    fn(kid, {
      action: 'command',
      householdId: hid,
      command: { type: 'buyKit', childId, projectId: 'road', kitPurchaseId: id },
    })
  mark('kit race'); const [r1, r2] = await Promise.all([buy(`k2-${Date.now()}`, 'theodore'), buy(`k3-${Date.now()}`, 'leonard')])
  const winners = [r1, r2].filter((r) => r.data?.result?.ok === true)
  check('two racing final-kit buys → exactly one wins', winners.length === 1)
  const final = await admin.from('households').select('state').eq('id', hid).single()
  check(
    'road open + library current + correct spend',
    final.data.state.city.projects.road.status === 'open' &&
      final.data.state.city.currentProjectId === 'library' &&
      final.data.state.children.theodore.coins + final.data.state.children.leonard.coins === 30,
  )

  mark('await realtime'); const rt = await rtPromise
  check('realtime broadcast received by device', rt !== null && typeof rt.version === 'number')

  // --- RLS: stranger cannot read the household; publishable cannot read secrets ---
  const { data: rls } = await stranger.from('households').select('id').eq('id', hid)
  check('stranger cannot SELECT household (RLS)', (rls ?? []).length === 0)
  const { data: secrets } = await stranger.from('household_secrets').select('*')
  check('secrets table unreadable', (secrets ?? []).length === 0)
  const { data: codes } = await stranger.from('pairing_codes').select('*')
  check('pairing codes unreadable', (codes ?? []).length === 0)
} finally {
  console.log('\n=== smoke results ===')
  for (const r of results) console.log(r)
  for (const uid of created.users) {
    try {
      await admin.auth.admin.deleteUser(uid)
    } catch {}
  }
  for (const h of created.households) {
    try {
      if (h) await admin.from('households').delete().eq('id', h)
    } catch {}
  }
}
