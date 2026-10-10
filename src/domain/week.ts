/**
 * Date helpers for the game calendar.
 *
 * Everything is expressed as local date keys ('YYYY-MM-DD') in the family's
 * IANA time zone — NOT the server's zone. Key arithmetic is timezone-free
 * (a calendar date has the same weekday everywhere), so week math below is
 * pure string/UTC-noon math and never touches the process zone.
 */

/** Local YYYY-MM-DD for an instant in a given IANA time zone. */
export function localDateKey(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Weekday of a calendar date key: 0=Sun … 6=Sat. */
export function weekdayOf(key: string): number {
  // UTC noon keeps the weekday unambiguous; calendar dates agree everywhere.
  return new Date(`${key}T12:00:00Z`).getUTCDay()
}

/** key + n days → key */
export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** ISO date key of the Monday of the week containing `key`. */
export function mondayKeyOf(key: string): string {
  return addDaysKey(key, -((weekdayOf(key) + 6) % 7))
}

/** ISO date key of the Sunday of the week containing `key`. */
export function sundayKeyOf(key: string): string {
  return addDaysKey(mondayKeyOf(key), 6)
}

/** Whole days between two date keys (b - a). */
export function diffDays(aKey: string, bKey: string): number {
  return Math.round((Date.parse(`${bKey}T00:00:00Z`) - Date.parse(`${aKey}T00:00:00Z`)) / 86_400_000)
}

/**
 * Eligible league days inside week `weekKey`: days of that week on/after
 * `createdKey` and on/before `throughKey`. Pass the week's Sunday for a fully
 * ended week, or `today` for the in-progress week.
 */
export function eligibleDays(weekKey: string, createdKey: string, throughKey: string): number {
  const sunday = addDaysKey(weekKey, 6)
  const start = createdKey > weekKey ? createdKey : weekKey
  const end = throughKey < sunday ? throughKey : sunday
  return Math.max(0, diffDays(start, end) + 1)
}
