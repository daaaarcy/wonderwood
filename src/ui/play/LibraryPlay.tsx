import { useMemo, useState } from 'react'
import { readingJournal } from '../../domain/selectors'
import type { ChildId, GameState } from '../../domain/types'
import { CHILDREN } from '../../data/children'
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

export function LibraryPlay({ state }: { state: GameState; childId: ChildId }) {
  const [game, setGame] = useState(false)
  const books = CHILDREN['theodore'] && CHILDREN['leonard']
    ? readingJournal(state, 'theodore').totals.books + readingJournal(state, 'leonard').totals.books
    : 0
  const chapters = CHILDREN['theodore'] && CHILDREN['leonard']
    ? readingJournal(state, 'theodore').totals.chapters + readingJournal(state, 'leonard').totals.chapters
    : 0
  const titles = [
    ...readingJournal(state, 'theodore').entries,
    ...readingJournal(state, 'leonard').entries,
  ]

  if (game) return <WordGame onClose={() => setGame(false)} />

  return (
    <div className="library-play">
      <div className="shelf" data-testid="book-shelf">
        {books === 0 && chapters === 0 ? (
          <p className="muted shelf-empty">The shelves are waiting for your first books!</p>
        ) : (
          <div className="shelf-row">
            {Array.from({ length: Math.min(books, 24) }).map((_, i) => (
              <span
                key={`b${i}`}
                className="book-spine"
                style={{ background: SPINE_COLORS[i % SPINE_COLORS.length] }}
                title={titles.filter((t) => t.unit === 'book')[i]?.title ?? 'A book'}
              />
            ))}
            {Array.from({ length: Math.min(chapters, 24) }).map((_, i) => (
              <span key={`c${i}`} className="chapter-ribbon" title="A chapter" />
            ))}
          </div>
        )}
        <div className="shelf-board" />
      </div>
      <p className="muted">
        {books + chapters === 0
          ? 'Read books and chapters to fill the shelves!'
          : `${books} book${books === 1 ? '' : 's'} and ${chapters} chapter${chapters === 1 ? '' : 's'} on the shelf — one for every read!`}
      </p>
      <button className="btn btn-yes btn-big" onClick={() => setGame(true)}>
        Word &amp; picture game
      </button>
    </div>
  )
}
