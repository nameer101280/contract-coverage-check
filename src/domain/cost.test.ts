import { describe, expect, it } from "vitest";
import { overlapCost, spotLineCost, weightedSpotPrice } from "./cost";
import { Overlap } from "./coverage";
import { ContractLine, MarketPrice, MeterReading } from "./types";

const HOUR = 3_600_000;
const START = Date.parse("2026-09-01T00:00:00Z");

function reading(minutesIn: number, kwh: number): MeterReading {
  return {
    at: new Date(START + minutesIn * 60_000).toISOString(),
    consumptionKwh: kwh,
  };
}

function price(hoursIn: number, eurPerMwh: number): MarketPrice {
  return {
    at: new Date(START + hoursIn * HOUR).toISOString(),
    priceEurPerMwh: eurPerMwh,
  };
}

function spot(id: string, constant: number, scaling = 1): ContractLine {
  return {
    id,
    name: id,
    type: "spot",
    direction: "consumption",
    period: { from: "2026-07-01", to: "2026-12-31" },
    scaling,
    constant,
  };
}

describe("weightedSpotPrice", () => {
  it("weights each hour's price by what was consumed in it", () => {
    // 4 kWh at €100 and 4 kWh at €200: the evening-heavy household case,
    // where the plain average and the weighted one differ.
    const readings = [reading(0, 1), reading(15, 3), reading(60, 4)];
    const prices = [price(0, 100), price(1, 200)];
    expect(weightedSpotPrice(readings, prices)).toBeCloseTo(150);
  });

  it("ignores readings for hours with no price", () => {
    const readings = [reading(0, 2), reading(120, 50)];
    expect(weightedSpotPrice(readings, [price(0, 80)])).toBeCloseTo(80);
  });

  it("returns null when nothing lines up", () => {
    expect(weightedSpotPrice([], [price(0, 80)])).toBeNull();
    expect(weightedSpotPrice([reading(0, 1)], [])).toBeNull();
  });
});

describe("spotLineCost", () => {
  it("applies the line's formula to the weighted price", () => {
    const c = spotLineCost(spot("a", 9), 2000, 150);
    expect(c.eurPerMwh).toBeCloseTo(159);
    expect(c.costEur).toBeCloseTo(318);
  });

  it("applies a scaling other than one", () => {
    expect(spotLineCost(spot("a", 2, 1.05), 1000, 100).eurPerMwh).toBeCloseTo(
      107,
    );
  });
});

describe("overlapCost", () => {
  const overlap: Overlap = {
    direction: "consumption",
    period: { from: "2026-07-01", to: "2026-12-31" },
    lines: [spot("engie", 9), spot("luminus", 12)],
  };

  it("prices each competing line over the overlap's expected consumption", () => {
    const c = overlapCost(overlap, 10, 150);
    expect(c.expectedKwh).toBeCloseTo(1840);
    expect(c.lines.map((l) => l.lineId)).toEqual(["engie", "luminus"]);
    expect(c.lines[0].costEur).toBeCloseTo(1840 * 0.159);
  });

  it("reports how far apart the candidates are", () => {
    // €3/MWh apart on 1.84 MWh.
    expect(overlapCost(overlap, 10, 150).spreadEur).toBeCloseTo(5.52);
  });

  it("leaves hedges out, because they do not compete for the base price", () => {
    const withHedge: Overlap = {
      ...overlap,
      lines: [
        ...overlap.lines,
        { ...spot("h", 0), type: "hedge", hedgeVolume: 100 },
      ],
    };
    expect(overlapCost(withHedge, 10, 150).lines).toHaveLength(2);
  });
});
