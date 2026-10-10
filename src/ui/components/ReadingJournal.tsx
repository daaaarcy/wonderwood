import { readingJournal } from '../../domain/selectors'
import type { ChildId, GameState } from '../../domain/types'

export function ReadingJournal({ state, childId }: { state: GameState; childId: ChildId }) {
  const journal = readingJournal(state, childId)
  return (
    <div className="reading-journal">
      <p className="sheet-title">My reading journal</p>
      <p className="journal-totals">
        📚 {journal.totals.books} book{journal.totals.books === 1 ? '' : 's'} · 📖{' '}
        {journal.totals.chapters} chapter{journal.totals.chapters === 1 ? '' : 's'}
      </p>
      <ul className="journal-list">
        {journal.entries.length === 0 && <li className="muted">No reading logged yet — soon!</li>}
        {journal.entries.map((e) => (
          <li key={e.claimId} className="journal-entry">
            <span>
              {e.unit === 'book' ? '📚' : '📖'} {e.title ?? (e.unit === 'book' ? 'A book' : 'A chapter')}
              {e.withGrownUp && ' · with a grown-up'}
            </span>
            <span className="muted">
              {e.date}
              {e.status === 'pending' && ' · waiting'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
