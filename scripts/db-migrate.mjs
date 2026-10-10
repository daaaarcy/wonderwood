#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql in filename order via the Management API,
 * tracking applied files in public._wonderwood_migrations (bootstrapped by
 * the first migration which also creates that table).
 *
 * Usage: node scripts/db-migrate.mjs   (reads .env.local)
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const TOKEN = env.SUPABASE_ACCESS_TOKEN
const REF = (env.SUPABASE_URL ?? '').replace(/^https?:\/\//, '').split('.')[0]
if (!TOKEN || !REF) {
  console.error('SUPABASE_ACCESS_TOKEN / SUPABASE_URL missing from .env.local')
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    const err = new Error(`query failed ${res.status}: ${(await res.text()).slice(0, 500)}`)
    err.status = res.status
    err.sql = sql.slice(0, 80)
    throw err
  }
  return res.json()
}

// ensure the tracking table exists (first run: 42P01 undefined_table → create it)
let applied
try {
  applied = new Set(
    (await query(`select filename from public._wonderwood_migrations`)).map((r) => r.filename),
  )
} catch {
  await query(`create table public._wonderwood_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`)
  await query(`alter table public._wonderwood_migrations enable row level security`)
  applied = new Set()
}

const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  if (applied.has(f)) {
    console.log(`skip ${f} (already applied)`)
    continue
  }
  const sql = readFileSync(join('supabase/migrations', f), 'utf8')
  await query(sql)
  await query(
    `insert into public._wonderwood_migrations (filename) values ('${f}') on conflict do nothing`,
  )
  console.log(`applied ${f}`)
}
console.log('done')
