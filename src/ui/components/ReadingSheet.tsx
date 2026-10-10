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
          className={`btn btn-big unit-btn ${unit === 'book' ? 'btn-yes' : 'btn-neutral'}`}
          onClick={() => setUnit('book')}
        >
          <svg className="unit-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="8" y="8" width="24" height="28" rx="4" fill={unit === 'book' ? '#ffffff' : '#58b368'} />
            <rect x="12" y="12" width="16" height="4" rx="2" fill={unit === 'book' ? '#58b368' : '#ffffff'} />
            <rect x="12" y="18" width="10" height="3" rx="1.5" fill={unit === 'book' ? '#58b368' : '#ffffff'} />
          </svg>
          A book
        </button>
        <button
          className={`btn btn-big unit-btn ${unit === 'chapter' ? 'btn-yes' : 'btn-neutral'}`}
          onClick={() => setUnit('chapter')}
        >
          <svg className="unit-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="10" y="6" width="20" height="28" rx="3" fill={unit === 'chapter' ? '#ffffff' : '#9a6fe0'} />
            <path d="M22 6 v12 l4 -3 4 3 v-12" fill={unit === 'chapter' ? '#9a6fe0' : '#ffffff'} />
          </svg>
          A chapter
        </button>
      </div>
      <div className="toggle-row">
        <span>Read with a grown-up?</span>
        <button
          className={`switch ${withGrownUp ? 'on' : ''}`}
          role="switch"
          aria-checked={withGrownUp}
          onClick={() => setWithGrownUp(!withGrownUp)}
        >
          <span className="switch-knob" />
        </button>
      </div>
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
