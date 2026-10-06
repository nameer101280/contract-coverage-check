import { Gap, daysInPeriod } from "../domain/coverage";
import { PricedOverlap } from "../domain/cost";
import { Ending, contractOf, suggestEnding } from "../domain/contracts";
import { Contract, ContractLine } from "../domain/types";

/**
 * Conflict and gap warnings.
 *
 * Three decisions worth stating, because they are the product judgement rather
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
 */

function describeDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function lineLabel(
  line: ContractLine,
  draftId: string,
  contracts: Contract[],
): string {
  if (line.id === draftId) return "this new line";
  const contract = contractOf(contracts, line.id);
  return contract ? `${line.name} (${contract.name})` : line.name;
}

function priceOf(line: ContractLine): string {
  if (line.type === "spot") {
    return `${line.scaling ?? 1} × spot + ${(line.constant ?? 0).toFixed(2)}`;
  }
  if (line.type === "hedge") {
    return `${(line.hedgeVolume ?? 0).toLocaleString("en-GB", {
      maximumFractionDigits: 1,
    })} ${line.hedgeVolumeUnit ?? "kWh"} @ €${(
      line.hedgePrice ?? 0
    ).toFixed(2)}/MWh`;
  }
  return `+€${(line.constant ?? 0).toFixed(2)}/MWh`;
}

/** Whole euros once the amount is large enough that cents are noise. */
function eur(n: number): string {
  return `€${n.toLocaleString("en-GB", {
    minimumFractionDigits: n < 100 ? 2 : 0,
    maximumFractionDigits: n < 100 ? 2 : 0,
  })}`;
}

function kwh(n: number): string {
  return n >= 100_000
    ? `${(n / 1000).toLocaleString("en-GB", { maximumFractionDigits: 0 })} MWh`
    : `${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kWh`;
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
          <p className="notice__title">
            No competing prices or uncovered periods
          </p>
          <p className="notice__body">
            Every day in this window has exactly one base price for
            consumption.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {overlaps.map((overlap, i) => {
        const spotLines = overlap.lines.filter((l) => l.type === "spot");
        const hedgeOnly =
          spotLines.length < 2 && overlap.lines.some((l) => l.type === "hedge");
        const ending = hedgeOnly ? null : suggestEnding(overlap);

        return (
          <div
            key={`o-${i}`}
            className={hedgeOnly ? "notice notice--warn" : "notice notice--danger"}
          >
            <span className="notice__icon">!</span>
            <div>
              <p className="notice__title">
                {hedgeOnly
                  ? `A hedge and a spot line both apply from ${describeDate(
                      overlap.period.from,
                    )} to ${describeDate(overlap.period.to)}`
                  : `${describeDate(overlap.period.from)} to ${describeDate(
                      overlap.period.to,
                    )}: the same consumption has ${
                      spotLines.length === 2
                        ? "two base prices"
                        : `${spotLines.length} base prices`
                    }`}
              </p>
              <p className="notice__body">
                {hedgeOnly ? (
                  <>
                    This is normal — a hedge covers part of the volume and spot
                    covers the rest. But nothing currently shows how the volume
                    divides between{" "}
                    {overlap.lines.map((l, idx) => (
                      <span key={l.id}>
                        {idx > 0 && " and "}
                        <code>{priceOf(l)}</code>
                      </span>
                    ))}
                    , so the split is left to the reader.
                  </>
                ) : (
                  <>
                    For {daysInPeriod(overlap.period)} days, every kWh of{" "}
                    {overlap.direction} is claimed by{" "}
                    {spotLines.map((l, idx) => (
                      <span key={l.id}>
                        {idx > 0 && (idx === spotLines.length - 1 ? " and " : ", ")}
                        {lineLabel(l, draftId, contracts)} at{" "}
                        <code>{priceOf(l)}</code>
                      </span>
                    ))}
                    . Only one of these can be what is actually paid, and
                    nothing shows which one the cost totals use.
                  </>
                )}
              </p>

              {!hedgeOnly && overlap.cost && (
                <>
                  <table className="costs">
                    <tbody>
                      {overlap.cost.lines.map((c) => {
                        const line = spotLines.find((l) => l.id === c.lineId);
                        return (
                          <tr key={c.lineId}>
                            <td>
                              {line ? lineLabel(line, draftId, contracts) : c.lineId}
                            </td>
                            <td className="costs__formula">
                              {line && <code>{priceOf(line)}</code>}
                            </td>
                            <td className="costs__eur">≈ {eur(c.costEur)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="notice__fine">
                    Estimated on about {kwh(overlap.cost.expectedKwh)} at this
                    connection’s metered rate, priced at its recent
                    consumption-weighted day-ahead average. The candidates are{" "}
                    <strong>{eur(overlap.cost.spreadEur)} apart</strong>.
                  </p>
                </>
              )}

              {!hedgeOnly && (
                <p className="notice__body">
                  Two base prices for the same energy is almost always a
                  contract that was never ended. If only one is the live deal,
                  the other needs an end date.
                </p>
              )}

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
              {describeDate(gap.period.from)} to {describeDate(gap.period.to)}{" "}
              has no price
            </p>
            <p className="notice__body">
              {daysInPeriod(gap.period)} days of {gap.direction} are not covered
              by any spot or hedge line. The cost engine has nothing to compute
              for those days, so they will be missing from cost totals rather
              than flagged in them.
            </p>
          </div>
        </div>
      ))}
    </>
  );
}
