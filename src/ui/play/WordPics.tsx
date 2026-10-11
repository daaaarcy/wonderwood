import type { WordId } from '../../data/words'

export function WordPic({ id, size = 64 }: { id: WordId; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 64 64' }
  switch (id) {
    case 'cat':
      return (
        <svg {...s} aria-hidden="true">
          <path d="M16 26 L20 10 L30 20 Z" fill="#f2a24a" />
          <path d="M48 26 L44 10 L34 20 Z" fill="#f2a24a" />
          <circle cx="32" cy="36" r="18" fill="#f2a24a" />
          <circle cx="26" cy="34" r="3" fill="#3c3c3c" />
          <circle cx="38" cy="34" r="3" fill="#3c3c3c" />
          <path d="M30 41 q2 2 4 0" stroke="#3c3c3c" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M8 38 h10 M8 44 h10 M46 38 h10 M46 44 h10" stroke="#3c3c3c" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...s} aria-hidden="true">
          <circle cx="32" cy="32" r="14" fill="#f2c40f" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2
            return (
              <rect
                key={i}
                x="30"
                y="4"
                width="4"
                height="10"
                rx="2"
                fill="#f2c40f"
                transform={`rotate(${(a * 180) / Math.PI} 32 32)`}
              />
            )
          })}
        </svg>
      )
    case 'tree':
      return (
        <svg {...s} aria-hidden="true">
          <rect x="28" y="34" width="8" height="22" rx="3" fill="#96683f" />
          <circle cx="32" cy="24" r="16" fill="#58cc02" />
          <circle cx="20" cy="30" r="10" fill="#58cc02" />
          <circle cx="44" cy="30" r="10" fill="#58cc02" />
        </svg>
      )
    case 'bus':
      return (
        <svg {...s} aria-hidden="true">
          <rect x="8" y="16" width="48" height="30" rx="8" fill="#f2c40f" />
          <rect x="14" y="22" width="12" height="10" rx="3" fill="#eafbff" />
          <rect x="30" y="22" width="12" height="10" rx="3" fill="#eafbff" />
          <rect x="46" y="22" width="6" height="10" rx="3" fill="#eafbff" />
          <circle cx="20" cy="48" r="6" fill="#3c3c3c" />
          <circle cx="44" cy="48" r="6" fill="#3c3c3c" />
        </svg>
      )
    case 'fish':
      return (
        <svg {...s} aria-hidden="true">
          <path d="M12 32 Q26 18 42 32 Q26 46 12 32 Z" fill="#1cb0f6" />
          <path d="M42 32 L54 24 L54 40 Z" fill="#1cb0f6" />
          <circle cx="22" cy="30" r="2.6" fill="#3c3c3c" />
          <path d="M30 40 q6 -2 8 -8" stroke="#eafbff" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      )
    case 'star':
      return (
        <svg {...s} aria-hidden="true">
          <path d="M32 8 L38.9 24.2 L56 25.5 L43.2 37 L47 54 L32 45 L17 54 L20.8 37 L8 25.5 L25.1 24.2 Z" fill="#f2c40f" />
        </svg>
      )
    case 'house':
      return (
        <svg {...s} aria-hidden="true">
          <rect x="14" y="30" width="36" height="26" rx="4" fill="#fff3e4" />
          <path d="M8 32 L32 12 L56 32 Z" fill="#e0483e" />
          <rect x="28" y="40" width="8" height="16" rx="2" fill="#96683f" />
          <rect x="20" y="38" width="8" height="8" rx="2" fill="#eafbff" />
          <rect x="38" y="38" width="8" height="8" rx="2" fill="#eafbff" />
        </svg>
      )
    case 'ball':
      return (
        <svg {...s} aria-hidden="true">
          <circle cx="32" cy="32" r="20" fill="#ff7b9c" />
          <path d="M12 32 h40" stroke="#ffffff" strokeWidth="5" />
          <path d="M32 12 q-10 20 0 40 M32 12 q10 20 0 40" stroke="#ffffff" strokeWidth="5" fill="none" />
        </svg>
      )
    case 'apple':
      return (
        <svg {...s} aria-hidden="true">
          <path d="M32 20 Q44 14 50 26 Q56 40 44 50 Q38 56 32 52 Q26 56 20 50 Q8 40 14 26 Q20 14 32 20 Z" fill="#e0483e" />
          <rect x="30" y="10" width="4" height="10" rx="2" fill="#96683f" />
          <path d="M34 14 q8 -6 12 0 q-8 4 -12 0" fill="#58cc02" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...s} aria-hidden="true">
          {/* crescent: full disc with a second disc punched out via even-odd */}
          <path
            fill="#f2c40f"
            fillRule="evenodd"
            d="M6 32 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0 M21 25 a21 21 0 1 0 42 0 a21 21 0 1 0 -42 0"
          />
        </svg>
      )
  }
}
