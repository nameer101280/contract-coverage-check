import { EnergyDirection, LineType, VolumeUnit } from "../domain/types";
import {
  MarketSummary,
  PriceComparison,
  effectiveSpotPrice,
} from "../domain/market";
import { HedgeCoverage } from "../domain/volume";
import { formatPercent } from "./format";

/**
 * The new line, in plain words.
 *
 * It asks for what Companion's wizard asks for, but labels it the way the
 * person filling it in thinks about it: "market price × 1 + €12" rather than
 * "scaling" and "constant". Companion's own notation is shown underneath, so
 * the two can be matched up.
 */

export interface LineDraft {
  type: LineType;
  direction: EnergyDirection;
  from: string;
  to: string;
  scaling: number;
  constant: number;
  hedgeVolume: number;
  hedgeVolumeUnit: VolumeUnit;
  hedgePrice: number;
}

const TYPES: { value: LineType; label: string }[] = [
  { value: "spot", label: "Market price" },
  { value: "hedge", label: "Fixed-price hedge" },
  { value: "markup", label: "Supplier margin" },
];

function companionNotation(draft: LineDraft): string {
  if (draft.type === "spot") {
    return `${draft.scaling} × spot + ${draft.constant.toFixed(2)}`;
  }
  if (draft.type === "hedge") {
    return `${draft.hedgeVolume} ${draft.hedgeVolumeUnit} @ ${draft.hedgePrice.toFixed(2)} €/MWh`;
  }
  return `+${draft.constant.toFixed(2)} €/MWh`;
}

interface Props {
  draft: LineDraft;
  onChange: (next: LineDraft) => void;
  onReset: () => void;
  market: MarketSummary;
  coverage: HedgeCoverage;
  priceComparison: PriceComparison;
}

export function LineEditor({
  draft,
  onChange,
  onReset,
  market,
  coverage,
  priceComparison,
}: Props) {
  const set = <K extends keyof LineDraft>(key: K, value: LineDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const priceIsTypo =
    priceComparison.verdict === "implausible-low" ||
    priceComparison.verdict === "implausible-high";

  return (
    <section className="card editor">
      <div className="card__head editor__head">
        <h2 className="card__title">New line</h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="card__body">
        <div className="field">
          <span className="field__label">Type</span>
          <div className="segmented" role="group" aria-label="Type">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={draft.type === t.value}
                onClick={() => set("type", t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {draft.type === "spot" && (
          <div className="field">
            <span className="field__label">Price</span>
            <div className="formula-row">
              <span>market price ×</span>
              <input
                aria-label="Share of the market price"
                className="input--short"
                type="number"
                step="0.01"
                value={draft.scaling}
                onChange={(e) => set("scaling", Number(e.target.value))}
              />
              <span>+</span>
              <input
                aria-label="Supplier margin in euros per MWh"
                className="input--short"
                type="number"
                step="0.01"
                value={draft.constant}
                onChange={(e) => set("constant", Number(e.target.value))}
              />
              <span>€/MWh</span>
            </div>
          </div>
        )}

        {draft.type === "hedge" && (
          <div className="field field__row">
            <div>
              <label className="field__label" htmlFor="volume">
                Amount
              </label>
              <div className="input-group">
                <input
                  id="volume"
                  type="number"
                  step="1"
                  value={draft.hedgeVolume}
                  onChange={(e) => set("hedgeVolume", Number(e.target.value))}
                />
                <select
                  aria-label="Volume unit"
                  value={draft.hedgeVolumeUnit}
                  onChange={(e) =>
                    set("hedgeVolumeUnit", e.target.value as VolumeUnit)
                  }
                >
                  <option value="kWh">kWh</option>
                  <option value="kW">kW</option>
                </select>
              </div>
            </div>
            <div>
              <label className="field__label" htmlFor="hedgePrice">
                Fixed price
              </label>
              <div className="input-group">
                <input
                  id="hedgePrice"
                  type="number"
                  step="0.01"
                  value={draft.hedgePrice}
                  onChange={(e) => set("hedgePrice", Number(e.target.value))}
                />
                <span className="unit">€/MWh</span>
              </div>
            </div>
          </div>
        )}

        {draft.type === "markup" && (
          <div className="field">
            <label className="field__label" htmlFor="markup">
              Margin
            </label>
            <div className="input-group">
              <input
                id="markup"
                type="number"
                step="0.01"
                value={draft.constant}
                onChange={(e) => set("constant", Number(e.target.value))}
              />
              <span className="unit">€/MWh</span>
            </div>
          </div>
        )}

        <div className="field field__row">
          <div>
            <label className="field__label" htmlFor="from">
              From
            </label>
            <input
              id="from"
              type="date"
              value={draft.from}
              onChange={(e) => set("from", e.target.value)}
            />
          </div>
          <div>
            <label className="field__label" htmlFor="to">
              To
            </label>
            <input
              id="to"
              type="date"
              value={draft.to}
              onChange={(e) => set("to", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="direction">
            Applies to
          </label>
          <select
            id="direction"
            value={draft.direction}
            onChange={(e) => set("direction", e.target.value as EnergyDirection)}
          >
            <option value="consumption">Electricity used</option>
            <option value="injection">Electricity fed into the grid</option>
          </select>
        </div>

        <p className="editor__summary">
          {draft.type === "spot" &&
            market.averageEurPerMwh > 0 &&
            `At recent market prices this comes to about €${effectiveSpotPrice(
              draft.scaling,
              draft.constant,
              market,
            ).toFixed(0)}/MWh.`}
          {draft.type === "hedge" &&
            (coverage.verdict === "none"
              ? "Enter an amount to see how much of this connection’s use it covers."
              : `Covers ${formatPercent(coverage.percentOfPeriod / 100)} of the electricity used while it applies.`)}
          {draft.type === "hedge" &&
            priceComparison.verdict !== "unset" &&
            ` The price is ${Math.abs(priceComparison.deltaPercent).toFixed(0)}% ${
              priceComparison.deltaPercent < 0 ? "below" : "above"
            } today’s market${
              priceIsTypo
                ? "."
                : ", which is normal if it was signed when prices were different."
            }`}
          {draft.type === "markup" &&
            "A margin adds to the base price, so it never competes with a market-price or hedge line."}
        </p>

        <p className="editor__notation">
          Companion writes this as <code>{companionNotation(draft)}</code>
        </p>
      </div>
    </section>
  );
}
