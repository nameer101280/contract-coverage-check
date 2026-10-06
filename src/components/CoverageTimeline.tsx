import { Contract, ContractLine, LineType, Period } from "../domain/types";
import { daysInPeriod, periodBounds } from "../domain/coverage";
import { contractOf } from "../domain/contracts";
import { plainPrice } from "./format";

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

const TYPE_NAMES: Record<LineType, string> = {
  spot: "market price",
  hedge: "fixed-price hedge",
  markup: "supplier margin",
};

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
        <span></span>
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
              {isNew ? "New line" : (contract?.name ?? line.name)}
              <span className="timeline__label-sub">
                {TYPE_NAMES[line.type]}
                {line.direction === "injection" && " · fed into the grid"}
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
                  {width > 0.22 ? plainPrice(line) : ""}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
