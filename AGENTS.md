# Wonderwood — Theodore & Leonard's Island

A kids' habit-adventure web game for two brothers. Children tap "I did it!" on
daily quests; a grown-up approves behind a PIN; approvals award coins + stars;
stars from BOTH children build the shared Rainbow Bridge on the island.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `dist/` (also generates the PWA service worker) |
| `npm run preview` | Serve the built `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint flat config (typescript-eslint + react-hooks) |
| `npm run test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run e2e` | Build, then Playwright (desktop Chrome, Galaxy Tab S4 landscape, Pixel 7) |
| `npm run icons` | Regenerate PWA PNG icons from `public/icons/icon.svg` (needs Playwright chromium) |

E2E runs against `npm run preview` on port 4173 — build first (the script does it).

## Architecture

```
src/
  domain/     Pure TypeScript. NO React/Phaser/DOM imports. Fully unit tested.
    types.ts      GameState (schemaVersion 2), Command union, Result/error types
    week.ts       local Mon–Sun week math (weekKey = ISO Monday)
    commands.ts   includes Explorer League evaluation (evaluateLeagues)

    state.ts      initialState (20 welcome coins + toy-train), localDateKey
    commands.ts   Pure (state, cmd, now, deps) → {state, result}. Idempotent:
                  claim/purchase keyed by caller-supplied ids; approve/reject no-op safe
    selectors.ts  todayQuestsFor, islandProgress (both children's stars → planks, capped)
  data/       Game config: children (colors, headAnchor), quests, catalogue, island chapter.
    registry.ts Wires data lookups into CommandDeps (domain never imports data).
  storage/    GameRepository interface (load/dispatch/subscribe) — the ONLY
              persistence boundary; swap LocalStorageRepository for a backend later.
              LocalStorageRepository: key `wonderwood:v1`, schemaVersion check
              (v1 → v2 migration preserves the save), dispatch() re-reads
              storage before applying so a stale tab can't overwrite newer
              state or double-spend,
              corrupt → backup under `wonderwood:v1:corrupt-<ts>` + fresh state,
              cross-tab sync via the `storage` event.
              hooks.ts: useRepository/useGameState (useSyncExternalStore).
              pin.ts: sha256Hex (crypto.subtle) used by the grown-ups UI.
  game/       Phaser 4 layer. EventBus.ts is the React↔Phaser bridge
              (template-react-ts pattern). assets.ts = asset manifest
              (swap art here). PhaserGame.tsx creates/destroys the game and
              exposes data-scene-ready for tests. scenes/IslandScene + RoomScene.
  ui/         React screens (ProfilePicker, ChildHome, Grownups, Shop, RoomScreen),
              CharacterAvatar (same headAnchor math as the scenes), Celebration,
              theme.ts (the single palette — SVGs use the same hexes).
public/assets/  Hand-authored SVG art, one file per asset.
e2e/          Playwright specs. screenshots/ output is gitignored.
```

## Key conventions

- **Events**: React → scenes: `island-state`, `room-state`, `train-command`.
  Scenes → React: `scene-ready`, `train-state`. React waits for `scene-ready`
  before pushing state; tests wait on `data-scene-ready="true"`.
- **Destroyed scenes**: `game.destroy()` fires `DESTROY`, not `SHUTDOWN` —
  scenes unregister EventBus listeners on BOTH. Don't regress this.
- **Idempotency**: claim ids are per-tap `crypto.randomUUID()` — double-tap
  safety comes from the domain's one-active-claim-per-quest-per-day rule
  (rejected claims free the slot for re-claim). Purchase ids are per-tap UUIDs;
  the domain dedupes by id and by ownership anyway.
- **Explorer League**: 14 ranks in `src/data/leagues.ts` (exact order/colors —
  Netherite is magenta, Special Diamond is the shiny-light-blue top). Weekly
  promotion rule lives in commands.ts: eligibleDays >= 3, approved claims >=
  ceil(0.7 * 3 * eligibleDays), >= 3 active days; weeks evaluate lazily via
  `evaluateLeagues` (dispatched at app start + child home mount); late
  approvals re-check their week. No relegation; capped at 14. `LeagueBadge`
  renders every rank parameterized; `?badges` shows the whole ladder.
  Promotions surface via `unseenPromotion` → `PromotionOverlay` (in-house
  confetti + ~1.5s WebAudio fanfare, gated by `settings.sound`, fully static
  under prefers-reduced-motion).
- **PIN**: 4-digit, stored as SHA-256 hex via `crypto.subtle` (UI passes
  `pinHash`; domain's `hashPin` dep is a labelled non-crypto fallback for tests).
  It is a convenience gate for kids, NOT security — don't harden it beyond this.
- **Activity dates** are local-time `YYYY-MM-DD` (`localDateKey`) — a claim
  keeps its original day even if approved later.
- **No blame between siblings**: island progress only ever sums stars.
- **Touch targets** ≥ 56px for primary buttons; `prefers-reduced-motion` swaps
  the celebration animation for a static highlight.

## Gotchas

- Phaser canvases need a definite-sized parent: `.island-wrap`/`.room-wrap`
  use `aspect-ratio: 10/7` + bounded width. Don't switch them back to
  content-sized flex or FIT will grow the page.
- Scenes keep body+hat in one container (bob/hop animates the container) so
  hats never drift off heads. Hat attach = `headAnchor` in data + per-item
  `anchor` fraction in the catalogue.
- `localStorage` between e2e runs is per-test-context; tests are independent.

## Supabase backend (schema v4)

Authoritative state lives in Postgres (`households.state`, versioned). All writes
go through edge function `game` (`supabase/functions/game/`), which runs the same
`applyCommand` domain code as the client. PINs live in `household_secrets`
(bcrypt via pgcrypto), checked by `check_household_pin` — never in game state.

### Env
`.env.local` (gitignored): SUPABASE_URL (no scheme), SUPABASE_PUBLISHABLE_KEY,
SUPABASE_SECRET_KEY, SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.
Only the two `VITE_` vars reach the bundle; `npm run build` fails if dist leaks
`sb_secret_`/`sbp_` material (scripts/check-secrets.mjs).

### Backend mode
`VITE_BACKEND=supabase` (default when VITE_SUPABASE_URL is set) | `local`.
e2e builds with `VITE_BACKEND=local` so tests stay offline.

### Deploy commands
```sh
node scripts/sync-shared.mjs        # copy src/domain + src/data → supabase/functions/_shared (gitignored; auto-ran by test/deploy/smoke)
node scripts/db-migrate.mjs         # apply supabase/migrations/*.sql via Management API
npm run deploy:game                 # sync + supabase functions deploy game --use-api (needs SUPABASE_ACCESS_TOKEN env)
npm run smoke:supabase              # live end-to-end test against the real project
node scripts/ui-smoke.mjs           # real onboarding screenshots; needs a preview: VITE_BACKEND=supabase npm run build && npm run preview -- --port 4174
```
Function secret for prod CORS: `APP_ORIGIN` (localhost + 127.0.0.1 dev origins are always allowed).

### Notes
- Anonymous sign-ins are enabled via Management API (external_anonymous_users_enabled).
- Sync to other devices = realtime broadcast `household:<id>` 'update' + 20s poll + visibility/online refetch. (postgres_changes UPDATE delivery was unreliable on this project, so the function broadcasts after each successful command.)
- Grown-up commands (GROWN_UP_COMMANDS) require a PIN server-side on every device.
