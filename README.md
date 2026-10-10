# Wonderwood — Theodore & Leonard's Island

A habit-adventure web game for two brothers. Each day brings three little
quests per explorer; kids tap **"I did it!"**, a grown-up approves, and the
island's Rainbow Bridge gains another plank. Coins buy shop goodies — like the
Leaf hat — and the toy train lives in the treehouse room.

## Stack

- React 19 + TypeScript (strict) + Vite
- Phaser 4 game world (Island + Room scenes), bridged to React via an EventBus
- vite-plugin-pwa (offline installable)
- Pure-TS domain layer with idempotent commands; persistence behind a
  swappable `GameRepository` interface (LocalStorage today)
- Vitest unit tests, Playwright e2e (desktop / tablet / phone)

## Develop

```sh
npm install
npx playwright install chromium   # once, for e2e + icon generation
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run e2e`.

See [AGENTS.md](./AGENTS.md) for architecture notes.

## Deploy (Cloudflare)

The app is a static site in `dist/` (service worker included). `wrangler.jsonc`
serves `dist` as Workers static assets, so it deploys via either Cloudflare
Workers Builds (Git connect: build `npm run build`, deploy `npx wrangler
deploy`) or Pages (build `npm run build`, output `dist`).

- Build-time env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  (safe to expose), `NODE_VERSION=22`. Never the secret/access keys.
- After deploy, allow the origin on the edge function:
  `npx supabase secrets set APP_ORIGIN=https://<site> --project-ref <ref>`
- No routing config needed (single-page, state-based navigation).
