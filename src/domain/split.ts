import { daysInPeriod, findGaps, intersection } from "./coverage";
import { ContractLine, EnergyDirection, Period } from "./types";
import { toKwh } from "./volume";

/**
 * How a connection's consumption divides between its lines, month by month.
 *
 * A hedge and a spot line on the same dates are normal: the hedge fixes the
 * price of part of the volume and spot prices the rest. The real asset view
 * lists both lines and leaves the division to the reader. This works it out.
 *
 * Two assumptions, both stated where the chart is shown: consumption runs at
 * the metered daily rate all year (no seasonality), and a hedged amount is
 * spread evenly over its line's dates, which matches what my account was
 * billed.
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface MonthSplit {
  label: string;
  period: Period;
  /** Consumption at the metered daily rate */
  expectedKwh: number;
  /** Volume the hedges fix this month, even if more than is consumed */
  hedgedKwh: number;
  /** The rest of the consumption, on days a spot line prices */
  spotKwh: number;
  /** The rest of the consumption, on days no line prices */
  unpricedKwh: number;
  /** Hedged volume beyond the month's consumption: paid for, not used */
  excessKwh: number;
}

function monthPeriod(year: number, month: number): Period {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

/** Energy a hedge line fixes per day, whichever unit it was entered in. */
function hedgedPerDay(line: ContractLine): number {
  const days = daysInPeriod(line.period);
  const total = toKwh(line.hedgeVolume ?? 0, line.hedgeVolumeUnit ?? "kWh", days * 24);
  return total / days;
}

export function monthlySplit(
  lines: ContractLine[],
  perDayKwh: number,
  year: number,
  direction: EnergyDirection = "consumption",
): MonthSplit[] {
  const relevant = lines.filter((l) => l.direction === direction);
  const hedges = relevant.filter((l) => l.type === "hedge");
  const spots = relevant.filter((l) => l.type === "spot");

  return MONTH_LABELS.map((label, month) => {
    const period = monthPeriod(year, month);
    const days = daysInPeriod(period);
    const expectedKwh = perDayKwh * days;

    const hedgedKwh = hedges.reduce((sum, h) => {
      const shared = intersection(h.period, period);
      return shared ? sum + hedgedPerDay(h) * daysInPeriod(shared) : sum;
    }, 0);

    // The part of the month's consumption the hedges don't fix is priced by
    // spot on the days a spot line applies, and by nothing on the others.
    const remainder = Math.max(0, expectedKwh - hedgedKwh);
    const unpricedDays = findGaps(spots, period, direction).reduce(
      (sum, g) => sum + daysInPeriod(g.period),
      0,
    );
    const unpricedKwh = (remainder * unpricedDays) / days;

    return {
      label,
      period,
      expectedKwh,
      hedgedKwh,
      spotKwh: remainder - unpricedKwh,
      unpricedKwh,
      excessKwh: Math.max(0, hedgedKwh - expectedKwh),
    };
  });
}

export interface YearShares {
  /** Shares of the year's expected consumption, together summing to 1 */
  hedged: number;
  spot: number;
  unpriced: number;
  /** Hedged volume beyond consumption, kWh: kept apart so no share passes 100% */
  excessKwh: number;
}

export function yearShares(months: MonthSplit[]): YearShares {
  const total = months.reduce((s, m) => s + m.expectedKwh, 0);
  if (total <= 0) return { hedged: 0, spot: 0, unpriced: 0, excessKwh: 0 };

  const sum = (pick: (m: MonthSplit) => number) =>
    months.reduce((s, m) => s + pick(m), 0);

  return {
    hedged: sum((m) => Math.min(m.hedgedKwh, m.expectedKwh)) / total,
    spot: sum((m) => m.spotKwh) / total,
    unpriced: sum((m) => m.unpricedKwh) / total,
    excessKwh: sum((m) => m.excessKwh),
  };
}
