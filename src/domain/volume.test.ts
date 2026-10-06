import { describe, expect, it } from "vitest";
import {
  hedgeCoverage,
  hoursAtPhysicalLimit,
  summariseConsumption,
  toKwh,
  toMwh,
} from "./volume";
import {
  compareToMarket,
  effectiveSpotPrice,
  summariseMarket,
} from "./market";
import { MarketPrice, MeterReading } from "./types";

/** 15-minute readings, constant value, starting at a fixed UTC midnight. */
function readings(count: number, kwhEach: number): MeterReading[] {
  const start = Date.parse("2026-09-01T00:00:00Z");
  return Array.from({ length: count }, (_, i) => ({
    at: new Date(start + i * 900_000).toISOString(),
    consumptionKwh: kwhEach,
  }));
}

describe("unit conversion", () => {
  it("converts MWh to kWh", () => {
    expect(toKwh(1, "MWh")).toBe(1000);
    expect(toKwh(0.1, "MWh")).toBe(100);
  });

  it("leaves kWh alone", () => {
    expect(toKwh(100, "kWh")).toBe(100);
  });

  it("round-trips", () => {
    expect(toMwh(toKwh(2.5, "MWh"))).toBeCloseTo(2.5);
  });
});

describe("summariseConsumption", () => {
  it("handles no readings without dividing by zero", () => {
    const s = summariseConsumption([]);
    expect(s.totalKwh).toBe(0);
    expect(s.annualisedKwh).toBe(0);
    expect(s.peakKw).toBe(0);
  });

  it("totals the readings", () => {
    // 96 intervals of 0.25 kWh = one full day at 24 kWh
    const s = summariseConsumption(readings(96, 0.25));
    expect(s.totalKwh).toBeCloseTo(24);
    expect(s.days).toBeCloseTo(1);
    expect(s.perDayKwh).toBeCloseTo(24);
    expect(s.annualisedKwh).toBeCloseTo(24 * 365);
  });

  it("converts a peak interval into power", () => {
    // 0.25 kWh in 15 minutes is an average of 1 kW across that interval
    const s = summariseConsumption(readings(96, 0.25));
    expect(s.peakKw).toBeCloseTo(1);
  });

  it("includes the final interval in the span, not just the gap", () => {
    // Two readings 15 min apart span 30 minutes of energy, not 15
    const s = summariseConsumption(readings(2, 1));
    expect(s.days).toBeCloseTo(0.5 / 24);
  });

  it("reproduces my own connection's figures", () => {
    // 634.81 kWh metered over roughly 61 days on the real Fluvius feed,
    // which annualises to about 3,800 kWh/year.
    const s = summariseConsumption(readings(61 * 96, 634.81 / (61 * 96)));
    expect(s.totalKwh).toBeCloseTo(634.81, 1);
    expect(s.annualisedKwh).toBeGreaterThan(3500);
    expect(s.annualisedKwh).toBeLessThan(4100);
  });
});

describe("hedgeCoverage", () => {
  const summary = summariseConsumption(readings(61 * 96, 634.81 / (61 * 96)));

  it("calls a 100 kWh hedge negligible on a 3,800 kWh/year connection", () => {
    // This is the case from my own session. The real form accepted it with
    // no comment.
    const c = hedgeCoverage(100, summary);
    expect(c.percentOfAnnual).toBeGreaterThan(2);
    expect(c.percentOfAnnual).toBeLessThan(3);
    expect(c.verdict).toBe("negligible");
    expect(c.equivalentDays).toBeCloseTo(9.6, 0);
  });

  it("calls a half-year hedge partial", () => {
    const c = hedgeCoverage(summary.annualisedKwh * 0.4, summary);
    expect(c.verdict).toBe("partial");
  });

  it("calls a mostly-hedged position substantial", () => {
    const c = hedgeCoverage(summary.annualisedKwh * 0.8, summary);
    expect(c.verdict).toBe("substantial");
  });

  it("flags hedging more than the connection consumes", () => {
    // Paying a fixed price for energy you will never use.
    const c = hedgeCoverage(summary.annualisedKwh * 1.5, summary);
    expect(c.verdict).toBe("exceeds");
  });

  it("returns none for a zero or missing hedge", () => {
    expect(hedgeCoverage(0, summary).verdict).toBe("none");
  });

  it("returns none when there is no consumption data to compare against", () => {
    expect(hedgeCoverage(100, summariseConsumption([])).verdict).toBe("none");
  });
});

describe("hoursAtPhysicalLimit", () => {
  it("works out how long a volume takes at full draw", () => {
    // 100 kWh on my 7.4 kW connection is about 13.5 hours at full load
    expect(hoursAtPhysicalLimit(100, 7.4)).toBeCloseTo(13.5, 1);
  });

  it("does not divide by zero", () => {
    expect(hoursAtPhysicalLimit(100, 0)).toBe(0);
  });
});

/** Hourly prices around a given average. */
function prices(values: number[]): MarketPrice[] {
  const start = Date.parse("2026-09-01T00:00:00Z");
  return values.map((v, i) => ({
    at: new Date(start + i * 3_600_000).toISOString(),
    priceEurPerMwh: v,
  }));
}

describe("summariseMarket", () => {
  it("handles no prices", () => {
    const m = summariseMarket([]);
    expect(m.averageEurPerMwh).toBe(0);
    expect(m.hours).toBe(0);
  });

  it("averages, and reports the range", () => {
    const m = summariseMarket(prices([50, 70, 90]));
    expect(m.averageEurPerMwh).toBeCloseTo(70);
    expect(m.minEurPerMwh).toBe(50);
    expect(m.maxEurPerMwh).toBe(90);
    expect(m.hours).toBe(3);
  });

  it("handles negative prices, which do occur", () => {
    // Sunny, windy, low demand: the market can pay you to consume.
    const m = summariseMarket(prices([-20, 40, 100]));
    expect(m.averageEurPerMwh).toBeCloseTo(40);
    expect(m.minEurPerMwh).toBe(-20);
  });
});

describe("compareToMarket", () => {
  const market = summariseMarket(prices([70, 72, 68, 74]));

  it("calls a price near the average plausible", () => {
    expect(compareToMarket(72, market).verdict).toBe("plausible");
  });

  it("calls my €60 hedge below market but credible", () => {
    const c = compareToMarket(60, market);
    expect(c.verdict).toBe("below-market");
    expect(c.deltaPercent).toBeCloseTo(-15.5, 0);
  });

  it("calls €5/MWh implausible", () => {
    // The value the real form accepted without comment.
    expect(compareToMarket(5, market).verdict).toBe("implausible-low");
  });

  it("calls a €600 price implausible", () => {
    // What a €/kWh-for-€/MWh mix-up looks like.
    expect(compareToMarket(600, market).verdict).toBe("implausible-high");
  });

  it("calls a 30% premium above market but credible", () => {
    expect(compareToMarket(92, market).verdict).toBe("above-market");
  });

  it("returns unset for a zero price", () => {
    expect(compareToMarket(0, market).verdict).toBe("unset");
  });

  it("returns unset when there is no market data", () => {
    expect(compareToMarket(60, summariseMarket([])).verdict).toBe("unset");
  });
});

describe("effectiveSpotPrice", () => {
  const market = summariseMarket(prices([70, 72, 68, 74]));

  it("turns 1 × spot + 9.00 into a number", () => {
    // The real form shows the formula and stops. This is what it costs.
    expect(effectiveSpotPrice(1, 9, market)).toBeCloseTo(80);
  });

  it("handles a scaling of zero as a fixed price", () => {
    // scaling 0 removes market exposure entirely
    expect(effectiveSpotPrice(0, 70, market)).toBeCloseTo(70);
  });

  it("applies a percentage scaling", () => {
    expect(effectiveSpotPrice(1.05, 2, market)).toBeCloseTo(76.55);
  });
});
