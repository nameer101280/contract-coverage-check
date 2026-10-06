import { MarketPrice } from "./types";

/**
 * Market comparison.
 *
 * Companion has day-ahead prices on its Market Data page. The hedge price
 * field does not use them, which is why I was able to enter €5/MWh — about a
 * thirtieth of the Belgian average at the time — and have it accepted with a
 * formula preview reading "5.00 €/MWh" as though that were normal.
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
 * Beyond this factor from the market average, a price is treated as a mistake.
 *
 * A hedge is priced when it is signed, not today, so it can legitimately sit
 * far from the current average: my €60 hedge is 63% below September 2026's
 * €161. What the market does not do is move fivefold between signing and
 * delivery, whereas the mistakes this exists for are a dropped digit (×10) or
 * €/kWh typed into a €/MWh field (×1,000). Five sits between the two.
 */
const IMPLAUSIBLE_FACTOR = 5;

/**
 * How a fixed price compares with the recent market average.
 *
 * A hedge is meant to differ from spot — that is the entire point of buying
 * certainty — so being above or below the average is not an error. Within
 * the factor above, the difference is reported as information only. Outside
 * it, the price is flagged as a likely typo or unit confusion.
 */
export function compareToMarket(
  priceEurPerMwh: number,
  market: MarketSummary,
): PriceComparison {
  const average = market.averageEurPerMwh;
  if (priceEurPerMwh <= 0 || average <= 0) {
    return { deltaPercent: 0, verdict: "unset" };
  }

  const deltaPercent = ((priceEurPerMwh - average) / average) * 100;

  let verdict: PriceVerdict;
  if (priceEurPerMwh < average / IMPLAUSIBLE_FACTOR) verdict = "implausible-low";
  else if (priceEurPerMwh > average * IMPLAUSIBLE_FACTOR)
    verdict = "implausible-high";
  else if (deltaPercent < -15) verdict = "below-market";
  else if (deltaPercent <= 15) verdict = "plausible";
  else verdict = "above-market";

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
