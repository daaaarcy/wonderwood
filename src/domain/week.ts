import { localDateKey } from './state'

/**
 * League weeks run Monday–Sunday in LOCAL time.
 * weekKey = ISO local date of the week's Monday (YYYY-MM-DD).
 */

/** Parse a YYYY-MM-DD key as a local date. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** ISO date key of the Monday of the week containing `d` (local time). */
export function mondayKey(d: Date): string {
  const day = d.getDay() // 0=Sun … 6=Sat
  const offset = (day + 6) % 7 // days since Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset)
  return localDateKey(monday)
}

/** ISO date key of the Sunday (last day) of the week containing `d`. */
export function sundayKey(d: Date): string {
  return localDateKey(addDays(parseDateKey(mondayKey(d)), 6))
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** Whole days between two local date keys (b - a). */
export function diffDays(aKey: string, bKey: string): number {
  return Math.round((parseDateKey(bKey).getTime() - parseDateKey(aKey).getTime()) / 86_400_000)
}

/**
 * Eligible league days inside week `weekKey`: days of that week on/after
 * `createdKey` and on/before `throughKey`. Pass the week's Sunday for a fully
 * ended week, or `today` for the in-progress week.
 */
export function eligibleDays(weekKey: string, createdKey: string, throughKey: string): number {
  const sunday = localDateKey(addDays(parseDateKey(weekKey), 6))
  const start = createdKey > weekKey ? createdKey : weekKey
  const end = throughKey < sunday ? throughKey : sunday
  const days = diffDays(start, end) + 1
  return Math.max(0, days)
}
