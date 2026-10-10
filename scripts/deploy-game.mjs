#!/usr/bin/env node
/** Deploy the game edge function — loads .env.local, runs sync + supabase deploy. */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const ref = env.SUPABASE_URL.replace(/^https?:\/\//, '').replace('.supabase.co', '')
spawnSync('node', ['scripts/sync-shared.mjs'], { stdio: 'inherit' })
const r = spawnSync(
  'npx',
  ['supabase', 'functions', 'deploy', 'game', '--use-api', '--project-ref', ref],
  { stdio: 'inherit', env: { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN } },
)
process.exit(r.status ?? 1)
