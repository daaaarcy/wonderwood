import { ChevronIcon } from './FlatIcons'
export function WordWheel({
  first,
  second,
  firstWords,
  secondWords,
  onChange,
}: {
  first: number
  second: number
  firstWords: string[]
  secondWords: string[]
  onChange: (first: number, second: number) => void
}) {
  const step = (which: 'first' | 'second', delta: number) => {
    const words = which === 'first' ? firstWords : secondWords
    const cur = which === 'first' ? first : second
    const next = (cur + delta + words.length) % words.length
    onChange(which === 'first' ? next : first, which === 'second' ? next : second)
  }
  const wheel = (which: 'first' | 'second', words: string[], cur: number) => (
    <div className="word-wheel">
      <button className="wheel-btn" onClick={() => step(which, -1)} aria-label={`Previous ${which} word`}>
        <ChevronIcon up size={18} />
      </button>
      <span className="wheel-word" data-testid={`wheel-${which}`}>
        {words[cur]}
      </span>
      <button className="wheel-btn" onClick={() => step(which, 1)} aria-label={`Next ${which} word`}>
        <ChevronIcon size={18} />
      </button>
    </div>
  )
  return (
    <div className="word-wheels">
      {wheel('first', firstWords, first)}
      {wheel('second', secondWords, second)}
    </div>
  )
}
