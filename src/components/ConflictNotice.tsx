import { Gap, daysInPeriod } from "../domain/coverage";
import { PricedOverlap } from "../domain/cost";
import { Ending, contractOf, suggestEnding } from "../domain/contracts";
import { Contract, ContractLine, EnergyDirection, Period } from "../domain/types";
import { formatEur as eur, formatKwh as kwh, plainPrice } from "./format";

/**
 * Conflict and gap warnings.
 *
 * Four decisions worth stating, because they are the product judgement rather
 * than the code:
 *
 * 1. These are warnings, not errors. Nothing is blocked. Some overlaps are
 *    legitimate — a hedge is supposed to sit alongside a spot line, and a real
 *    supplier switch can overlap by a few days during a handover. Refusing to
 *    save a correct deal is a worse failure than permitting a mistaken one.
 *
 * 2. Each warning names the specific contracts and the specific period. A
 *    message saying "this contract may conflict" is noise; one saying
 *    "July to December is claimed by both Engie and Luminus" is actionable.
 *
 * 3. A hedge overlapping a spot line is described differently from two spot
 *    lines overlapping, because they are different situations. The first is
 *    normal but unclear; the second is almost certainly wrong.
 *
 * 4. The wording is everyday language: "market price + €9", "charge for the
 *    same electricity". A warning that needs the contract notation to be
 *    understood only helps people who would not have made the mistake.
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

function contractName(
  line: ContractLine,
  draftId: string,
  contracts: Contract[],
): string {
  if (line.id === draftId) return "this new line";
  return contractOf(contracts, line.id)?.name ?? line.name;
}

function electricity(direction: EnergyDirection): string {
  return direction === "consumption"
    ? "the electricity you use"
    : "the electricity you feed into the grid";
}

/** "A, B and C" */
function listOf(items: React.ReactNode[]): React.ReactNode[] {
  return items.flatMap((item, i) => [
    i === 0 ? "" : i === items.length - 1 ? " and " : ", ",
    item,
  ]);
}

interface Props {
  overlaps: PricedOverlap[];
  gaps: Gap[];
  draftId: string;
  contracts: Contract[];
  /** Apply a suggested ending: shorten a contract, or the new line */
  onEnd: (ending: Ending) => void;
}

export function ConflictNotice({
  overlaps,
  gaps,
  draftId,
  contracts,
  onEnd,
}: Props) {
  if (overlaps.length === 0 && gaps.length === 0) {
    return (
      <div className="notice notice--ok">
        <span className="notice__icon">✓</span>
        <div>
          <p className="notice__title">Every day has exactly one price</p>
          <p className="notice__body">
            No two contracts charge for the same electricity, and no day is
            left without a price.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {overlaps.map((overlap, i) => {
        const spotLines = overlap.lines.filter((l) => l.type === "spot");
        const hedgeLines = overlap.lines.filter((l) => l.type === "hedge");
        const hedgeOnly = spotLines.length < 2 && hedgeLines.length > 0;
        const ending = hedgeOnly ? null : suggestEnding(overlap);
        const name = (l: ContractLine) => contractName(l, draftId, contracts);

        if (hedgeOnly) {
          return (
            <div key={`o-${i}`} className="notice notice--warn">
              <span className="notice__icon">!</span>
              <div>
                <p className="notice__title">
                  {describeRange(overlap.period)}: a hedge and a market-price
                  line run together
                </p>
                <p className="notice__body">
                  This is normal. The hedge fixes the price for part of{" "}
                  {electricity(overlap.direction)} (
                  {listOf(hedgeLines.map((l) => <strong key={l.id}>{plainPrice(l)}</strong>))}
                  ), and the market-price line covers the rest (
                  {listOf(spotLines.map((l) => <strong key={l.id}>{plainPrice(l)}</strong>))}
                  ). The chart below shows how it divides each month.
                </p>
              </div>
            </div>
          );
        }

        return (
          <div key={`o-${i}`} className="notice notice--danger">
            <span className="notice__icon">!</span>
            <div>
              <p className="notice__title">
                {describeRange(overlap.period)}:{" "}
                {spotLines.length === 2 ? "two" : spotLines.length} contracts
                charge for the same electricity
              </p>
              <p className="notice__body">
                For these {daysInPeriod(overlap.period)} days,{" "}
                {listOf(
                  spotLines.map((l) => (
                    <span key={l.id}>
                      <strong>{name(l)}</strong> ({plainPrice(l)})
                    </span>
                  )),
                )}{" "}
                each cover all of {electricity(overlap.direction)}. You only
                pay one of them, and nothing shows which one Companion’s cost
                reports use.
              </p>

              {overlap.cost && (
                <>
                  <p className="notice__body">
                    Estimated cost for these days:
                  </p>
                  <table className="costs">
                    <tbody>
                      {overlap.cost.lines.map((c) => {
                        const line = spotLines.find((l) => l.id === c.lineId);
                        return (
                          <tr key={c.lineId}>
                            <td>{line ? name(line) : c.lineId}</td>
                            <td className="costs__formula">
                              {line && plainPrice(line)}
                            </td>
                            <td className="costs__eur">≈ {eur(c.costEur)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="notice__fine">
                    A difference of{" "}
                    <strong>{eur(overlap.cost.spreadEur)}</strong>. Based on
                    this connection’s usual consumption (about{" "}
                    {kwh(overlap.cost.expectedKwh)} over these days) and recent
                    market prices.
                  </p>
                </>
              )}

              <p className="notice__body">
                This usually means the old contract was never ended.
              </p>

              {ending && (
                <button
                  type="button"
                  className="btn btn--fix"
                  onClick={() => onEnd(ending)}
                >
                  End{" "}
                  {ending.lineId === draftId
                    ? "this new line"
                    : (contractOf(contracts, ending.lineId)?.name ??
                      "that line")}{" "}
                  on {describeDate(ending.lastDay)}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {gaps.map((gap, i) => (
        <div key={`g-${i}`} className="notice notice--warn">
          <span className="notice__icon">!</span>
          <div>
            <p className="notice__title">
              {describeRange(gap.period)}: no contract prices this electricity
            </p>
            <p className="notice__body">
              For these {daysInPeriod(gap.period)} days, no market-price or
              hedge line covers {electricity(gap.direction)}. Companion has
              nothing to calculate a cost from, so these days are left out of
              cost totals without a warning.
            </p>
          </div>
        </div>
      ))}
    </>
  );
}
