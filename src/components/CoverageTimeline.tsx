import { Contract, ContractLine, Period } from "../domain/types";
import { daysInPeriod, periodBounds } from "../domain/coverage";
import { contractOf } from "../domain/contracts";

/**
 * Coverage over time.
 *
 * In the real product the asset view lists the lines pricing a connection one
 * under another, with the dates hidden in a detail panel. Working out whether
 * two lines overlap means reading four dates and doing the arithmetic yourself.
 *
 * Drawn against a shared axis, an overlap is just visible. That is the whole
 * reason this is a timeline and not a table.
 */

const MONTHS = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];

function spanClass(line: ContractLine, isNew: boolean): string {
  if (isNew) return "timeline__span timeline__span--new";
  if (line.type === "hedge") return "timeline__span timeline__span--hedge";
  if (line.type === "markup") return "timeline__span timeline__span--markup";
  return "timeline__span";
}

function priceLabel(line: ContractLine): string {
  if (line.type === "spot") {
    return `${line.scaling ?? 1} × spot + ${(line.constant ?? 0).toFixed(2)}`;
  }
  if (line.type === "hedge") {
    return `${(line.hedgeVolume ?? 0).toLocaleString("en-GB", {
      maximumFractionDigits: 1,
    })} ${line.hedgeVolumeUnit ?? "kWh"} @ ${(
      line.hedgePrice ?? 0
    ).toFixed(2)}`;
  }
  return `+${(line.markup ?? line.constant ?? 0).toFixed(2)} €/MWh`;
}

interface Props {
  lines: ContractLine[];
  draftLine: ContractLine;
  window: Period;
  contracts: Contract[];
}

export function CoverageTimeline({
  lines,
  draftLine,
  window,
  contracts,
}: Props) {
  const rows = [...lines, draftLine];

  return (
    <div className="timeline">
      <div className="timeline__scale">
        <span>Contract line</span>
        <div className="timeline__months">
          {MONTHS.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      </div>

      {rows.map((line) => {
        const isNew = line.id === draftLine.id;
        const { left, width } = periodBounds(line.period, window);
        const contract = contractOf(contracts, line.id);

        return (
          <div className="timeline__row" key={line.id}>
            <div className="timeline__label">
              {line.name || "Untitled line"}
              <span className="timeline__label-sub">
                {isNew
                  ? "this new line"
                  : (contract?.name ?? "—") +
                    " · " +
                    (line.direction === "consumption" ? "consumption" : "injection")}
              </span>
            </div>
            <div className="timeline__track">
              {width > 0 && (
                <div
                  className={spanClass(line, isNew)}
                  style={{
                    left: `${left * 100}%`,
                    width: `${width * 100}%`,
                  }}
                  title={`${line.period.from} to ${line.period.to} (${daysInPeriod(
                    line.period,
                  )} days)`}
                >
                  {width > 0.22 ? priceLabel(line) : ""}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
