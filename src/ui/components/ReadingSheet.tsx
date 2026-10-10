import { useState } from 'react'
import type { ClaimDetails } from '../../domain/types'

/** Log a "I read!" — a book or a chapter, optionally with a grown-up. */
export function ReadingSheet({ onDone }: { onDone: (details: ClaimDetails) => void }) {
  const [unit, setUnit] = useState<'book' | 'chapter' | null>(null)
  const [withGrownUp, setWithGrownUp] = useState(false)
  const [title, setTitle] = useState('')
  return (
    <div className="sheet" role="dialog" aria-label="Log reading" onClick={(e) => e.stopPropagation()}>
      <p className="sheet-title">I read!</p>
      <div className="reading-units">
        <button
          className={`btn btn-big ${unit === 'book' ? 'btn-yes' : 'btn-neutral'}`}
          onClick={() => setUnit('book')}
        >
          📚 A book
        </button>
        <button
          className={`btn btn-big ${unit === 'chapter' ? 'btn-yes' : 'btn-neutral'}`}
          onClick={() => setUnit('chapter')}
        >
          📖 A chapter
        </button>
      </div>
      <label className="sound-toggle">
        <span>Read with a grown-up?</span>
        <button
          className={`btn btn-small ${withGrownUp ? 'btn-yes' : 'btn-ghost'}`}
          role="switch"
          aria-checked={withGrownUp}
          onClick={() => setWithGrownUp(!withGrownUp)}
        >
          {withGrownUp ? 'Yes' : 'No'}
        </button>
      </label>
      <input
        className="form-input"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
      />
      <button
        className="btn btn-yes"
        disabled={!unit}
        onClick={() =>
          unit &&
          onDone({ kind: 'reading', unit, title: title.trim() || undefined, withGrownUp })
        }
      >
        Done
      </button>
    </div>
  )
}
