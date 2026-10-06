import { MarketPrice } from "./types";

/**
 * Market comparison.
 *
 * Companion has day-ahead prices on its Market Data page. The hedge price
 * field does not use them, which is why I was able to enter €5/MWh — roughly a
 * twentieth of any real Belgian price — and have it accepted with a formula
 * preview reading "5.00 €/MWh" as though that were normal.
 */

export interface MarketSummary {
  averageEurPerMwh: number;
  minEurPerMwh: number;
  maxEurPerMwh: number;
  hours: number;
}

export function summariseMarket(prices: MarketPrice[]): MarketSummary {
  if (prices.length === 0) {
    return {
      averageEurPerMwh: 0,
      minEurPerMwh: 0,
      maxEurPerMwh: 0,
      hours: 0,
    };
  }
  const values = prices.map((p) => p.priceEurPerMwh);
  const total = values.reduce((sum, v) => sum + v, 0);
  return {
    averageEurPerMwh: total / values.length,
    minEurPerMwh: Math.min(...values),
    maxEurPerMwh: Math.max(...values),
    hours: values.length,
  };
}

export type PriceVerdict =
  | "unset"
  | "implausible-low"
  | "below-market"
  | "plausible"
  | "above-market"
  | "implausible-high";

export interface PriceComparison {
  deltaPercent: number;
  verdict: PriceVerdict;
}

/**
 * How a fixed price compares with the recent market average.
 *
 * A hedge is meant to differ from spot — that is the entire point of buying
 * certainty — so being above or below the average is not an error. The
 * thresholds only separate "a position someone might deliberately take" from
 * "a number nobody would agree to", which in practice means a typo or a
 * confusion between €/MWh and €/kWh.
 *
 * Beyond ±60% is treated as implausible: a hedge struck a year early can
 * reasonably sit 30–40% away from today's average, but not twenty times away.
 */
export function compareToMarket(
  priceEurPerMwh: number,
  market: MarketSummary,
): PriceComparison {
  if (priceEurPerMwh <= 0 || market.averageEurPerMwh <= 0) {
    return { deltaPercent: 0, verdict: "unset" };
  }

  const deltaPercent =
    ((priceEurPerMwh - market.averageEurPerMwh) / market.averageEurPerMwh) * 100;

  let verdict: PriceVerdict;
  if (deltaPercent < -60) verdict = "implausible-low";
  else if (deltaPercent < -15) verdict = "below-market";
  else if (deltaPercent <= 15) verdict = "plausible";
  else if (deltaPercent <= 60) verdict = "above-market";
  else verdict = "implausible-high";

  return { deltaPercent, verdict };
}

/**
 * What a spot line would have cost over the sampled period.
 *
 * price = scaling × dayAhead + constant
 *
 * The real form shows "1 × spot + 9.00" and stops there, which tells you the
 * shape of the deal but not what it costs. Applying the formula to prices the
 * product already has turns notation into a number.
 */
export function effectiveSpotPrice(
  scaling: number,
  constant: number,
  market: MarketSummary,
): number {
  return scaling * market.averageEurPerMwh + constant;
}
