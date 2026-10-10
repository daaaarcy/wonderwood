#!/usr/bin/env node
/** Fails the build if server secrets leaked into dist/. */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// actual key material, not supabase-js's own prefix-detection literals
const PATTERNS = [/sb_secret_[A-Za-z0-9]{10,}/, /sbp_[A-Za-z0-9]{10,}/]
const hits = []
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else {
      const s = readFileSync(p, 'utf8')
      for (const pat of PATTERNS) if (pat.test(s)) hits.push(`${p} matches ${pat}`)
    }
  }
}
walk('dist')
if (hits.length) {
  console.error('SECRET LEAK:', hits.join('\n'))
  process.exit(1)
}
console.log('dist clean: no server secrets found')
