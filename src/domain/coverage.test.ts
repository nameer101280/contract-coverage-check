import { describe, expect, it } from "vitest";
import {
  daysInPeriod,
  findGaps,
  findOverlaps,
  intersection,
  linesConflict,
  periodBounds,
  periodsIntersect,
} from "./coverage";
import { ContractLine, LineType, EnergyDirection } from "./types";

function line(
  id: string,
  from: string,
  to: string,
  type: LineType = "spot",
  direction: EnergyDirection = "consumption",
): ContractLine {
  return { id, name: id, type, direction, period: { from, to } };
}

const YEAR_2026 = { from: "2026-01-01", to: "2026-12-31" };

describe("periodsIntersect", () => {
  it("finds a plain overlap", () => {
    expect(
      periodsIntersect(
        { from: "2026-01-01", to: "2026-12-31" },
        { from: "2026-07-01", to: "2026-12-31" },
      ),
    ).toBe(true);
  });

  it("treats containment as an overlap", () => {
    expect(
      periodsIntersect(
        { from: "2026-01-01", to: "2026-12-31" },
        { from: "2026-03-01", to: "2026-04-30" },
      ),
    ).toBe(true);
  });

  it("does NOT treat a clean handover as an overlap", () => {
    // One contract ends 30 June, the next starts 1 July. This is what a
    // correct supplier switch looks like and must not be flagged.
    expect(
      periodsIntersect(
        { from: "2026-01-01", to: "2026-06-30" },
        { from: "2026-07-01", to: "2026-12-31" },
      ),
    ).toBe(false);
  });

  it("treats a single shared day as an overlap", () => {
    expect(
      periodsIntersect(
        { from: "2026-01-01", to: "2026-06-30" },
        { from: "2026-06-30", to: "2026-12-31" },
      ),
    ).toBe(true);
  });

  it("is symmetric", () => {
    const a = { from: "2026-01-01", to: "2026-06-30" };
    const b = { from: "2026-05-01", to: "2026-12-31" };
    expect(periodsIntersect(a, b)).toBe(periodsIntersect(b, a));
  });
});

describe("intersection", () => {
  it("returns the shared span", () => {
    expect(
      intersection(
        { from: "2026-01-01", to: "2026-12-31" },
        { from: "2026-07-01", to: "2027-06-30" },
      ),
    ).toEqual({ from: "2026-07-01", to: "2026-12-31" });
  });

  it("returns null when there is nothing shared", () => {
    expect(
      intersection(
        { from: "2026-01-01", to: "2026-06-30" },
        { from: "2026-07-01", to: "2026-12-31" },
      ),
    ).toBeNull();
  });
});

describe("daysInPeriod", () => {
  it("counts both ends inclusively", () => {
    expect(daysInPeriod({ from: "2026-01-01", to: "2026-01-01" })).toBe(1);
    expect(daysInPeriod({ from: "2026-01-01", to: "2026-01-31" })).toBe(31);
    expect(daysInPeriod(YEAR_2026)).toBe(365);
  });
});

describe("linesConflict", () => {
  it("flags two spot lines on the same direction and period", () => {
    expect(
      linesConflict(
        line("a", "2026-01-01", "2026-12-31"),
        line("b", "2026-07-01", "2026-12-31"),
      ),
    ).toBe(true);
  });

  it("does not flag a line against itself", () => {
    const a = line("a", "2026-01-01", "2026-12-31");
    expect(linesConflict(a, a)).toBe(false);
  });

  it("does not flag lines on opposite energy directions", () => {
    // Pricing consumption and pricing injection are separate concerns.
    expect(
      linesConflict(
        line("a", "2026-01-01", "2026-12-31", "spot", "consumption"),
        line("b", "2026-01-01", "2026-12-31", "spot", "injection"),
      ),
    ).toBe(false);
  });

  it("does not flag a markup against a spot line", () => {
    // A markup is additive, not price-setting. It is meant to sit on top.
    expect(
      linesConflict(
        line("a", "2026-01-01", "2026-12-31", "spot"),
        line("b", "2026-01-01", "2026-12-31", "markup"),
      ),
    ).toBe(false);
  });

  it("does not flag two markups", () => {
    expect(
      linesConflict(
        line("a", "2026-01-01", "2026-12-31", "markup"),
        line("b", "2026-01-01", "2026-12-31", "markup"),
      ),
    ).toBe(false);
  });

  it("flags a hedge against a spot line", () => {
    // Strictly legitimate, but the user cannot see how the volume divides,
    // so it is surfaced rather than hidden.
    expect(
      linesConflict(
        line("a", "2026-01-01", "2026-12-31", "spot"),
        line("b", "2026-01-01", "2026-12-31", "hedge"),
      ),
    ).toBe(true);
  });
});

describe("findOverlaps", () => {
  it("returns nothing for a single line", () => {
    expect(findOverlaps([line("a", "2026-01-01", "2026-12-31")])).toEqual([]);
  });

  it("returns nothing for two lines that hand over cleanly", () => {
    expect(
      findOverlaps([
        line("a", "2026-01-01", "2026-06-30"),
        line("b", "2026-07-01", "2026-12-31"),
      ]),
    ).toEqual([]);
  });

  it("finds the real case: Engie all year, Luminus from July", () => {
    const overlaps = findOverlaps([
      line("engie", "2026-01-01", "2026-12-31"),
      line("luminus", "2026-07-01", "2026-12-31"),
    ]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].period).toEqual({ from: "2026-07-01", to: "2026-12-31" });
    expect(overlaps[0].lines.map((l) => l.id).sort()).toEqual([
      "engie",
      "luminus",
    ]);
  });

  it("merges three lines sharing one period into a single warning", () => {
    // Three pairwise overlaps covering the same span should surface once,
    // not three times. Repeating near-identical warnings is how an alert
    // layer loses the user's attention.
    const overlaps = findOverlaps([
      line("a", "2026-07-01", "2026-12-31"),
      line("b", "2026-07-01", "2026-12-31"),
      line("c", "2026-07-01", "2026-12-31"),
    ]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].lines).toHaveLength(3);
  });

  it("reports distinct periods separately", () => {
    const overlaps = findOverlaps([
      line("a", "2026-01-01", "2026-12-31"),
      line("b", "2026-02-01", "2026-02-28"),
      line("c", "2026-09-01", "2026-09-30"),
    ]);
    expect(overlaps).toHaveLength(2);
    expect(overlaps[0].period.from).toBe("2026-02-01");
    expect(overlaps[1].period.from).toBe("2026-09-01");
  });

  it("is ordered by when the overlap starts", () => {
    const overlaps = findOverlaps([
      line("a", "2026-01-01", "2026-12-31"),
      line("late", "2026-11-01", "2026-11-30"),
      line("early", "2026-02-01", "2026-02-28"),
    ]);
    expect(overlaps.map((o) => o.period.from)).toEqual([
      "2026-02-01",
      "2026-11-01",
    ]);
  });
});

describe("findGaps", () => {
  it("reports the whole window when nothing covers it", () => {
    expect(findGaps([], YEAR_2026, "consumption")).toEqual([
      { direction: "consumption", period: YEAR_2026 },
    ]);
  });

  it("reports nothing when the window is fully covered", () => {
    expect(
      findGaps([line("a", "2026-01-01", "2026-12-31")], YEAR_2026, "consumption"),
    ).toEqual([]);
  });

  it("finds a gap in the middle", () => {
    const gaps = findGaps(
      [
        line("a", "2026-01-01", "2026-06-30"),
        line("b", "2026-08-01", "2026-12-31"),
      ],
      YEAR_2026,
      "consumption",
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].period).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("finds gaps at both ends", () => {
    const gaps = findGaps(
      [line("a", "2026-04-01", "2026-09-30")],
      YEAR_2026,
      "consumption",
    );
    expect(gaps).toHaveLength(2);
    expect(gaps[0].period).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(gaps[1].period).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("does not count a clean handover as a gap", () => {
    expect(
      findGaps(
        [
          line("a", "2026-01-01", "2026-06-30"),
          line("b", "2026-07-01", "2026-12-31"),
        ],
        YEAR_2026,
        "consumption",
      ),
    ).toEqual([]);
  });

  it("ignores lines on the other direction", () => {
    const gaps = findGaps(
      [line("a", "2026-01-01", "2026-12-31", "spot", "injection")],
      YEAR_2026,
      "consumption",
    );
    expect(gaps).toHaveLength(1);
  });

  it("ignores markups, which do not establish a price", () => {
    const gaps = findGaps(
      [line("a", "2026-01-01", "2026-12-31", "markup")],
      YEAR_2026,
      "consumption",
    );
    expect(gaps).toHaveLength(1);
  });
});

describe("periodBounds", () => {
  it("places a full-window period at the full width", () => {
    const { left, width } = periodBounds(YEAR_2026, YEAR_2026);
    expect(left).toBeCloseTo(0);
    expect(width).toBeCloseTo(1);
  });

  it("places a half-year starting in July at roughly the midpoint", () => {
    const { left, width } = periodBounds(
      { from: "2026-07-01", to: "2026-12-31" },
      YEAR_2026,
    );
    expect(left).toBeCloseTo(0.496, 2);
    expect(width).toBeCloseTo(0.504, 2);
  });

  it("clamps a period that starts before the window", () => {
    const { left } = periodBounds(
      { from: "2025-01-01", to: "2026-06-30" },
      YEAR_2026,
    );
    expect(left).toBe(0);
  });
});
