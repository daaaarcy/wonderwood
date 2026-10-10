import { useEffect, useRef } from 'react'
import { badgesFor, leagueWeekStatus } from '../../domain/selectors'
import { weeklyTemplateById } from '../../data/weekly'
import type { ChildId } from '../../domain/types'
import { CHILDREN, CHILD_LIST } from '../../data/children'
import { LEAGUES, leagueTitle } from '../../data/leagues'
import { useGameState } from '../../storage/hooks'
import { LeagueBadge } from '../components/LeagueBadge'

export function LeagueScreen({ childId }: { childId: ChildId }) {
  const state = useGameState()
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const rank = child.league.rank
  const week = leagueWeekStatus(state, childId, new Date())
  const sibling = CHILD_LIST.find((c) => c.id !== childId)!
  const ladderRef = useRef<HTMLLIElement>(null)

  // keep the current league visible in the scrollable ladder
  useEffect(() => {
    ladderRef.current?.scrollIntoView({ block: 'center' })
  }, [rank])

  return (
    <div className="screen league-screen">
      <h2 className="screen-title">{def.name}&rsquo;s league</h2>
      <section className="panel league-hero">
        <LeagueBadge rank={rank} size={140} animated />
        <h2 className="league-name" style={{ color: def.darkColor }}>
          {leagueTitle(rank)}
        </h2>
        {week.restWeek ? (
          <p className="muted">Rest week — the league ladder is taking a little break.</p>
        ) : (
          <div className="league-week">
            <p>
              This week: {Math.min(week.count, week.target ?? 0)} of {week.target} quests ·{' '}
              {Math.min(week.activeDays, 3)} of 3 days
            </p>
            <div className="wish-track league-track">
              <div
                className="wish-fill"
                style={{ width: `${Math.min(100, (week.count / (week.target ?? 1)) * 100)}%` }}
              />
            </div>
            <p className="muted">Reach it for a promotion next week!</p>
          </div>
        )}
      </section>

      <section className="panel league-ladder" aria-label="League ladder">
        <ol className="ladder-list">
          {[...LEAGUES].reverse().map((league) => {
            const earned = league.rank <= rank
            const current = league.rank === rank
            return (
              <li
                key={league.rank}
                ref={current ? ladderRef : undefined}
                className={`ladder-row ${current ? 'current' : ''} ${earned ? 'earned' : 'locked'}`}
                aria-current={current ? 'true' : undefined}
              >
                <span className={earned ? '' : 'ladder-muted-badge'}>
                  <LeagueBadge rank={league.rank} size={52} />
                </span>
                <span className="ladder-name">{league.name} League</span>
                {current && <span className="tag tag-done">You are here!</span>}
              </li>
            )
          })}
        </ol>
      </section>

      <section className="panel" aria-label="My badges">
        <h3>My badges</h3>
        {badgesFor(state, childId).length === 0 ? (
          <p className="muted">Weekly challenge badges will live here!</p>
        ) : (
          <ul className="badge-list">
            {badgesFor(state, childId).map((b) => (
              <li key={b.id} className="badge-row">
                <span className="badge-medal" aria-hidden="true">🏅</span>
                <span className="badge-title">{weeklyTemplateById(b.templateId)?.title ?? 'Weekly challenge'}</span>
                <span className="muted">{new Date(b.earnedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted league-sibling">
        {sibling.name} is exploring too: <LeagueBadge rank={state.children[sibling.id].league.rank} size={28} />{' '}
        {leagueTitle(state.children[sibling.id].league.rank)}
      </p>
    </div>
  )
}
