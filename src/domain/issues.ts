import { Gap, Overlap } from "./coverage";
import { PricedOverlap } from "./cost";
import { Ending, suggestEnding } from "./contracts";
import { PriceComparison } from "./market";
import { LineType, VolumeUnit } from "./types";
import { HedgeCoverage, exceedsPhysicalLimit } from "./volume";

/**
 * Everything worth looking at on this connection, in one ranked list.
 *
 * The checks live in separate modules; this decides which of them the user
 * sees and in what order. The order is the product judgement: things that
 * are almost certainly wrong first, things that may be a mistake next, and
 * things that look odd but are normal last, so a reader who stops after the
 * first item has still read the one that matters.
 */

export type Severity = "problem" | "check" | "normal";

export type Issue =
  | {
      kind: "competing-lines";
      severity: "problem";
      overlap: PricedOverlap;
      ending: Ending | null;
    }
  | { kind: "gap"; severity: "problem"; gap: Gap }
  | { kind: "over-physical-limit"; severity: "problem" }
  | { kind: "hedge-exceeds"; severity: "problem" }
  | { kind: "implausible-price"; severity: "problem" }
  | { kind: "hedge-negligible"; severity: "check" }
  | { kind: "hedge-beside-spot"; severity: "normal"; overlap: Overlap };

export interface IssueInput {
  overlaps: PricedOverlap[];
  gaps: Gap[];
  /** The parts of the new line the hedge checks depend on */
  draft: { type: LineType; hedgeVolume: number; hedgeVolumeUnit: VolumeUnit };
  coverage: HedgeCoverage;
  price: PriceComparison;
  physicalLimitKw: number;
}

const RANK: Record<Severity, number> = { problem: 0, check: 1, normal: 2 };

export function collectIssues(input: IssueInput): Issue[] {
  const issues: Issue[] = [];

  for (const overlap of input.overlaps) {
    const spotLines = overlap.lines.filter((l) => l.type === "spot");
    if (spotLines.length >= 2) {
      issues.push({
        kind: "competing-lines",
        severity: "problem",
        overlap,
        ending: suggestEnding(overlap),
      });
    } else if (overlap.lines.some((l) => l.type === "hedge")) {
      issues.push({ kind: "hedge-beside-spot", severity: "normal", overlap });
    }
  }

  for (const gap of input.gaps) {
    issues.push({ kind: "gap", severity: "problem", gap });
  }

  if (input.draft.type === "hedge") {
    // A kW hedge over the limit is also far more than the connection uses.
    // Saying both would be two warnings for one mistake, and the limit is the
    // clearer of the two.
    const overLimit = exceedsPhysicalLimit(
      input.draft.hedgeVolume,
      input.draft.hedgeVolumeUnit,
      input.physicalLimitKw,
    );
    if (overLimit) {
      issues.push({ kind: "over-physical-limit", severity: "problem" });
    } else if (input.coverage.verdict === "exceeds") {
      issues.push({ kind: "hedge-exceeds", severity: "problem" });
    } else if (input.coverage.verdict === "negligible") {
      issues.push({ kind: "hedge-negligible", severity: "check" });
    }

    if (
      input.price.verdict === "implausible-low" ||
      input.price.verdict === "implausible-high"
    ) {
      issues.push({ kind: "implausible-price", severity: "problem" });
    }
  }

  // Array.prototype.sort is stable, so equal ranks keep the order above.
  return issues.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
