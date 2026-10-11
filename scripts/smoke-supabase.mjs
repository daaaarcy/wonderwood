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
  check('household state is v9 + tz', ch.data?.state?.schemaVersion === 9 && ch.data?.state?.timeZone === 'America/Los_Angeles')

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
    command: { type: 'claimQuest', childId: 'theodore', questId: 'spanish', claimId: `smoke-${Date.now()}` },
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
  try { await kid.removeAllChannels() } catch {}
  check('realtime broadcast received by device', rt !== null && typeof rt.version === 'number')

  // --- v5: grown-up schedule update needs PIN; reading rewards sequence ---
  mark('updateSchedule PIN')
  const sched = { 0: ['violin', 'reading'], 1: ['violin', 'reading'], 2: ['violin', 'reading'], 3: ['violin', 'reading'], 4: ['violin', 'reading'], 5: ['violin', 'reading'], 6: ['violin', 'reading'] }
  const noPinSched = await fn(grown, { action: 'command', householdId: hid, command: { type: 'updateSchedule', childId: 'leonard', core: sched, bonus: ['housework'] } })
  check('updateSchedule without PIN rejected', noPinSched.error !== null || noPinSched.data?.error != null)
  const schedRes = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: { type: 'updateSchedule', childId: 'leonard', core: sched, bonus: ['housework'] } })
  check('updateSchedule with PIN ok', schedRes.data?.result?.ok === true)

  mark('reading units')
  const read = (i, unit) =>
    fn(kid, {
      action: 'command', householdId: hid,
      command: { type: 'claimQuest', childId: 'leonard', questId: 'reading', claimId: `read-${i}-${Date.now()}`, details: { kind: 'reading', unit, withGrownUp: false } },
    })
  const ids = []
  for (const [i, unit] of [[0, 'book'], [1, 'chapter'], [2, 'chapter'], [3, 'book']]) {
    const r = await read(i, unit)
    ids.push(r.data?.result?.value?.id)
  }
  check('4 reading claims created', ids.every(Boolean))
  let st = schedRes.data?.state
  for (const id of ids) {
    const a = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: { type: 'approveClaim', claimId: id } })
    st = a.data?.state ?? st
  }
  const coins = st?.children?.leonard?.coins
  const stars = st?.children?.leonard?.stars
  const rew = ids.map((id) => st?.claims?.[id]?.reward?.coins)
  check('reading rewards 10/5/5/0 + 1 star', JSON.stringify(rew) === '[10,5,5,0]' && stars === 1 && coins === 20 + 20, `coins=${coins} stars=${stars} rew=${JSON.stringify(rew)}`)

  // --- v6: weekly challenge + repairs need PIN; coins unchanged by repairs ---
  mark('v6 commands')
  const weekKey = '2026-10-12'
  const noPinW = await fn(grown, { action: 'command', householdId: hid, command: { type: 'setWeeklyChallenge', childId: 'leonard', weekKey, templateId: 'housework-3' } })
  check('setWeeklyChallenge without PIN rejected', noPinW.error !== null)
  const pinW = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: { type: 'setWeeklyChallenge', childId: 'leonard', weekKey, templateId: 'housework-3' } })
  check('setWeeklyChallenge with PIN ok', pinW.data?.result?.ok === true)
  const inc = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: { type: 'logIncident', childId: 'theodore', incidentId: 'smoke-inc', situation: 'scattering' } })
  check('logIncident with PIN ok', inc.data?.result?.ok === true)
  const coinsBefore = inc.data?.state?.children?.theodore?.coins
  const rep = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: { type: 'markRepaired', incidentId: 'smoke-inc' } })
  check('markRepaired with PIN ok', rep.data?.result?.ok === true)
  check('repairs leave coins unchanged', rep.data?.state?.children?.theodore?.coins === coinsBefore && rep.data?.state?.children?.theodore?.stars === inc.data?.state?.children?.theodore?.stars)
  const noPinInc = await fn(grown, { action: 'command', householdId: hid, command: { type: 'deleteIncident', incidentId: 'smoke-inc' } })
  check('deleteIncident without PIN rejected', noPinInc.error !== null)
  const del = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: { type: 'deleteIncident', incidentId: 'smoke-inc' } })
  check('deleteIncident with PIN ok', del.data?.result?.ok === true)
  // child-allowed: nameCity without PIN
  const nc = await fn(kid, { action: 'command', householdId: hid, command: { type: 'nameCity', childId: 'theodore', name: 'Sunny Town' } })
  check('nameCity is child-allowed (no PIN)', nc.data?.result?.ok === true)

  // v9: setLook is child-allowed; invalid look rejected
  const goodLook = { skin: '#ffd3ac', hair: 'spiky', hairColor: '#1cb0f6', eyes: 'sparkle', mouth: 'grin', glasses: 'round', shirt: '#58cc02', scarf: '#ff4b4b' }
  const sl = await fn(kid, { action: 'command', householdId: hid, command: { type: 'setLook', childId: 'theodore', look: goodLook } })
  check('setLook is child-allowed (no PIN)', sl.data?.result?.ok === true && sl.data?.state?.children?.theodore?.look?.hair === 'spiky')
  const badLook = await fn(kid, { action: 'command', householdId: hid, command: { type: 'setLook', childId: 'theodore', look: { ...goodLook, hair: 'afro' } } })
  check('invalid look rejected', badLook.data?.result?.ok === false && badLook.data?.result?.error?.code === 'invalid-look')

  // --- v7: custom tasks need PIN to write; placeItem is child-allowed ---
  mark('v7 custom tasks')
  const cqId = `cq-${Date.now()}`
  const cqCmd = { type: 'createCustomQuest', questId: cqId, title: 'Smoke task', coins: 7, stars: 1, childIds: ['theodore'], days: [] }
  const noPinCq = await fn(grown, { action: 'command', householdId: hid, command: cqCmd })
  check('createCustomQuest without PIN rejected', noPinCq.error !== null || noPinCq.data?.error != null)
  const pinCq = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: cqCmd })
  check('createCustomQuest with PIN ok', pinCq.data?.result?.ok === true)
  const noPinUp = await fn(grown, { action: 'command', householdId: hid, command: { type: 'updateCustomQuest', id: cqId, patch: { coins: 9 } } })
  check('updateCustomQuest without PIN rejected', noPinUp.error !== null || noPinUp.data?.error != null)
  // unassigned sibling cannot claim it; assigned child can
  const wrongKid = await fn(kid, { action: 'command', householdId: hid, command: { type: 'claimQuest', childId: 'leonard', questId: cqId, claimId: `cq-bad-${Date.now()}` } })
  check('unassigned child claim rejected', wrongKid.data?.result?.ok === false)
  const cqClaim = await fn(kid, { action: 'command', householdId: hid, command: { type: 'claimQuest', childId: 'theodore', questId: cqId, claimId: `cq-ok-${Date.now()}` } })
  check('assigned child custom claim ok', cqClaim.data?.result?.ok === true && cqClaim.data?.result?.value?.role === 'custom')
  const cqClaimId = cqClaim.data?.result?.value?.id
  const theoBefore = cqClaim.data?.state?.children?.theodore?.coins ?? 0
  const cqApprove = await fn(grown, { action: 'command', householdId: hid, pin: '1234', command: { type: 'approveClaim', claimId: cqClaimId } })
  const theoAfter = cqApprove.data?.state?.children?.theodore?.coins ?? -1
  check('custom approval pays configured reward', theoAfter === theoBefore + 7 && cqApprove.data?.state?.claims?.[cqClaimId]?.questTitle === 'Smoke task', `coins ${theoBefore}→${theoAfter}`)
  // placeItem needs no PIN (child room decorating)
  const place = await fn(kid, { action: 'command', householdId: hid, command: { type: 'placeItem', childId: 'theodore', spot: 'rug', itemId: null } })
  check('placeItem is child-allowed (no PIN)', place.data?.result?.ok === true)

  // --- RLS: stranger cannot read the household; publishable cannot read secrets ---
  const { data: rls } = await stranger.from('households').select('id').eq('id', hid)
  check('stranger cannot SELECT household (RLS)', (rls ?? []).length === 0)
  const { data: secrets } = await stranger.from('household_secrets').select('*')
  check('secrets table unreadable', (secrets ?? []).length === 0)
  const { data: codes } = await stranger.from('pairing_codes').select('*')
  check('pairing codes unreadable', (codes ?? []).length === 0)

  // --- withdraw: kid claims → takes it back → approve of it fails → re-claim works ---
  mark('withdraw'); const wc = `w-${Date.now()}`
  const wclaim = await fn(kid, {
    action: 'command',
    householdId: hid,
    command: { type: 'claimQuest', childId: 'leonard', questId: 'violin', claimId: wc },
  })
  check('withdraw: claim ok', wclaim.data?.result?.ok === true)
  const withdrew = await fn(kid, {
    action: 'command',
    householdId: hid,
    command: { type: 'withdrawClaim', claimId: wc, childId: 'leonard' },
  })
  check('withdraw: child device can withdraw pending claim', withdrew.data?.result?.ok === true)
  const approveGone = await fn(grown, {
    action: 'command',
    householdId: hid,
    pin: '1234',
    command: { type: 'approveClaim', claimId: wc },
  })
  check('withdraw: approve of withdrawn claim fails', approveGone.data?.result?.ok === false)
  const leoCoins = withdrew.data?.state?.children?.leonard?.coins
  const reclaim = await fn(kid, {
    action: 'command',
    householdId: hid,
    command: { type: 'claimQuest', childId: 'leonard', questId: 'violin', claimId: `${wc}-again` },
  })
  check('withdraw: re-claim after undo ok', reclaim.data?.result?.ok === true)
  const reApprove = await fn(grown, {
    action: 'command',
    householdId: hid,
    pin: '1234',
    command: { type: 'approveClaim', claimId: `${wc}-again` },
  })
  check(
    'withdraw: re-claimed approval pays normally',
    reApprove.data?.result?.ok === true &&
      reApprove.data?.state?.children?.leonard?.coins === leoCoins + 10,
    `coins=${reApprove.data?.state?.children?.leonard?.coins}`,
  )
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
  for (const c of [grown, kid, stranger]) {
    try { await c.removeAllChannels() } catch {}
    try { await c.realtime.disconnect() } catch {}
  }
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(failed ? `\n${failed} FAIL` : '\nall pass')
  process.exit(failed ? 1 : 0)
}
