import { describe, expect, it } from "vitest";
import { IssueInput, collectIssues } from "./issues";
import { PricedOverlap } from "./cost";
import { ContractLine } from "./types";

function spot(id: string, from: string): ContractLine {
  return {
    id,
    name: id,
    type: "spot",
    direction: "consumption",
    period: { from, to: "2026-12-31" },
    scaling: 1,
    constant: 9,
  };
}

const hedgeLine: ContractLine = {
  id: "hedge",
  name: "hedge",
  type: "hedge",
  direction: "consumption",
  period: { from: "2026-01-01", to: "2026-12-31" },
  hedgeVolume: 100,
  hedgeVolumeUnit: "kWh",
  hedgePrice: 60,
};

const competing: PricedOverlap = {
  direction: "consumption",
  period: { from: "2026-07-01", to: "2026-12-31" },
  lines: [spot("old", "2026-01-01"), spot("new", "2026-07-01")],
  cost: null,
};

const hedgeBesideSpot: PricedOverlap = {
  direction: "consumption",
  period: { from: "2026-01-01", to: "2026-12-31" },
  lines: [spot("old", "2026-01-01"), hedgeLine],
  cost: null,
};

const calm: IssueInput = {
  overlaps: [],
  gaps: [],
  draft: { type: "spot", hedgeVolume: 100, hedgeVolumeUnit: "kWh" },
  coverage: { percentOfPeriod: 0, expectedKwh: 0, equivalentDays: 0, verdict: "none" },
  price: { deltaPercent: 0, verdict: "unset" },
  physicalLimitKw: 7.4,
};

const kinds = (input: IssueInput) => collectIssues(input).map((i) => i.kind);

describe("collectIssues", () => {
  it("returns nothing when there is nothing to look at", () => {
    expect(collectIssues(calm)).toEqual([]);
  });

  it("puts problems first, then checks, then what is normal", () => {
    expect(
      kinds({
        ...calm,
        overlaps: [hedgeBesideSpot, competing],
        draft: { type: "hedge", hedgeVolume: 100, hedgeVolumeUnit: "kWh" },
        coverage: { percentOfPeriod: 2.7, expectedKwh: 3749, equivalentDays: 9.7, verdict: "negligible" },
      }),
    ).toEqual(["competing-lines", "hedge-negligible", "hedge-beside-spot"]);
  });

  it("offers the fix for two competing spot lines", () => {
    const [issue] = collectIssues({ ...calm, overlaps: [competing] });
    expect(issue.kind === "competing-lines" && issue.ending).toEqual({
      lineId: "old",
      lastDay: "2026-06-30",
    });
  });

  it("reports a day with no price as a problem", () => {
    const gap = { direction: "consumption" as const, period: { from: "2026-01-01", to: "2026-01-31" } };
    expect(collectIssues({ ...calm, gaps: [gap] })[0]).toMatchObject({
      kind: "gap",
      severity: "problem",
    });
  });

  it("checks the hedge only when the new line is a hedge", () => {
    expect(
      kinds({
        ...calm,
        coverage: { percentOfPeriod: 200, expectedKwh: 100, equivalentDays: 1, verdict: "exceeds" },
        price: { deltaPercent: -97, verdict: "implausible-low" },
      }),
    ).toEqual([]);
  });

  it("flags a kW hedge over the physical limit instead of also calling it too big", () => {
    expect(
      kinds({
        ...calm,
        draft: { type: "hedge", hedgeVolume: 10, hedgeVolumeUnit: "kW" },
        coverage: { percentOfPeriod: 2336, expectedKwh: 1890, equivalentDays: 4000, verdict: "exceeds" },
      }),
    ).toEqual(["over-physical-limit"]);
  });

  it("flags a hedge bigger than the consumption while it applies", () => {
    expect(
      kinds({
        ...calm,
        draft: { type: "hedge", hedgeVolume: 2000, hedgeVolumeUnit: "kWh" },
        coverage: { percentOfPeriod: 105.8, expectedKwh: 1890, equivalentDays: 194, verdict: "exceeds" },
      }),
    ).toEqual(["hedge-exceeds"]);
  });

  it("flags an implausible hedge price but not a merely low one", () => {
    const hedge = { ...calm, draft: { type: "hedge" as const, hedgeVolume: 100, hedgeVolumeUnit: "kWh" as const } };
    expect(kinds({ ...hedge, price: { deltaPercent: -97, verdict: "implausible-low" } })).toEqual([
      "implausible-price",
    ]);
    expect(kinds({ ...hedge, price: { deltaPercent: -63, verdict: "below-market" } })).toEqual([]);
  });
});
