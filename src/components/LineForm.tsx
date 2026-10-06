import { EnergyDirection, LineType, VolumeUnit } from "../domain/types";
import { MarketSummary, effectiveSpotPrice } from "../domain/market";

/**
 * The form. Deliberately close to Companion's own: same fields, same labels,
 * same formula preview. The difference is not here — it is that everything in
 * the context panel updates as these fields change.
 *
 * One addition: the formula preview shows what the line would actually have
 * cost at recent market prices. The real preview stops at the notation, which
 * tells you the shape of the deal but not its size.
 */

export interface LineDraft {
  name: string;
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

const TYPES: { value: LineType; name: string; desc: string }[] = [
  { value: "spot", name: "Spot price", desc: "Pay the day-ahead price." },
  { value: "hedge", name: "Hedge", desc: "Lock a price for a volume." },
  { value: "markup", name: "Markup", desc: "A flat supplier margin." },
];

interface Props {
  draft: LineDraft;
  onChange: (next: LineDraft) => void;
  market: MarketSummary;
}

export function LineForm({ draft, onChange, market }: Props) {
  const set = <K extends keyof LineDraft>(key: K, value: LineDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <section className="card">
      <div className="card__head">
        <h2 className="card__title">New contract line</h2>
        <p className="card__hint">
          The same fields Companion asks for, on the same screen.
        </p>
      </div>

      <div className="card__body">
        <div className="field">
          <label className="field__label" htmlFor="name">
            Contract line name
          </label>
          <input
            id="name"
            type="text"
            value={draft.name}
            placeholder="e.g. Day-ahead energy"
            onChange={(e) => set("name", e.target.value)}
          />
        </div>

        <div className="field">
          <span className="field__label">What kind of contract line is this?</span>
          <div className="types">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className="type"
                aria-pressed={draft.type === t.value}
                onClick={() => set("type", t.value)}
              >
                <span className="type__name">{t.name}</span>
                <span className="type__desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="direction">
            Energy direction
          </label>
          <select
            id="direction"
            value={draft.direction}
            onChange={(e) =>
              set("direction", e.target.value as EnergyDirection)
            }
          >
            <option value="consumption">Consumption</option>
            <option value="injection">Injection</option>
          </select>
        </div>

        {draft.type === "spot" && (
          <div className="field">
            <div className="field__row">
              <div>
                <label className="field__label" htmlFor="scaling">
                  Scaling
                </label>
                <input
                  id="scaling"
                  type="number"
                  step="0.01"
                  value={draft.scaling}
                  onChange={(e) => set("scaling", Number(e.target.value))}
                />
              </div>
              <div>
                <label className="field__label" htmlFor="constant">
                  Constant
                </label>
                <div className="input-group">
                  <input
                    id="constant"
                    type="number"
                    step="0.01"
                    value={draft.constant}
                    onChange={(e) => set("constant", Number(e.target.value))}
                  />
                  <span className="unit">€/MWh</span>
                </div>
              </div>
            </div>

            <div className="formula">
              <div className="formula__label">Formula preview</div>
              <div className="formula__value">
                {draft.scaling} × spot + {draft.constant.toFixed(2)}
              </div>
              {market.averageEurPerMwh > 0 && (
                <div className="formula__effective">
                  At the last {market.hours} hours of day-ahead prices
                  (avg €{market.averageEurPerMwh.toFixed(2)}/MWh), this would
                  bill about{" "}
                  <strong>
                    €
                    {effectiveSpotPrice(
                      draft.scaling,
                      draft.constant,
                      market,
                    ).toFixed(2)}
                    /MWh
                  </strong>
                  .
                </div>
              )}
            </div>
          </div>
        )}

        {draft.type === "hedge" && (
          <div className="field">
            <div className="field__row">
              <div>
                <label className="field__label" htmlFor="volume">
                  Hedged volume
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
                    <option value="MWh">MWh</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="field__label" htmlFor="hedgePrice">
                  Hedge price
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

            <div className="formula">
              <div className="formula__label">Formula preview</div>
              <div className="formula__value">
                {draft.hedgeVolume} {draft.hedgeVolumeUnit} @{" "}
                {draft.hedgePrice.toFixed(2)} €/MWh
              </div>
            </div>
          </div>
        )}

        {draft.type === "markup" && (
          <div className="field">
            <label className="field__label" htmlFor="markup">
              Markup
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
            <p className="note" style={{ marginTop: "var(--s-2)" }}>
              A markup adds to whatever the base price is, so it does not
              compete with a spot or hedge line.
            </p>
          </div>
        )}

        <div className="field">
          <div className="field__row">
            <div>
              <label className="field__label" htmlFor="from">
                Applies from
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
                Applies until
              </label>
              <input
                id="to"
                type="date"
                value={draft.to}
                onChange={(e) => set("to", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
