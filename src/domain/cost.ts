import { Overlap, daysInPeriod } from "./coverage";
import { ContractLine, MarketPrice, MeterReading } from "./types";

/**
 * What a contested period would cost under each line that claims it.
 *
 * The overlap warning says two lines compete. That alone is easy to dismiss,
 * so this puts a figure on it, using only data the platform already holds:
 * the metered consumption and the day-ahead prices.
 */

/** "2026-09-01T18:15:00.000Z" → "2026-09-01T18": the hour a reading falls in. */
function hourOf(iso: string): string {
  return iso.slice(0, 13);
}

/**
 * The average day-ahead price this connection actually paid, weighting each
 * hour by how much it consumed in it.
 *
 * A plain average understates a household's price: it uses most in the
 * evening, when prices peak. On my account the cost report charged
 * €182.95/MWh while the plain average was €161.40, a gap the supplier markup
 * alone (€9 or €12) does not explain. Hours without a price are skipped
 * rather than guessed.
 */
export function weightedSpotPrice(
  readings: MeterReading[],
  prices: MarketPrice[],
): number | null {
  const byHour = new Map(prices.map((p) => [hourOf(p.at), p.priceEurPerMwh]));

  let kwh = 0;
  let eurTimesKwh = 0;
  for (const r of readings) {
    const p = byHour.get(hourOf(r.at));
    if (p === undefined) continue;
    kwh += r.consumptionKwh;
    eurTimesKwh += r.consumptionKwh * p;
  }
  return kwh > 0 ? eurTimesKwh / kwh : null;
}

export interface LineCost {
  lineId: string;
  /** The line's formula applied to the weighted price */
  eurPerMwh: number;
  costEur: number;
}

export function spotLineCost(
  line: ContractLine,
  kwh: number,
  weightedEurPerMwh: number,
): LineCost {
  const eurPerMwh =
    (line.scaling ?? 1) * weightedEurPerMwh + (line.constant ?? 0);
  return { lineId: line.id, eurPerMwh, costEur: (eurPerMwh * kwh) / 1000 };
}

/** An overlap with its estimated cost, when there is data to estimate it. */
export interface PricedOverlap extends Overlap {
  cost: OverlapCost | null;
}

export interface OverlapCost {
  /** Consumption expected during the overlap at the metered daily rate */
  expectedKwh: number;
  lines: LineCost[];
  /** Difference between the cheapest and dearest candidate */
  spreadEur: number;
}

/**
 * Each competing spot line's cost over the overlap.
 *
 * It is an estimate twice over: the volume extrapolates the metered daily rate
 * across the overlap, and the price applies the recent weighted average to
 * months that have not happened yet. Both are stated on screen. The point is
 * the order of magnitude and the gap between the candidates, not the cent.
 */
export function overlapCost(
  overlap: Overlap,
  perDayKwh: number,
  weightedEurPerMwh: number,
): OverlapCost {
  const expectedKwh = perDayKwh * daysInPeriod(overlap.period);
  const lines = overlap.lines
    .filter((l) => l.type === "spot")
    .map((l) => spotLineCost(l, expectedKwh, weightedEurPerMwh));
  const costs = lines.map((l) => l.costEur);
  const spreadEur =
    costs.length > 1 ? Math.max(...costs) - Math.min(...costs) : 0;
  return { expectedKwh, lines, spreadEur };
}
