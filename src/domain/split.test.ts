import { describe, expect, it } from "vitest";
import { monthlySplit, yearShares } from "./split";
import { ContractLine } from "./types";

function spot(from: string, to: string): ContractLine {
  return {
    id: `spot-${from}`,
    name: "spot",
    type: "spot",
    direction: "consumption",
    period: { from, to },
    scaling: 1,
    constant: 9,
  };
}

function hedge(
  volume: number,
  from: string,
  to: string,
  unit: "kWh" | "kW" = "kWh",
): ContractLine {
  return {
    id: `hedge-${from}-${volume}`,
    name: "hedge",
    type: "hedge",
    direction: "consumption",
    period: { from, to },
    hedgeVolume: volume,
    hedgeVolumeUnit: unit,
    hedgePrice: 60,
  };
}

const YEAR = [spot("2026-01-01", "2026-12-31")];

describe("monthlySplit", () => {
  it("returns the twelve months of the year", () => {
    const s = monthlySplit(YEAR, 10, 2026);
    expect(s.map((m) => m.label)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
    expect(s[1].expectedKwh).toBe(280);
  });

  it("spreads a kWh hedge evenly over its own dates", () => {
    const jan = monthlySplit([...YEAR, hedge(100, "2026-01-01", "2026-12-31")], 10, 2026)[0];
    expect(jan.hedgedKwh).toBeCloseTo((100 * 31) / 365);
    expect(jan.spotKwh).toBeCloseTo(310 - (100 * 31) / 365);
    expect(jan.excessKwh).toBe(0);
  });

  it("shows a hedge bigger than the months it covers as excess", () => {
    const s = monthlySplit([...YEAR, hedge(2000, "2026-07-01", "2026-12-31")], 10, 2026);
    expect(s[0].hedgedKwh).toBe(0);
    expect(s[6].hedgedKwh).toBeCloseTo((2000 * 31) / 184);
    expect(s[6].spotKwh).toBe(0);
    expect(s[6].excessKwh).toBeCloseTo((2000 * 31) / 184 - 310);
  });

  it("holds a kW hedge for every hour", () => {
    const jan = monthlySplit([...YEAR, hedge(1, "2026-01-01", "2026-12-31", "kW")], 100, 2026)[0];
    expect(jan.hedgedKwh).toBeCloseTo(24 * 31);
  });

  it("leaves days that no line prices as unpriced", () => {
    // Spot only from 15 July: 17 of July's 31 days are priced.
    const s = monthlySplit([spot("2026-07-15", "2026-12-31")], 10, 2026);
    expect(s[0].unpricedKwh).toBe(310);
    expect(s[6].spotKwh).toBeCloseTo(170);
    expect(s[6].unpricedKwh).toBeCloseTo(140);
  });

  it("ignores lines for the other direction", () => {
    const injection = { ...hedge(5000, "2026-01-01", "2026-12-31"), direction: "injection" as const };
    expect(monthlySplit([...YEAR, injection], 10, 2026)[0].hedgedKwh).toBe(0);
  });
});

describe("yearShares", () => {
  it("gives the year's split as shares of expected consumption", () => {
    const shares = yearShares(
      monthlySplit([...YEAR, hedge(100, "2026-01-01", "2026-12-31")], 10, 2026),
    );
    expect(shares.hedged).toBeCloseTo(100 / 3650);
    expect(shares.spot).toBeCloseTo(1 - 100 / 3650);
    expect(shares.unpriced).toBe(0);
    expect(shares.excessKwh).toBe(0);
  });

  it("counts excess separately instead of letting the hedged share pass 100%", () => {
    const shares = yearShares(
      monthlySplit([...YEAR, hedge(2000, "2026-07-01", "2026-12-31")], 10, 2026),
    );
    expect(shares.hedged).toBeCloseTo(1840 / 3650);
    expect(shares.excessKwh).toBeCloseTo(160);
  });
});
