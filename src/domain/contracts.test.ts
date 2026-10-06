import { describe, expect, it } from "vitest";
import { contractOf, dayBefore, endContract, suggestEnding } from "./contracts";
import { Overlap } from "./coverage";
import { Contract, ContractLine } from "./types";

function spot(id: string, from: string, to: string): ContractLine {
  return {
    id,
    name: id,
    type: "spot",
    direction: "consumption",
    period: { from, to },
    scaling: 1,
    constant: 9,
  };
}

const engie: Contract = {
  id: "engie",
  name: "Engie supply 2026",
  period: { from: "2026-01-01", to: "2026-12-31" },
  lines: [
    spot("engie-spot", "2026-01-01", "2026-12-31"),
    {
      id: "engie-hedge",
      name: "Hedge",
      type: "hedge",
      direction: "consumption",
      period: { from: "2026-01-01", to: "2026-12-31" },
      hedgeVolume: 100,
      hedgeVolumeUnit: "kWh",
      hedgePrice: 60,
    },
  ],
};

describe("dayBefore", () => {
  it("steps back one day, across months and years", () => {
    expect(dayBefore("2026-07-01")).toBe("2026-06-30");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });

  it("knows about leap years", () => {
    expect(dayBefore("2028-03-01")).toBe("2028-02-29");
  });
});

describe("contractOf", () => {
  it("finds the contract a line belongs to", () => {
    expect(contractOf([engie], "engie-hedge")?.name).toBe("Engie supply 2026");
    expect(contractOf([engie], "nope")).toBeUndefined();
  });
});

describe("endContract", () => {
  const ended = endContract(engie, "2026-06-30");

  it("ends the contract and every line still running on that day", () => {
    expect(ended.period.to).toBe("2026-06-30");
    expect(ended.lines.map((l) => l.period.to)).toEqual([
      "2026-06-30",
      "2026-06-30",
    ]);
  });

  it("keeps only the part of a kWh hedge that falls before the end", () => {
    // The amount is spread evenly over the year, so 181 of 365 days remain.
    const hedge = ended.lines.find((l) => l.id === "engie-hedge");
    expect(hedge?.hedgeVolume).toBeCloseTo((100 * 181) / 365);
  });

  it("leaves a kW hedge alone, because power is per hour, not per period", () => {
    const kw: Contract = {
      ...engie,
      lines: [{ ...engie.lines[1], hedgeVolume: 5, hedgeVolumeUnit: "kW" }],
    };
    expect(endContract(kw, "2026-06-30").lines[0].hedgeVolume).toBe(5);
  });

  it("drops lines that would not have started yet", () => {
    const later: Contract = {
      ...engie,
      lines: [...engie.lines, spot("autumn", "2026-09-01", "2026-12-31")],
    };
    expect(endContract(later, "2026-06-30").lines.map((l) => l.id)).toEqual([
      "engie-spot",
      "engie-hedge",
    ]);
  });

  it("does not stretch lines that already end earlier", () => {
    const short: Contract = {
      ...engie,
      lines: [spot("spring", "2026-01-01", "2026-03-31")],
    };
    expect(endContract(short, "2026-06-30").lines[0].period.to).toBe(
      "2026-03-31",
    );
  });

  it("does not change the contract it was given", () => {
    const before = JSON.stringify(engie);
    endContract(engie, "2026-06-30");
    expect(JSON.stringify(engie)).toBe(before);
  });
});

describe("suggestEnding", () => {
  const overlapOf = (lines: ContractLine[]): Overlap => ({
    direction: "consumption",
    period: { from: "2026-07-01", to: "2026-12-31" },
    lines,
  });

  it("ends the earlier line the day before the later one starts", () => {
    const s = suggestEnding(
      overlapOf([
        spot("engie-spot", "2026-01-01", "2026-12-31"),
        spot("new", "2026-07-01", "2026-12-31"),
        engie.lines[1],
      ]),
    );
    expect(s).toEqual({ lineId: "engie-spot", lastDay: "2026-06-30" });
  });

  it("offers nothing when both start on the same day", () => {
    expect(
      suggestEnding(
        overlapOf([
          spot("a", "2026-01-01", "2026-12-31"),
          spot("b", "2026-01-01", "2026-12-31"),
        ]),
      ),
    ).toBeNull();
  });

  it("offers nothing for a hedge beside a spot line, which is normal", () => {
    expect(
      suggestEnding(
        overlapOf([spot("a", "2026-01-01", "2026-12-31"), engie.lines[1]]),
      ),
    ).toBeNull();
  });
});
