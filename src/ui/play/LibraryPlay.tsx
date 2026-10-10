import { useMemo, useState } from 'react'
import { readingJournal } from '../../domain/selectors'
import type { ChildId, GameState } from '../../domain/types'
import { WordPic } from './WordPics'
import { WORDS, type WordId } from '../../data/words'

function speak(text: string) {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.9
      u.pitch = 1.1
      window.speechSynthesis.speak(u)
    }
  } catch {
    // no speech — the word is still readable
  }
}

/** Shuffle a copy (stable per render via useMemo in caller). */
function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let x = seed || 1
  for (let i = a.length - 1; i > 0; i -= 1) {
    x = (x * 48271) % 2147483647
    const j = x % (i + 1)
    ;[a[i], a[j]] = [a[j] ?? (0 as unknown as T), a[i] ?? (0 as unknown as T)]
  }
  return a
}

const SPINE_COLORS = ['#e0483e', '#ef8f1a', '#f2c40f', '#58b368', '#4a9ede', '#9a6fe0', '#ff7b9c']

/** Word & picture — 3 rounds matching the picture to its word. For fun only. */
function WordGame({ onClose }: { onClose: () => void }) {
  const [round, setRound] = useState(0)
  const [picked, setPicked] = useState<WordId | null>(null)
  const rounds = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => {
        const word = WORDS[(i * 4 + 1) % WORDS.length] as WordId
        const others = shuffled(
          WORDS.filter((w) => w !== word),
          i * 13 + 5,
        ).slice(0, 2)
        return { word, choices: shuffled([word, ...others], i * 29 + 7) }
      }),
    [],
  )
  const cur = rounds[round] ?? rounds[0]
  if (!cur) return null

  const pick = (w: WordId) => {
    if (picked === cur.word) return
    if (w !== cur.word) {
      setPicked(w)
      speak('Try again!')
      return
    }
    setPicked(w)
    speak(cur.word)
    setTimeout(() => {
      if (round >= rounds.length - 1) onClose()
      else {
        setRound(round + 1)
        setPicked(null)
      }
    }, 900)
  }

  return (
    <div className="word-game" data-testid="word-game">
      <p className="play-step">Round {round + 1} of {rounds.length}</p>
      <button className="word-pic" onClick={() => speak(cur.word)} aria-label={`Hear the word: ${cur.word}`}>
        <WordPic id={cur.word} size={84} />
        <span className="word-hear">Tap to hear</span>
      </button>
      <div className="word-choices">
        {cur.choices.map((w) => (
          <button
            key={w}
            className={`btn btn-big ${picked === w ? (w === cur.word ? 'btn-yes' : 'btn-ghost') : 'btn-neutral'}`}
            onClick={() => pick(w)}
          >
            {w}
          </button>
        ))}
      </div>
      {picked === cur.word && <p className="cheer-note">{cur.word}! Lovely matching!</p>}
    </div>
  )
}

/** The cozy library interior — shelves fill up with the family's reading. */
function LibraryRoom({ books, chapters }: { books: number; chapters: number }) {
  const PER_ROW = 8
  const items = [
    ...Array.from({ length: Math.min(books, 32) }, (_, i) => ({ kind: 'book' as const, i })),
    ...Array.from({ length: Math.min(chapters, 8) }, (_, i) => ({ kind: 'chapter' as const, i })),
  ]
  const shelfX = 214
  const rowH = 56
  const shelfRowYs = [36, 92, 148, 204] // bottom of each row's books
  return (
    <svg className="library-room" viewBox="0 0 560 340" aria-hidden="true">
      {/* wall + floor */}
      <rect width="560" height="340" fill="#fff3e0" />
      <rect y="262" width="560" height="78" fill="#e5c49b" />
      {/* reading rug */}
      <ellipse cx="430" cy="296" rx="110" ry="26" fill="#ff9fb8" />
      <ellipse cx="430" cy="296" rx="78" ry="18" fill="#ffc3d4" />
      {/* window */}
      <rect x="30" y="34" width="96" height="90" rx="12" fill="#eafbff" />
      <rect x="30" y="34" width="96" height="90" rx="12" fill="none" stroke="#c98a5a" strokeWidth="6" />
      <line x1="78" y1="34" x2="78" y2="124" stroke="#c98a5a" strokeWidth="4" />
      <circle cx="56" cy="58" r="13" fill="#f2c40f" />
      <circle cx="98" cy="82" r="10" fill="#ffffff" opacity="0.85" />
      <circle cx="112" cy="88" r="7" fill="#ffffff" opacity="0.85" />
      {/* lamp */}
      <rect x="146" y="176" width="8" height="90" rx="4" fill="#96683f" />
      <path d="M150 122 q-28 0 -28 40 h56 q0 -40 -28 -40 z" fill="#f2c40f" />
      <ellipse cx="150" cy="270" rx="24" ry="6" fill="#96683f" />
      {/* beanbag */}
      <path d="M410 250 q-44 6 -52 42 q40 22 96 8 q14 -34 -12 -48 q-16 -6 -32 -2 z" fill="#9a6fe0" />
      {/* the big bookshelf */}
      <rect x="206" y="22" width="330" height="248" rx="10" fill="#a06a42" />
      <rect x="214" y="30" width="314" height="232" rx="6" fill="#c98a5a" />
      {shelfRowYs.map((y, i) => (
        <rect key={i} x="214" y={y + rowH - 6} width="314" height="7" rx="3" fill="#a06a42" />
      ))}
      {/* books + chapter bookmarks on the shelves */}
      {items.map((it, i) => {
        const col = i % PER_ROW
        const row = Math.floor(i / PER_ROW)
        const baseY = (shelfRowYs[row] ?? 204) + rowH - 6
        const x = shelfX + 8 + col * 38
        if (it.kind === 'chapter') {
          return (
            <path
              key={`c${i}`}
              className="chapter-ribbon"
              d={`M${x} ${baseY - 30} h14 v30 l-7 -7 -7 7 z`}
              fill="#f2c40f"
            />
          )
        }
        const h = 30 + ((i * 7) % 3) * 8
        return (
          <rect
            key={`b${i}`}
            className="book-spine"
            x={x}
            y={baseY - h}
            width="20"
            height={h}
            rx="3"
            fill={SPINE_COLORS[i % SPINE_COLORS.length]}
          />
        )
      })}
    </svg>
  )
}

export function LibraryPlay({ state }: { state: GameState; childId: ChildId }) {
  const [game, setGame] = useState(false)
  const books = readingJournal(state, 'theodore').totals.books + readingJournal(state, 'leonard').totals.books
  const chapters = readingJournal(state, 'theodore').totals.chapters + readingJournal(state, 'leonard').totals.chapters
  const empty = books + chapters === 0

  if (game) return <WordGame onClose={() => setGame(false)} />

  return (
    <div className="library-play">
      <div className="library-scene" data-testid="book-shelf">
        <LibraryRoom books={books} chapters={chapters} />
        {empty && <p className="shelf-message">Your reading will fill these shelves!</p>}
      </div>
      {!empty && (
        <p className="muted">
          {books} book{books === 1 ? '' : 's'} and {chapters} chapter{chapters === 1 ? '' : 's'} on the shelf!
        </p>
      )}
      <button className="btn btn-yes btn-big" onClick={() => setGame(true)}>
        Word &amp; picture game
      </button>
    </div>
  )
}
