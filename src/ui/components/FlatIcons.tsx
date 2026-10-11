/**
 * The game's flat icon language — simple rounded shapes, no outlines,
 * same palette as the explorers. Replaces every emoji in the UI.
 */
export function FlatIcon({ children, size = 24, label }: { children: React.ReactNode; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  )
}

export const MedalIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <path d="M17 6 h14 l4 12 h-22 z" fill="#1cb0f6" />
    <circle cx="24" cy="28" r="14" fill="#f2c40f" />
    <circle cx="24" cy="28" r="10" fill="#f7d94d" />
    <path d="M24 20 l2.4 5.2 5.6 .4 -4.3 3.7 1.3 5.5 -5 -3 -5 3 1.3 -5.5 -4.3 -3.7 5.6 -.4 z" fill="#e8a400" />
  </FlatIcon>
)

export const SparkleIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <path d="M24 4 q3 14 20 20 q-17 6 -20 20 q-3 -14 -20 -20 q17 -6 20 -20 z" fill="#f2c40f" />
  </FlatIcon>
)

export const HouseTagIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <path d="M8 26 L24 10 L40 26 Z" fill="#e0483e" />
    <rect x="12" y="24" width="24" height="18" rx="4" fill="#fff3e4" />
    <rect x="21" y="30" width="7" height="12" rx="3" fill="#96683f" />
    <rect x="30" y="28" width="6" height="6" rx="2" fill="#eafbff" />
  </FlatIcon>
)

export const BookIcon = ({ size = 24, color = '#58b368' }: { size?: number; color?: string }) => (
  <FlatIcon size={size}>
    <rect x="10" y="6" width="28" height="36" rx="5" fill={color} />
    <rect x="15" y="12" width="18" height="5" rx="2.5" fill="#ffffff" />
    <rect x="15" y="20" width="12" height="4" rx="2" fill="#ffffff" opacity="0.8" />
    <rect x="10" y="6" width="5" height="36" rx="2.5" fill="#3c3c3c" opacity="0.18" />
  </FlatIcon>
)

export const ChapterIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <rect x="12" y="5" width="24" height="38" rx="4" fill="#9a6fe0" />
    <path d="M28 5 v16 l4 -3 4 3 v-16" fill="#f2c40f" />
  </FlatIcon>
)

export const CheckIcon = ({ size = 24, color = '#ffffff' }: { size?: number; color?: string }) => (
  <FlatIcon size={size}>
    <path d="M12 25 l8 8 L38 13" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  </FlatIcon>
)

export const ChevronIcon = ({ size = 24, up = false }: { size?: number; up?: boolean }) => (
  <FlatIcon size={size}>
    <path
      d={up ? 'M10 30 L24 16 L38 30' : 'M10 18 L24 32 L38 18'}
      fill="none"
      stroke="#1cb0f6"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </FlatIcon>
)

export const MusicNoteIcon = ({ size = 24, color = '#9a6fe0' }: { size?: number; color?: string }) => (
  <FlatIcon size={size}>
    <ellipse cx="16" cy="36" rx="7" ry="6" fill={color} transform="rotate(-18 16 36)" />
    <rect x="21" y="8" width="5" height="26" rx="2.5" fill={color} />
    <path d="M21 8 q14 -2 16 8 q-10 -3 -16 0 z" fill={color} />
  </FlatIcon>
)

export const TeddyIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <circle cx="15" cy="13" r="7" fill="#a06a42" />
    <circle cx="33" cy="13" r="7" fill="#a06a42" />
    <circle cx="15" cy="13" r="3.4" fill="#e5b083" />
    <circle cx="33" cy="13" r="3.4" fill="#e5b083" />
    <circle cx="24" cy="22" r="14" fill="#c98a5a" />
    <ellipse cx="24" cy="40" rx="12" ry="8" fill="#c98a5a" />
    <ellipse cx="24" cy="27" rx="7" ry="5.5" fill="#e5b083" />
    <circle cx="19" cy="19" r="2.4" fill="#3c3c3c" />
    <circle cx="29" cy="19" r="2.4" fill="#3c3c3c" />
    <circle cx="24" cy="25" r="2.6" fill="#3c3c3c" />
  </FlatIcon>
)

export const BallIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <circle cx="24" cy="24" r="18" fill="#ff7b9c" />
    <path d="M24 6 v36 M8 24 h32" stroke="#ffffff" strokeWidth="4.5" fill="none" />
    <path d="M24 6 q-11 18 0 36 M24 6 q11 18 0 36" stroke="#ffffff" strokeWidth="4.5" fill="none" />
  </FlatIcon>
)

export const KiteIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <path d="M24 4 L38 22 L24 40 L10 22 Z" fill="#e0483e" />
    <path d="M24 4 L38 22 L24 22 Z" fill="#f2a24a" />
    <path d="M24 4 L24 40" stroke="#ffffff" strokeWidth="2.5" />
    <path d="M24 40 q-3 4 -8 4 M24 44 q4 2 6 -2" stroke="#96683f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </FlatIcon>
)

export const FoxIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <path d="M12 12 L18 4 L26 12 Z" fill="#ef8f1a" />
    <path d="M36 12 L30 4 L22 12 Z" fill="#ef8f1a" />
    <circle cx="24" cy="24" r="15" fill="#ef8f1a" />
    <path d="M12 30 q12 14 24 0 l-4 -8 h-16 z" fill="#fff3e4" />
    <circle cx="18.5" cy="21" r="2.6" fill="#3c3c3c" />
    <circle cx="29.5" cy="21" r="2.6" fill="#3c3c3c" />
    <ellipse cx="24" cy="29" rx="3.4" ry="2.6" fill="#3c3c3c" />
  </FlatIcon>
)

export const RabbitIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <ellipse cx="17" cy="10" rx="5" ry="9" fill="#d9d9d9" />
    <ellipse cx="31" cy="10" rx="5" ry="9" fill="#d9d9d9" />
    <ellipse cx="17" cy="11" rx="2.4" ry="6" fill="#ffb3c6" />
    <ellipse cx="31" cy="11" rx="2.4" ry="6" fill="#ffb3c6" />
    <circle cx="24" cy="27" r="14" fill="#efefef" />
    <circle cx="18.5" cy="25" r="2.4" fill="#3c3c3c" />
    <circle cx="29.5" cy="25" r="2.4" fill="#3c3c3c" />
    <ellipse cx="24" cy="31" rx="3" ry="2.2" fill="#ffb3c6" />
  </FlatIcon>
)

export const BearIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <circle cx="14" cy="14" r="6" fill="#96683f" />
    <circle cx="34" cy="14" r="6" fill="#96683f" />
    <circle cx="14" cy="14" r="2.8" fill="#c98a5a" />
    <circle cx="34" cy="14" r="2.8" fill="#c98a5a" />
    <circle cx="24" cy="25" r="15" fill="#a06a42" />
    <ellipse cx="24" cy="31" rx="7" ry="5.4" fill="#e5b083" />
    <circle cx="18.5" cy="21.5" r="2.4" fill="#3c3c3c" />
    <circle cx="29.5" cy="21.5" r="2.4" fill="#3c3c3c" />
    <ellipse cx="24" cy="28.5" rx="2.8" ry="2.2" fill="#3c3c3c" />
  </FlatIcon>
)

export const PawIcon = ({ size = 24, color = '#96683f' }: { size?: number; color?: string }) => (
  <FlatIcon size={size}>
    <ellipse cx="24" cy="31" rx="9.5" ry="7.5" fill={color} />
    <circle cx="10.5" cy="21" r="4.2" fill={color} />
    <circle cx="18" cy="14.5" r="4.2" fill={color} />
    <circle cx="30" cy="14.5" r="4.2" fill={color} />
    <circle cx="37.5" cy="21" r="4.2" fill={color} />
  </FlatIcon>
)

export const PatrolCarIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <rect x="6" y="18" width="36" height="16" rx="8" fill="#ffffff" />
    <rect x="6" y="24" width="36" height="8" fill="#1cb0f6" />
    <rect x="14" y="10" width="20" height="12" rx="6" fill="#ffffff" />
    <rect x="17" y="13" width="14" height="7" rx="3.5" fill="#eafbff" />
    <rect x="20" y="6" width="8" height="5" rx="2" fill="#e0483e" />
    <circle cx="15" cy="36" r="5" fill="#3c3c3c" />
    <circle cx="33" cy="36" r="5" fill="#3c3c3c" />
    <circle cx="15" cy="36" r="2" fill="#cfcfcf" />
    <circle cx="33" cy="36" r="2" fill="#cfcfcf" />
  </FlatIcon>
)

export const BandageIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <rect x="5" y="16" width="38" height="16" rx="8" fill="#f5bc8e" transform="rotate(-14 24 24)" />
    <rect x="18" y="17" width="12" height="10" rx="3" fill="#e5a573" transform="rotate(-14 24 24)" />
    <circle cx="16" cy="24" r="1.6" fill="#d8925f" />
    <circle cx="32" cy="21" r="1.6" fill="#d8925f" />
  </FlatIcon>
)

export const ThermoIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <rect x="20" y="6" width="8" height="24" rx="4" fill="#efefef" />
    <circle cx="24" cy="34" r="9" fill="#efefef" />
    <rect x="22.5" y="14" width="3" height="18" fill="#e0483e" />
    <circle cx="24" cy="34" r="5.5" fill="#e0483e" />
  </FlatIcon>
)

export const HeartIcon = ({ size = 24, color = '#e0483e' }: { size?: number; color?: string }) => (
  <FlatIcon size={size}>
    <path d="M24 42 q-16 -10 -16 -22 a9 9 0 0 1 16 -5 a9 9 0 0 1 16 5 q0 12 -16 22 z" fill={color} />
  </FlatIcon>
)

export const CardBackIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <rect x="6" y="4" width="36" height="40" rx="8" fill="#eafbff" />
    <path d="M24 32 q-12 -7.5 -12 -16.5 a6.8 6.8 0 0 1 12 -3.8 a6.8 6.8 0 0 1 12 3.8 q0 9 -12 16.5 z" fill="#9a6fe0" opacity="0.55" />
  </FlatIcon>
)

/** Little 3-bar badge the weekly card shows as "to earn". */
export const WeeklyBadgeIcon = ({ size = 24 }: { size?: number }) => (
  <FlatIcon size={size}>
    <circle cx="24" cy="22" r="16" fill="#eafbff" />
    <path d="M24 10 l3 6.5 7 .8 -5.3 4.6 1.6 7 -6.3 -3.8 -6.3 3.8 1.6 -7 -5.3 -4.6 7 -.8 z" fill="#f2c40f" />
    <path d="M14 40 q10 -8 20 0" stroke="#1cb0f6" strokeWidth="5" fill="none" strokeLinecap="round" />
  </FlatIcon>
)
