import {
  ContractLine,
  EnergyDirection,
  Period,
  PRICE_SETTING_TYPES,
} from "./types";

/**
 * Coverage analysis: given the lines that price an asset, find the places where
 * more than one line claims the same energy, and the places where no line
 * prices it at all.
 *
 * Companion's platform accepts both without comment. Its own primer says so:
 * "the platform will happily accept a contract whose lines double-count,
 * leave a period uncovered, or price a flow the asset doesn't have."
 *
 * On my account the overlap did not actually double the bill. The cost report
 * showed a single "Day-ahead energy" row at €182.95/MWh against a market
 * average of €161.40, which is one line plus a markup, not two. So the engine
 * resolves the conflict by using one line, and nothing says which. The risk
 * is not an inflated total but an unexplained one: the user cannot tell
 * whether they are being costed at spot + €9 or spot + €12.
 */

export interface Overlap {
  direction: EnergyDirection;
  /** The period during which more than one line applies. */
  period: Period;
  /** The lines that all apply during that period. Always length >= 2. */
  lines: ContractLine[];
}

export interface Gap {
  direction: EnergyDirection;
  period: Period;
}

/** Days, for turning a period into something a human can judge. */
const MS_PER_DAY = 86_400_000;

function toTime(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysInPeriod(period: Period): number {
  // Both ends inclusive, so a single-day period is 1 day.
  return Math.round((toTime(period.to) - toTime(period.from)) / MS_PER_DAY) + 1;
}

/**
 * Do two periods share at least one day?
 *
 * Adjacency is deliberately NOT an overlap: a contract ending 30 June and the
 * next starting 1 July is a clean handover, which is exactly what a supplier
 * switch should look like. Flagging that as a conflict would make the warning
 * useless.
 */
export function periodsIntersect(a: Period, b: Period): boolean {
  return toTime(a.from) <= toTime(b.to) && toTime(b.from) <= toTime(a.to);
}

/** The shared part of two periods, or null if they don't intersect. */
export function intersection(a: Period, b: Period): Period | null {
  if (!periodsIntersect(a, b)) return null;
  return {
    from: toTime(a.from) > toTime(b.from) ? a.from : b.from,
    to: toTime(a.to) < toTime(b.to) ? a.to : b.to,
  };
}

/**
 * Two lines conflict when all three are true:
 *   1. they move energy the same way (both consumption, or both injection)
 *   2. they both set a base price (a markup is additive, so it doesn't compete)
 *   3. their periods share at least one day
 *
 * Condition 2 is the judgement call. A hedge sitting alongside a spot line is
 * normal and intended — the hedge covers part of the volume, spot covers the
 * rest. So strictly this pair is not an error. It is flagged anyway, because
 * the user has no way to see how the volume divides between them, and that
 * ambiguity is itself the thing worth surfacing.
 */
export function linesConflict(a: ContractLine, b: ContractLine): boolean {
  if (a.id === b.id) return false;
  if (a.direction !== b.direction) return false;
  if (!PRICE_SETTING_TYPES.includes(a.type)) return false;
  if (!PRICE_SETTING_TYPES.includes(b.type)) return false;
  return periodsIntersect(a.period, b.period);
}

/**
 * Every overlap among a set of lines, grouped by the period and direction in
 * which it occurs.
 *
 * Pairs are found first, then pairs sharing the same period and direction are
 * merged, so three lines covering July all appear as one warning rather than
 * three separate pairwise ones. Three warnings saying nearly the same thing is
 * how an alert layer gets ignored.
 */
export function findOverlaps(lines: ContractLine[]): Overlap[] {
  const pairs: Overlap[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (!linesConflict(a, b)) continue;
      const shared = intersection(a.period, b.period);
      if (!shared) continue;
      pairs.push({ direction: a.direction, period: shared, lines: [a, b] });
    }
  }

  const merged: Overlap[] = [];
  for (const pair of pairs) {
    const existing = merged.find(
      (m) =>
        m.direction === pair.direction &&
        m.period.from === pair.period.from &&
        m.period.to === pair.period.to,
    );
    if (existing) {
      for (const line of pair.lines) {
        if (!existing.lines.some((l) => l.id === line.id)) {
          existing.lines.push(line);
        }
      }
    } else {
      merged.push({ ...pair, lines: [...pair.lines] });
    }
  }

  return merged.sort((a, b) => toTime(a.period.from) - toTime(b.period.from));
}

/**
 * Stretches within a window where no price-setting line applies to a direction.
 *
 * An uncovered period is arguably worse than a contested one: with a contest
 * the engine still applies some price, but here there is none, so it has
 * nothing to compute and the resulting total is quietly incomplete.
 */
export function findGaps(
  lines: ContractLine[],
  window: Period,
  direction: EnergyDirection,
): Gap[] {
  const relevant = lines
    .filter((l) => l.direction === direction)
    .filter((l) => PRICE_SETTING_TYPES.includes(l.type))
    .map((l) => intersection(l.period, window))
    .filter((p): p is Period => p !== null)
    .sort((a, b) => toTime(a.from) - toTime(b.from));

  if (relevant.length === 0) {
    return [{ direction, period: { ...window } }];
  }

  const gaps: Gap[] = [];
  let cursor = toTime(window.from);

  for (const period of relevant) {
    const start = toTime(period.from);
    if (start > cursor) {
      gaps.push({
        direction,
        period: { from: toIsoDate(cursor), to: toIsoDate(start - MS_PER_DAY) },
      });
    }
    cursor = Math.max(cursor, toTime(period.to) + MS_PER_DAY);
  }

  const windowEnd = toTime(window.to);
  if (cursor <= windowEnd) {
    gaps.push({
      direction,
      period: { from: toIsoDate(cursor), to: toIsoDate(windowEnd) },
    });
  }

  return gaps;
}

/** Position of a period within a window, as 0–1 fractions. For the timeline. */
export function periodBounds(
  period: Period,
  window: Period,
): { left: number; width: number } {
  const windowStart = toTime(window.from);
  const windowSpan = toTime(window.to) - windowStart + MS_PER_DAY;
  const left = (toTime(period.from) - windowStart) / windowSpan;
  const width = (toTime(period.to) + MS_PER_DAY - toTime(period.from)) / windowSpan;
  return {
    left: Math.max(0, Math.min(1, left)),
    width: Math.max(0, Math.min(1 - Math.max(0, left), width)),
  };
}
