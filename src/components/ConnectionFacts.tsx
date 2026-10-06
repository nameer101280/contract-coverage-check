import { Asset } from "../domain/types";
import { MarketSummary } from "../domain/market";
import { ConsumptionSummary } from "../domain/volume";
import { formatKwh } from "./format";

/**
 * The three things Companion already knows that make a contract line
 * judgeable, in one sentence each. The real wizard shows none of them.
 */

interface Props {
  asset: Asset;
  consumption: ConsumptionSummary;
  market: MarketSummary;
}

export function ConnectionFacts({ asset, consumption, market }: Props) {
  return (
    <section className="card facts">
      <div className="card__body">
        <h3 className="facts__title">What Companion already knows</h3>
        <dl className="facts__list">
          <div>
            <dt>Uses</dt>
            <dd>
              about <strong>{formatKwh(consumption.annualisedKwh)}</strong> a
              year
              <span>from {Math.round(consumption.days)} days of meter readings</span>
            </dd>
          </div>
          <div>
            <dt>Can draw</dt>
            <dd>
              up to <strong>{asset.physicalLimitKw} kW</strong>
              <span>highest so far {consumption.peakKw.toFixed(1)} kW</span>
            </dd>
          </div>
          <div>
            <dt>Market price</dt>
            <dd>
              about <strong>€{market.averageEurPerMwh.toFixed(0)}/MWh</strong>{" "}
              lately
              <span>
                from €{market.minEurPerMwh.toFixed(0)} to €
                {market.maxEurPerMwh.toFixed(0)} over {market.hours} hours
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
