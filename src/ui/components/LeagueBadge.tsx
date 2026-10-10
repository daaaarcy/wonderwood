import { useId } from 'react'
import { leagueByRank } from '../../data/leagues'


interface Props {
  rank: number
  size?: number
  /** allow the top-tier shimmer/sparkle loop (still disabled by reduced-motion CSS) */
  animated?: boolean
}

/**
 * One parameterized badge for all 14 leagues — escalating materials:
 * shield (1–3) → medal (4–5) → gem in gold (6–10) → ornate dark gem (11–12)
 * → framed diamond (13–14).
 */
export function LeagueBadge({ rank, size = 64, animated = false }: Props) {
  const uid = useId()
  const league = leagueByRank(rank)

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      className={animated ? 'league-badge animated' : 'league-badge'}
    >
      <title>{`${league.name} League`}</title>
      {rank <= 3 && <ShieldBadge rank={rank} uid={uid} />}
      {rank >= 4 && rank <= 5 && <MedalBadge rank={rank} uid={uid} />}
      {rank >= 6 && rank <= 10 && <GemBadge rank={rank} uid={uid} ornate={false} />}
      {rank >= 11 && rank <= 12 && <GemBadge rank={rank} uid={uid} ornate />}
      {rank >= 13 && <DiamondBadge rank={rank} uid={uid} />}
    </svg>
  )
}

function ShieldBadge({ rank, uid }: { rank: number; uid: string }) {
  const league = leagueByRank(rank)
  const shield = 'M60 12 C75 20 92 22 98 24 C98 62 88 88 60 104 C32 88 22 62 22 24 C28 22 45 20 60 12 Z'
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-shield`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={rank === 1 ? '#ffffff' : league.color} />
          <stop offset="1" stopColor={rank === 1 ? '#e8e2d8' : shade(league.color, -0.25)} />
        </linearGradient>
      </defs>
      <path d={shield} fill={`url(#${uid}-shield)`} stroke={rank === 1 ? '#cfcfcf' : shade(league.color, -0.35)} strokeWidth="4" strokeLinejoin="round" />
      {rank === 1 && (
        <>
          <ellipse cx="44" cy="38" rx="16" ry="10" fill="#ffffff" opacity="0.85" transform="rotate(-18 44 38)" />
          <path d="M30 78 q30 18 60 0 l0 8 q-30 16 -60 0 z" fill="#e5e5e5" />
        </>
      )}
      {rank === 2 && (
        <g fill="none" stroke="#8a5a3b" strokeWidth="3" strokeLinecap="round">
          <path d="M40 34 q10 -6 22 -2" />
          <path d="M34 52 q16 -8 34 -2" />
          <path d="M40 70 q14 -6 30 0" />
          <path d="M48 86 q8 -4 18 -1" />
          <circle cx="76" cy="46" r="5" />
        </g>
      )}
      {rank === 3 && (
        <g stroke="#c98a74" strokeWidth="3" strokeLinecap="round">
          <line x1="30" y1="42" x2="90" y2="42" />
          <line x1="28" y1="62" x2="92" y2="62" />
          <line x1="34" y1="82" x2="86" y2="82" />
          <line x1="48" y1="28" x2="48" y2="42" />
          <line x1="72" y1="28" x2="72" y2="42" />
          <line x1="60" y1="42" x2="60" y2="62" />
          <line x1="42" y1="62" x2="42" y2="82" />
          <line x1="78" y1="62" x2="78" y2="82" />
        </g>
      )}
    </g>
  )
}

function MedalBadge({ rank, uid }: { rank: number; uid: string }) {
  const league = leagueByRank(rank)
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-metal`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor={lighten(league.color, 0.35)} />
          <stop offset="0.6" stopColor={league.color} />
          <stop offset="1" stopColor={shade(league.color, -0.3)} />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="48" fill={`url(#${uid}-metal)`} stroke={shade(league.color, -0.35)} strokeWidth="4" />
      <circle cx="60" cy="60" r="38" fill="none" stroke={shade(league.color, -0.35)} strokeWidth="3" />
      {/* rim studs */}
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle
          key={a}
          cx={60 + 43 * Math.cos((a * Math.PI) / 180)}
          cy={60 + 43 * Math.sin((a * Math.PI) / 180)}
          r="2.6"
          fill={shade(league.color, -0.4)}
        />
      ))}
      {/* embossed star */}
      <path
        d="M60 34 l7.4 15.6 17 2.1 -12.5 11.6 3.2 16.8 -15.1 -8.4 -15.1 8.4 3.2 -16.8 -12.5 -11.6 17 -2.1 z"
        fill={lighten(league.color, 0.25)}
        stroke={shade(league.color, -0.4)}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="46" cy="30" rx="18" ry="9" fill="#ffffff" opacity="0.35" transform="rotate(-20 46 30)" />
    </g>
  )
}

function GemBadge({ rank, uid, ornate }: { rank: number; uid: string; ornate: boolean }) {
  const league = leagueByRank(rank)
  const gold = '#d5ac57'
  const gem =
    rank === 12
      ? { mid: '#3a3350', edge: league.color, hi: '#8e7bb8' }
      : { mid: lighten(league.color, 0.15), edge: shade(league.color, -0.3), hi: lighten(league.color, 0.45) }
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-gem`} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor={gem.hi} />
          <stop offset="0.55" stopColor={gem.mid} />
          <stop offset="1" stopColor={gem.edge} />
        </radialGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2d689" />
          <stop offset="1" stopColor={gold} />
        </linearGradient>
      </defs>
      {/* gold setting */}
      <circle cx="60" cy="60" r={ornate ? 52 : 48} fill={`url(#${uid}-gold)`} stroke="#b8860b" strokeWidth="4" />
      {ornate && (
        <g fill={gold} stroke="#b8860b" strokeWidth="2.5">
          {[45, 135, 225, 315].map((a) => (
            <circle
              key={a}
              cx={60 + 52 * Math.cos((a * Math.PI) / 180)}
              cy={60 + 52 * Math.sin((a * Math.PI) / 180)}
              r="6"
            />
          ))}
        </g>
      )}
      <circle cx="60" cy="60" r={ornate ? 42 : 38} fill="#8a6a3a" />
      {/* faceted gem */}
      <path
        d="M60 22 L86 40 L92 60 L78 90 L42 90 L28 60 L34 40 Z"
        fill={`url(#${uid}-gem)`}
        stroke={gem.edge}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g fill="none" stroke="#ffffff" strokeWidth="1.6" opacity="0.5" strokeLinecap="round">
        <path d="M60 22 L60 90 M34 40 L78 90 M86 40 L42 90 M28 60 L92 60" />
      </g>
      <ellipse cx="50" cy="40" rx="10" ry="6" fill="#ffffff" opacity="0.55" transform="rotate(-20 50 40)" />
      {rank === 8 && (
        <g fill="#f2d689">
          <circle cx="48" cy="66" r="2" />
          <circle cx="68" cy="54" r="1.6" />
          <circle cx="58" cy="78" r="1.8" />
          <circle cx="74" cy="70" r="1.4" />
        </g>
      )}
    </g>
  )
}

function DiamondBadge({ rank, uid }: { rank: number; uid: string }) {
  const league = leagueByRank(rank)
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-diamond`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lighten(league.color, 0.4)} />
          <stop offset="0.5" stopColor={league.color} />
          <stop offset="1" stopColor={shade(league.color, -0.15)} />
        </linearGradient>
      </defs>
      {/* laurel branches */}
      <g fill="#58cc02" stroke="#46a302" strokeWidth="1.5">
        {[0, 1, 2, 3].map((i) => (
          <ellipse key={`l${i}`} cx={16 + i * 2} cy={78 - i * 14} rx="4.5" ry="9" transform={`rotate(-30 ${16 + i * 2} ${78 - i * 14})`} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <ellipse key={`r${i}`} cx={104 - i * 2} cy={78 - i * 14} rx="4.5" ry="9" transform={`rotate(30 ${104 - i * 2} ${78 - i * 14})`} />
        ))}
      </g>
      {/* crown */}
      <path d="M40 16 l10 10 10 -12 10 12 10 -10 4 16 h-48 z" fill="#d5ac57" stroke="#b8860b" strokeWidth="2.5" strokeLinejoin="round" />
      {/* brilliant-cut diamond */}
      <path
        d="M30 46 L48 34 L72 34 L90 46 L60 96 Z"
        fill={`url(#${uid}-diamond)`}
        stroke={shade(league.color, -0.3)}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M30 46 L60 96 L48 34 M30 46 L90 46 M72 34 L60 96 M48 34 L60 46 L72 34" fill="none" stroke="#ffffff" strokeWidth="1.8" opacity="0.65" />
      <ellipse cx="48" cy="42" rx="9" ry="4" fill="#ffffff" opacity="0.8" transform="rotate(-15 48 42)" />
      {/* sparkles */}
      <g className="badge-sparkles">
        <path d="M20 30 l2.5 5 5 2.5 -5 2.5 -2.5 5 -2.5 -5 -5 -2.5 5 -2.5 z" fill="#fff7e8" stroke="#e5b400" strokeWidth="1.5" />
        <path d="M98 60 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 z" fill="#fff7e8" stroke="#e5b400" strokeWidth="1.5" />
        <path d="M92 18 l1.8 3.6 3.6 1.8 -3.6 1.8 -1.8 3.6 -1.8 -3.6 -3.6 -1.8 3.6 -1.8 z" fill="#ffc800" stroke="#e5b400" strokeWidth="1.2" />
      </g>
    </g>
  )
}

/* tiny color helpers (hex → shaded hex) */
function shade(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex)
  const t = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + f))))
  return `rgb(${t(r)},${t(g)},${t(b)})`
}
function lighten(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex)
  const t = (c: number) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * f)))
  return `rgb(${t(r)},${t(g)},${t(b)})`
}
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
