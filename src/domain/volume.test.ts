import { describe, expect, it } from "vitest";
import {
  exceedsPhysicalLimit,
  hedgeCoverage,
  hoursAtPhysicalLimit,
  summariseConsumption,
  toKwh,
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

const HOURS_IN_2026 = 365 * 24;

describe("unit conversion", () => {
  it("leaves kWh alone, whatever the period", () => {
    expect(toKwh(100, "kWh", HOURS_IN_2026)).toBe(100);
  });

  it("holds kW for every hour of the period", () => {
    expect(toKwh(1, "kW", HOURS_IN_2026)).toBe(8760);
    expect(toKwh(1, "kW", 24)).toBe(24);
  });

  it("shows how far apart my hedge and its kW twin are", () => {
    // The same 100 in the same field: one dropdown apart.
    expect(toKwh(100, "kW", HOURS_IN_2026) / toKwh(100, "kWh", HOURS_IN_2026))
      .toBe(8760);
  });
});

describe("exceedsPhysicalLimit", () => {
  it("flags power the connection cannot draw", () => {
    expect(exceedsPhysicalLimit(10, "kW", 7.4)).toBe(true);
  });

  it("allows power within the limit", () => {
    expect(exceedsPhysicalLimit(5, "kW", 7.4)).toBe(false);
    expect(exceedsPhysicalLimit(7.4, "kW", 7.4)).toBe(false);
  });

  it("ignores amounts of energy, which have no instantaneous limit", () => {
    expect(exceedsPhysicalLimit(100, "kWh", 7.4)).toBe(false);
  });

  it("does not flag anything when no limit is configured", () => {
    expect(exceedsPhysicalLimit(10, "kW", 0)).toBe(false);
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
    // 369.73 kWh metered from 1 Sep to 6 Oct 2026 on the real Fluvius feed,
    // which annualises to about 3,750 kWh/year.
    const s = summariseConsumption(readings(36 * 96, 369.73 / (36 * 96)));
    expect(s.totalKwh).toBeCloseTo(369.73, 1);
    expect(s.annualisedKwh).toBeGreaterThan(3500);
    expect(s.annualisedKwh).toBeLessThan(4100);
  });
});

describe("hedgeCoverage", () => {
  const summary = summariseConsumption(readings(36 * 96, 369.73 / (36 * 96)));
  const YEAR = 365;
  const JULY_TO_DECEMBER = 184;

  it("calls my 100 kWh full-year hedge negligible", () => {
    // This is the case from my own session. The real form accepted it with
    // no comment.
    const c = hedgeCoverage(100, summary, YEAR);
    expect(c.percentOfPeriod).toBeGreaterThan(2);
    expect(c.percentOfPeriod).toBeLessThan(3);
    expect(c.verdict).toBe("negligible");
    expect(c.equivalentDays).toBeCloseTo(9.7, 0);
  });

  it("judges a hedge against its own period, not a whole year", () => {
    // 2 MWh is half a year's consumption, but more than this connection uses
    // between July and December.
    expect(hedgeCoverage(2000, summary, YEAR).verdict).toBe("partial");

    const halfYear = hedgeCoverage(2000, summary, JULY_TO_DECEMBER);
    expect(halfYear.expectedKwh).toBeCloseTo(summary.perDayKwh * 184);
    expect(halfYear.percentOfPeriod).toBeGreaterThan(100);
    expect(halfYear.verdict).toBe("exceeds");
  });

  it("calls a 40% hedge partial", () => {
    const c = hedgeCoverage(summary.perDayKwh * YEAR * 0.4, summary, YEAR);
    expect(c.verdict).toBe("partial");
  });

  it("calls a mostly-hedged position substantial", () => {
    const c = hedgeCoverage(summary.perDayKwh * YEAR * 0.8, summary, YEAR);
    expect(c.verdict).toBe("substantial");
  });

  it("flags hedging more than the connection consumes", () => {
    // Paying a fixed price for energy you will never use.
    const c = hedgeCoverage(summary.perDayKwh * YEAR * 1.5, summary, YEAR);
    expect(c.verdict).toBe("exceeds");
  });

  it("puts my hedge in kW at over two hundred times my yearly use", () => {
    const c = hedgeCoverage(toKwh(100, "kW", HOURS_IN_2026), summary, YEAR);
    expect(c.percentOfPeriod).toBeGreaterThan(20_000);
    expect(c.verdict).toBe("exceeds");
  });

  it("returns none for a zero or missing hedge", () => {
    expect(hedgeCoverage(0, summary, YEAR).verdict).toBe("none");
  });

  it("returns none for a period with no days in it", () => {
    expect(hedgeCoverage(100, summary, 0).verdict).toBe("none");
  });

  it("returns none when there is no consumption data to compare against", () => {
    expect(
      hedgeCoverage(100, summariseConsumption([]), YEAR).verdict,
    ).toBe("none");
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

  describe("at the real September 2026 price level", () => {
    // Belgian day-ahead averaged €161.40/MWh from 1 Sep to 6 Oct 2026.
    const today = summariseMarket(prices([161.4]));

    it("does not flag my €60 hedge, which may simply be older", () => {
      const c = compareToMarket(60, today);
      expect(c.deltaPercent).toBeCloseTo(-62.8, 0);
      expect(c.verdict).toBe("below-market");
    });

    it("still flags the €5 the real form accepted", () => {
      expect(compareToMarket(5, today).verdict).toBe("implausible-low");
    });

    it("flags a €/kWh price typed into a €/MWh field", () => {
      expect(compareToMarket(0.06, today).verdict).toBe("implausible-low");
    });

    it("flags a price more than five times the market", () => {
      expect(compareToMarket(900, today).verdict).toBe("implausible-high");
    });
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
