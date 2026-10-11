import { Fragment, useEffect, useRef, useState } from 'react'
import {
  badgesFor,
  boardMovement,
  leagueWeekStatus,
  rivalNudge,
  townNews,
  weeklyLeaderboard,
} from '../../domain/selectors'
import type { LeaderboardEntry } from '../../domain/selectors'
import { addDaysKey, localDateKey, mondayKeyOf } from '../../domain/week'
import { scheduleForDate } from '../../domain/migrate'
import { weeklyTemplateById } from '../../data/weekly'
import { MedalIcon, PawIcon } from '../components/FlatIcons'
import type { ChildId, GameState } from '../../domain/types'
import { CHILDREN, CHILD_LIST } from '../../data/children'
import { LEAGUES, leagueTitle } from '../../data/leagues'
import { questById } from '../../data/quests'
import { assetUrl } from '../../game/assets'
import { useGameState } from '../../storage/hooks'
import { LeagueBadge } from '../components/LeagueBadge'
import { CharacterAvatar } from '../components/CharacterAvatar'

/** Small flat chevrons for position movement — never red, never scary. */
function MoveMark({ delta }: { delta: number }) {
  if (delta === 0) return null
  const up = delta > 0
  const n = Math.abs(delta)
  return (
    <span
      className={`board-move ${up ? 'move-up' : 'move-down'}`}
      aria-label={up ? `up ${n} places` : `down ${n} places`}
    >
      <svg viewBox="0 0 12 8" width="11" height="8" aria-hidden="true">
        {up ? (
          <path d="M1 7 L6 1 L11 7 Z" fill="#58cc02" />
        ) : (
          <path d="M1 1 L6 7 L11 1 Z" fill="#b0b0b0" />
        )}
      </svg>
      {n}
    </span>
  )
}

/** Gold/silver/bronze disc for the top 3, plain number below that. */
function PosDisc({ row }: { row: LeaderboardEntry }) {
  const medal = row.position === 1 ? 'gold' : row.position === 2 ? 'silver' : row.position === 3 ? 'bronze' : null
  return (
    <span
      className={`board-pos ${medal ? `pos-${medal}` : ''}`}
      aria-label={`position ${row.position}${row.tied ? ', tied' : ''}`}
    >
      {row.position}
      {row.tied ? '=' : ''}
    </span>
  )
}

/** One standings row: position disc + move, avatar (paw badge on friends),
 *  one-line name, league badge, compact "done/total" over pct. */
function BoardRow({
  row,
  state,
  isMe,
  showBadge,
  emptyText,
  move,
}: {
  row: LeaderboardEntry
  state: GameState
  isMe: boolean
  showBadge: boolean
  emptyText: string
  move?: number
}) {
  const scoreText =
    row.opportunities > 0 ? `${row.completed}/${row.opportunities}` : emptyText
  return (
    <li
      className={`board-row ${row.kind === 'npc' ? 'board-friend' : ''} ${isMe ? 'board-me' : ''} ${
        row.pct >= 0.7 ? 'on-track' : ''
      }`}
    >
      <span className="board-poswrap">
        <PosDisc row={row} />
        {move !== undefined && move !== 0 && <MoveMark delta={move} />}
      </span>
      <span className="board-avatarwrap">
        {row.kind === 'npc' ? (
          <>
            <img className="board-avatar" src={assetUrl(row.assetKey ?? '')} alt="" />
            <span className="paw-badge" role="img" aria-label="Storybook friend">
              <PawIcon size={9} />
            </span>
          </>
        ) : (
          <CharacterAvatar
            childId={row.id as ChildId}
            hatItemId={state.children[row.id as ChildId].equipped.hat}
            size={42}
            headOnly
          />
        )}
      </span>
      <span className="board-name">{row.name}</span>
      {showBadge && <LeagueBadge rank={row.leagueRank} size={30} />}
      <span
        className="board-score"
        aria-label={
          row.opportunities > 0 ? `${row.completed} of ${row.opportunities} quests` : emptyText
        }
      >
        <b>{scoreText}</b>
        <span className="muted">{Math.round(row.pct * 100)}%</span>
      </span>
    </li>
  )
}

export function LeagueScreen({ childId }: { childId: ChildId }) {
  const state = useGameState()
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const rank = child.league.rank
  const now = new Date()
  const week = leagueWeekStatus(state, childId, now)
  const ladderRef = useRef<HTMLLIElement>(null)
  const [lastExpanded, setLastExpanded] = useState(false)

  // this week so far + last week's final standings — all purely derived
  const todayKey = localDateKey(now, state.timeZone)
  const weekKey = mondayKeyOf(todayKey)
  const board = weeklyLeaderboard(state, weekKey, todayKey)
  const movement = boardMovement(state, weekKey, todayKey)
  const lastWeekKey = addDaysKey(weekKey, -7)
  const lastBoard = weeklyLeaderboard(state, lastWeekKey, addDaysKey(weekKey, -1))
  const news = townNews(state, todayKey)
  const nudge = rivalNudge(board, childId)

  // the dashed "on track to move up" divider sits between ≥70% rows and the rest
  const firstBelow = board.findIndex((r) => r.pct < 0.7)
  const showDivider = firstBelow > 0 && firstBelow < board.length

  // last week collapses to the podium + the child's own row
  const lastVisible = lastExpanded
    ? lastBoard
    : (() => {
        const keep = lastBoard.slice(0, 3)
        const me = lastBoard.find((r) => r.id === childId)
        if (me && !keep.includes(me)) keep.push(me)
        return keep
      })()
  const lastHidden = lastBoard.length - lastVisible.length

  // the boys' own quest icons for the "How leagues work" card
  const questIcons = [
    ...new Set(
      CHILD_LIST.flatMap((c) =>
        Object.values(scheduleForDate(state, todayKey)[c.id].core)
          .flat()
          .map((id) => questById(id)?.iconKey),
      ).filter((k): k is string => Boolean(k)),
    ),
  ]

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

      <details className="panel league-how">
        <summary>
          <span>How leagues work</span>
          <span className="how-caret" aria-hidden="true" />
        </summary>
        <div className="league-how-icons" aria-hidden="true">
          {questIcons.map((k) => (
            <span key={k} className="quest-node league-how-icon">
              <img src={assetUrl(k)} alt="" />
            </span>
          ))}
        </div>
        <ul className="league-rules">
          <li>
            Finish most of your quests — <b>at least 70%</b> — on <b>3 or more days</b> this
            week.
          </li>
          <li>
            On Sunday, you move <b>UP one league!</b>
          </li>
          <li>
            Hard week? You stay where you are — <b>you can never drop down.</b>
          </li>
        </ul>
        <p className="muted league-how-note">
          All the storybook friends play by the same rules.
        </p>
      </details>

      <section className="panel board-card" aria-label="This week's leaderboard">
        <h3>This week&rsquo;s leaderboard</h3>
        {news.length > 0 && (
          <ul className="news-strip" aria-label="Town news">
            {news.map((line) => (
              <li key={line} className="news-line">
                {line}
              </li>
            ))}
          </ul>
        )}
        <p className="board-nudge">{nudge}</p>
        <ol className="board-list">
          {board.map((row, i) => (
            <Fragment key={row.id}>
              {showDivider && i === firstBelow && (
                <li className="board-divider" role="separator" aria-hidden="true">
                  <span>On track to move up</span>
                </li>
              )}
              <BoardRow
                row={row}
                state={state}
                isMe={row.id === childId}
                showBadge
                emptyText="No quests"
                move={movement.get(row.id)}
              />
            </Fragment>
          ))}
        </ol>
        <p className="muted board-note">
          <PawIcon size={15} /> marks a storybook friend — pretend friends from the town who
          play along for fun.
        </p>
        <p className="board-cheer">Keep going, explorers!</p>
      </section>

      <section className="panel board-card board-last" aria-label="Last week's leaderboard">
        <h3>Last week</h3>
        <ol className="board-list">
          {lastVisible.map((row) => (
            <BoardRow
              key={row.id}
              row={row}
              state={state}
              isMe={row.id === childId}
              showBadge={false}
              emptyText="No quests"
            />
          ))}
        </ol>
        {lastHidden > 0 && !lastExpanded && (
          <button className="btn btn-ghost btn-small" onClick={() => setLastExpanded(true)}>
            Show all {lastBoard.length}
          </button>
        )}
        {lastExpanded && (
          <button className="btn btn-ghost btn-small" onClick={() => setLastExpanded(false)}>
            Show less
          </button>
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
                <span className="badge-medal" aria-hidden="true"><MedalIcon size={30} /></span>
                <span className="badge-title">{weeklyTemplateById(b.templateId)?.title ?? 'Weekly challenge'}</span>
                <span className="muted">{new Date(b.earnedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
