import { Gap, Overlap, daysInPeriod } from "../domain/coverage";
import { contractForLine } from "../data/mockData";
import { ContractLine } from "../domain/types";

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
 *    "July to December would be priced by Engie and Luminus" is actionable.
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

function lineLabel(line: ContractLine, draftId: string): string {
  if (line.id === draftId) return "this new line";
  const contract = contractForLine(line.id);
  return contract ? `${line.name} (${contract.name})` : line.name;
}

function priceOf(line: ContractLine): string {
  if (line.type === "spot") {
    return `${line.scaling ?? 1} × spot + ${(line.constant ?? 0).toFixed(2)}`;
  }
  if (line.type === "hedge") {
    return `${line.hedgeVolume ?? 0} ${line.hedgeVolumeUnit ?? "kWh"} @ €${(
      line.hedgePrice ?? 0
    ).toFixed(2)}/MWh`;
  }
  return `+€${(line.constant ?? 0).toFixed(2)}/MWh`;
}

interface Props {
  overlaps: Overlap[];
  gaps: Gap[];
  draftId: string;
}

export function ConflictNotice({ overlaps, gaps, draftId }: Props) {
  if (overlaps.length === 0 && gaps.length === 0) {
    return (
      <div className="notice notice--ok">
        <span className="notice__icon">✓</span>
        <div>
          <p className="notice__title">
            No double-pricing or uncovered periods
          </p>
          <p className="notice__body">
            Every day in this window is priced exactly once for consumption.
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
                    {overlap.direction} would be priced by{" "}
                    {spotLines.map((l, idx) => (
                      <span key={l.id}>
                        {idx > 0 && (idx === spotLines.length - 1 ? " and " : ", ")}
                        {lineLabel(l, draftId)} at <code>{priceOf(l)}</code>
                      </span>
                    ))}
                    . Two base prices for the same energy is almost always a
                    contract that was never ended. If only one is the live deal,
                    the other needs an end date.
                  </>
                )}
              </p>
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
