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

/**
 * A hedged volume as energy over the hedge's period.
 *
 * kWh is already energy. kW is power, and a hedge stated in kW is read the way
 * a baseload position is: that much power in every hour of the period. So the
 * two choices in one dropdown sit a factor of 8,760 apart over a year — my
 * 100 kWh hedge in kW would be 876 MWh, over two hundred times what the
 * connection uses.
 */
export function toKwh(
  value: number,
  unit: VolumeUnit,
  periodHours: number,
): number {
  return unit === "kW" ? value * periodHours : value;
}

/**
 * Whether a hedge stated as power asks for more than the connection can draw.
 *
 * This needs no meter data at all, only the limit entered in the asset
 * configuration. A kW hedge above it can never be used in full in any hour, so
 * it is not a position anyone would take on purpose. An amount in kWh has no
 * instantaneous rate, so it cannot breach the limit by itself.
 */
export function exceedsPhysicalLimit(
  value: number,
  unit: VolumeUnit,
  physicalLimitKw: number,
): boolean {
  return unit === "kW" && physicalLimitKw > 0 && value > physicalLimitKw;
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
  /** Share of the consumption expected during the hedge's own period */
  percentOfPeriod: number;
  /** Consumption expected during that period at the metered rate, kWh */
  expectedKwh: number;
  /** Roughly how many days of typical consumption the hedge covers */
  equivalentDays: number;
  verdict: CoverageVerdict;
}

const NO_COVERAGE: HedgeCoverage = {
  percentOfPeriod: 0,
  expectedKwh: 0,
  equivalentDays: 0,
  verdict: "none",
};

/**
 * How much of a connection's consumption a hedge actually covers.
 *
 * This is the number the real form cannot show, and it is the reason a 100 kWh
 * hedge on a 3,750 kWh/year connection looks reasonable when you type it.
 *
 * The comparison is against the hedge's own period, not a year. Companion
 * spreads a hedged volume evenly across the line's period: on my account the
 * 100 kWh yearly hedge was billed for 10.11 kWh between 1 September and
 * 6 October, almost exactly 100 × 37 / 365. So 2 MWh on a July–December line
 * has to be judged against six months of consumption, where it is too much,
 * rather than twelve, where it looks like half.
 *
 * The thresholds are a judgement, not a standard. "Negligible" below 5% exists
 * because a hedge that small is almost certainly a units mistake rather than a
 * deliberate position — and "exceeds" matters because hedging more than you
 * consume means paying for energy you never use.
 */
export function hedgeCoverage(
  hedgeKwh: number,
  summary: ConsumptionSummary,
  periodDays: number,
): HedgeCoverage {
  if (hedgeKwh <= 0 || periodDays <= 0 || summary.perDayKwh <= 0) {
    return { ...NO_COVERAGE };
  }

  const expectedKwh = summary.perDayKwh * periodDays;
  const percentOfPeriod = (hedgeKwh / expectedKwh) * 100;
  const equivalentDays = hedgeKwh / summary.perDayKwh;

  let verdict: CoverageVerdict;
  if (percentOfPeriod > 100) verdict = "exceeds";
  else if (percentOfPeriod < 5) verdict = "negligible";
  else if (percentOfPeriod < 60) verdict = "partial";
  else verdict = "substantial";

  return { percentOfPeriod, expectedKwh, equivalentDays, verdict };
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
