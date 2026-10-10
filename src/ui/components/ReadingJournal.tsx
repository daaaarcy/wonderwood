import { readingJournal } from '../../domain/selectors'
import type { ChildId, GameState } from '../../domain/types'
import { BookIcon, ChapterIcon } from './FlatIcons'

export function ReadingJournal({ state, childId }: { state: GameState; childId: ChildId }) {
  const journal = readingJournal(state, childId)
  return (
    <div className="reading-journal">
      <p className="sheet-title">My reading journal</p>
      <p className="journal-totals">
        <BookIcon size={20} /> {journal.totals.books} book{journal.totals.books === 1 ? '' : 's'} ·{' '}
        <ChapterIcon size={20} /> {journal.totals.chapters} chapter
        {journal.totals.chapters === 1 ? '' : 's'}
      </p>
      <ul className="journal-list">
        {journal.entries.length === 0 && <li className="muted">No reading logged yet — soon!</li>}
        {journal.entries.map((e) => (
          <li key={e.claimId} className="journal-entry">
            <span>
              {e.unit === 'book' ? <BookIcon size={18} /> : <ChapterIcon size={18} />}{' '}
              {e.title ?? (e.unit === 'book' ? 'A book' : 'A chapter')}
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
