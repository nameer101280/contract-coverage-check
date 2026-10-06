import { ReactNode } from "react";
import { daysInPeriod } from "../domain/coverage";
import { Ending, contractOf } from "../domain/contracts";
import { Issue } from "../domain/issues";
import { HedgeCoverage } from "../domain/volume";
import { Contract, ContractLine, EnergyDirection, Period } from "../domain/types";
import {
  formatEur,
  formatKwh,
  formatPercent,
  plainPrice,
} from "./format";

/**
 * The answer to "is this contract right?", before anything else on the page.
 *
 * Each item names the contracts, the dates and the amount, in everyday words,
 * and carries its fix where there is one. What looks odd but is normal is
 * listed last and quietly, so it explains rather than alarms.
 */

function describeDate(iso: string, withYear = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "1 Jul – 31 Dec 2026", with the year once when both ends share it. */
function describeRange(period: Period): string {
  const sameYear = period.from.slice(0, 4) === period.to.slice(0, 4);
  return `${describeDate(period.from, !sameYear)} – ${describeDate(period.to)}`;
}

function electricity(direction: EnergyDirection): string {
  return direction === "consumption"
    ? "the electricity you use"
    : "the electricity you feed into the grid";
}

/** "A, B and C" */
function listOf(items: ReactNode[]): ReactNode[] {
  return items.flatMap((item, i) => [
    i === 0 ? "" : i === items.length - 1 ? " and " : ", ",
    item,
  ]);
}

type Flagged = Exclude<Issue, { severity: "normal" }>;
type Normal = Extract<Issue, { severity: "normal" }>;

/** What the hedge checks need to know about the new line, already worked out. */
export interface HedgeContext {
  volume: number;
  unit: "kW" | "kWh";
  kwh: number;
  price: number;
  coverage: HedgeCoverage;
}

interface Props {
  issues: Issue[];
  hedge: HedgeContext;
  marketAverage: number;
  physicalLimitKw: number;
  contracts: Contract[];
  draftId: string;
  /** Confirmation after a fix was applied */
  resolved: string | null;
  onEnd: (ending: Ending) => void;
}

export function IssueList({
  issues,
  hedge,
  marketAverage,
  physicalLimitKw,
  contracts,
  draftId,
  resolved,
  onEnd,
}: Props) {
  const name = (l: ContractLine) =>
    l.id === draftId
      ? "this new line"
      : (contractOf(contracts, l.id)?.name ?? l.name);

  const flagged = issues.filter((i): i is Flagged => i.severity !== "normal");
  const normal = issues.filter((i): i is Normal => i.severity === "normal");

  // A hedge beside a market-price line is said once for the whole connection,
  // not once per overlapping period: it is the same reassurance each time.
  const uniqueOfType = (type: ContractLine["type"]) => {
    const seen = new Map<string, ContractLine>();
    for (const issue of normal) {
      for (const l of issue.overlap.lines) {
        if (l.type === type) seen.set(l.id, l);
      }
    }
    return [...seen.values()];
  };
  const normalHedges = uniqueOfType("hedge");
  const normalSpots = uniqueOfType("spot");

  function card(issue: Flagged): { title: ReactNode; body: ReactNode; extra?: ReactNode } {
    switch (issue.kind) {
      case "competing-lines": {
        const { overlap, ending } = issue;
        const spot = overlap.lines.filter((l) => l.type === "spot");
        return {
          title: `${describeRange(overlap.period)}: ${
            spot.length === 2 ? "two" : spot.length
          } contracts charge for the same electricity`,
          body: (
            <>
              {listOf(
                spot.map((l) => (
                  <span key={l.id}>
                    <strong>{name(l)}</strong> ({plainPrice(l)})
                  </span>
                )),
              )}{" "}
              each cover all of {electricity(overlap.direction)} for these{" "}
              {daysInPeriod(overlap.period)} days. You only pay one, and
              nothing shows which one Companion’s cost reports use. This
              usually means the old contract was never ended.
            </>
          ),
          extra: (
            <>
              {overlap.cost && (
                <div className="issue__costs">
                  <span className="issue__costs-label">
                    Estimated cost for these days
                  </span>
                  {overlap.cost.lines.map((c) => {
                    const line = spot.find((l) => l.id === c.lineId);
                    return (
                      <span key={c.lineId} className="issue__cost">
                        {line ? name(line) : c.lineId}{" "}
                        <strong>≈ {formatEur(c.costEur)}</strong>
                      </span>
                    );
                  })}
                  <span className="issue__fine">
                    {formatEur(overlap.cost.spreadEur)} apart, based on this
                    connection’s usual use (about{" "}
                    {formatKwh(overlap.cost.expectedKwh)}) and recent market
                    prices.
                  </span>
                </div>
              )}
              {ending && (
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  onClick={() => onEnd(ending)}
                >
                  End{" "}
                  {ending.lineId === draftId
                    ? "this new line"
                    : (contractOf(contracts, ending.lineId)?.name ?? "that line")}{" "}
                  on {describeDate(ending.lastDay)}
                </button>
              )}
            </>
          ),
        };
      }
      case "gap":
        return {
          title: `${describeRange(issue.gap.period)}: no contract prices this electricity`,
          body: `For these ${daysInPeriod(issue.gap.period)} days, no market-price or hedge line covers ${electricity(
            issue.gap.direction,
          )}. Companion has nothing to calculate a cost from, so these days are left out of cost totals without a warning.`,
        };
      case "over-physical-limit":
        return {
          title: `${hedge.volume} kW is more power than this connection can draw`,
          body: `A hedge in kW means that much power in every hour. This connection is limited to ${physicalLimitKw} kW. If ${hedge.volume} is an amount of energy, choose kWh.`,
        };
      case "hedge-exceeds":
        return {
          title: "This hedge is more than this connection uses while it applies",
          body: `${formatKwh(hedge.kwh)} against about ${formatKwh(
            hedge.coverage.expectedKwh,
          )} of use: ${formatPercent(
            hedge.coverage.percentOfPeriod / 100,
          )}. A hedge is paid for in full, whether the energy is used or not.`,
        };
      case "implausible-price":
        return {
          title: `€${hedge.price}/MWh is more than five times off the market price`,
          body: `The market price lately averaged €${marketAverage.toFixed(
            0,
          )}/MWh. The usual cause is a typo, or a price in €/kWh entered as €/MWh.`,
        };
      case "hedge-negligible":
        return {
          title: `This hedge covers only ${formatPercent(
            hedge.coverage.percentOfPeriod / 100,
          )} of the electricity used while it applies`,
          body: `${formatKwh(hedge.kwh)} is about ${hedge.coverage.equivalentDays.toFixed(
            1,
          )} days of typical use. A hedge this small is more often a units mistake: if the supplier contract says MWh, this form needs kWh.`,
        };
    }
  }

  return (
    <section className="card issues">
      <div className="issues__head">
        <h2 className="issues__title">
          {flagged.length === 0
            ? "✓ Nothing to look at"
            : `${flagged.length} ${flagged.length === 1 ? "thing" : "things"} to look at`}
        </h2>
        <p className="issues__hint">
          The new line, checked against this connection’s meter data, market
          prices and other contracts.
        </p>
      </div>

      {resolved && <p className="issues__resolved">✓ {resolved}</p>}

      {flagged.length > 0 && (
        <ol className="issues__list">
          {flagged.map((issue, i) => {
            const c = card(issue);
            return (
              <li key={`${issue.kind}-${i}`} className={`issue issue--${issue.severity}`}>
                <span className="issue__number" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="issue__content">
                  <p className="issue__title">{c.title}</p>
                  <p className="issue__body">{c.body}</p>
                  {c.extra}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {normalHedges.length > 0 && (
        <p className="issues__normal">
          <strong>Normal:</strong>{" "}
          {normalHedges.length === 1 ? "a fixed-price hedge" : "fixed-price hedges"} (
          {listOf(normalHedges.map((l) => <span key={l.id}>{plainPrice(l)}</span>))}
          ) {normalHedges.length === 1 ? "runs" : "run"} alongside the market price (
          {listOf(normalSpots.map((l) => <span key={l.id}>{plainPrice(l)}</span>))}
          ). The chart shows how they divide each month.
        </p>
      )}
    </section>
  );
}
