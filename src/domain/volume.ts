import { MeterReading, VolumeUnit } from "./types";

/**
 * Volume reasoning.
 *
 * Companion's hedge form asks for a volume in "kW or kWh" and a price in
 * €/MWh — three units, two of them a factor of 1,000 apart, on adjacent
 * fields. It shows neither the connection's physical limit nor its metered
 * consumption, both of which it holds.
 *
 * Everything here converts to kWh first and stays there.
 */

export function toKwh(value: number, unit: VolumeUnit): number {
  return unit === "MWh" ? value * 1000 : value;
}

export function toMwh(valueKwh: number): number {
  return valueKwh / 1000;
}

export interface ConsumptionSummary {
  /** Total metered consumption across the readings, kWh */
  totalKwh: number;
  /** How many whole days the readings span */
  days: number;
  /** Mean consumption per day, kWh */
  perDayKwh: number;
  /** Extrapolated to a year, kWh */
  annualisedKwh: number;
  /** Highest single interval, expressed as power in kW */
  peakKw: number;
}

/**
 * Summarise a set of meter readings.
 *
 * Annualising from a short window is an extrapolation, not a measurement, and
 * the UI says so. It is still far more useful than the nothing the real form
 * offers: knowing the order of magnitude is what makes a hedge volume
 * judgeable.
 *
 * Interval length is inferred from the gap between the first two readings
 * rather than assumed to be 15 minutes, since granularity is configurable per
 * asset in Companion.
 */
export function summariseConsumption(
  readings: MeterReading[],
): ConsumptionSummary {
  if (readings.length === 0) {
    return {
      totalKwh: 0,
      days: 0,
      perDayKwh: 0,
      annualisedKwh: 0,
      peakKw: 0,
    };
  }

  const totalKwh = readings.reduce((sum, r) => sum + r.consumptionKwh, 0);

  const first = Date.parse(readings[0].at);
  const last = Date.parse(readings[readings.length - 1].at);
  const intervalMs =
    readings.length > 1 ? Date.parse(readings[1].at) - first : 900_000;

  // Span includes the final interval itself, not just the gap to its start.
  const spanMs = last - first + intervalMs;
  const days = spanMs / 86_400_000;

  const maxIntervalKwh = readings.reduce(
    (max, r) => Math.max(max, r.consumptionKwh),
    0,
  );
  // kWh in an interval → average kW across it.
  const intervalHours = intervalMs / 3_600_000;
  const peakKw = intervalHours > 0 ? maxIntervalKwh / intervalHours : 0;

  const perDayKwh = days > 0 ? totalKwh / days : 0;

  return {
    totalKwh,
    days,
    perDayKwh,
    annualisedKwh: perDayKwh * 365,
    peakKw,
  };
}

export type CoverageVerdict =
  | "none"
  | "negligible"
  | "partial"
  | "substantial"
  | "exceeds";

export interface HedgeCoverage {
  percentOfAnnual: number;
  /** Roughly how many days of typical consumption the hedge covers */
  equivalentDays: number;
  verdict: CoverageVerdict;
}

/**
 * How much of a connection's consumption a hedge actually covers.
 *
 * This is the number the real form cannot show, and it is the reason a 100 kWh
 * hedge on a 4,000 kWh/year connection looks reasonable when you type it.
 *
 * The thresholds are a judgement, not a standard. "Negligible" below 5% exists
 * because a hedge that small is almost certainly a units mistake rather than a
 * deliberate position — and "exceeds" matters because hedging more than you
 * consume means paying for energy you never use.
 */
export function hedgeCoverage(
  hedgeKwh: number,
  summary: ConsumptionSummary,
): HedgeCoverage {
  if (hedgeKwh <= 0) {
    return { percentOfAnnual: 0, equivalentDays: 0, verdict: "none" };
  }
  if (summary.annualisedKwh <= 0) {
    return { percentOfAnnual: 0, equivalentDays: 0, verdict: "none" };
  }

  const percentOfAnnual = (hedgeKwh / summary.annualisedKwh) * 100;
  const equivalentDays =
    summary.perDayKwh > 0 ? hedgeKwh / summary.perDayKwh : 0;

  let verdict: CoverageVerdict;
  if (percentOfAnnual > 100) verdict = "exceeds";
  else if (percentOfAnnual < 5) verdict = "negligible";
  else if (percentOfAnnual < 60) verdict = "partial";
  else verdict = "substantial";

  return { percentOfAnnual, equivalentDays, verdict };
}

/**
 * Hours it would take to consume a volume at the connection's physical limit.
 *
 * A second sanity check that needs no meter data at all — only the limit the
 * user typed into the asset configuration, on a screen whose own help text says
 * it is used for "validating that your energy flows stay within the physical
 * boundaries of your installation."
 */
export function hoursAtPhysicalLimit(
  volumeKwh: number,
  physicalLimitKw: number,
): number {
  if (physicalLimitKw <= 0) return 0;
  return volumeKwh / physicalLimitKw;
}
