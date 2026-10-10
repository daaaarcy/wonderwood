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

## Deploy (Cloudflare Pages)

The app is fully static — `dist/` is the whole site, service worker included.

- **Build command:** `npm run build`
- **Output directory:** `dist`
- No routing config needed (single-page, state-based navigation).
- Node version: 20+ (`.nvmrc`-less; set `NODE_VERSION` env var if needed).
