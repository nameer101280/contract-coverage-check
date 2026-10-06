import { Asset } from "../domain/types";
import { ConsumptionSummary, HedgeCoverage, hoursAtPhysicalLimit } from "../domain/volume";
import { MarketSummary, PriceComparison } from "../domain/market";
import { LineDraft } from "./LineForm";

/**
 * The context panel: the three things Companion already knows and does not
 * show on the screen where the contract is configured.
 *
 *   1. what this connection physically can and actually does consume
 *   2. what the market currently costs
 *   3. (in the timeline below) what already prices this asset
 *
 * None of this is new data. The physical limit comes from the asset
 * configuration, the consumption from the Fluvius integration, the prices from
 * the Market Data page. Each is one click away from the real wizard, and the
 * real wizard uses none of them.
 */

interface Props {
  asset: Asset;
  consumption: ConsumptionSummary;
  market: MarketSummary;
  draft: LineDraft;
  hedgeKwh: number;
  coverage: HedgeCoverage;
  priceComparison: PriceComparison;
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function ContextPanel({
  asset,
  consumption,
  market,
  draft,
  hedgeKwh,
  coverage,
  priceComparison,
}: Props) {
  return (
    <section className="card context">
      <div>
        <div className="block">
          <div className="block__label">This connection</div>

          <div className="stat">
            <span className="stat__name">
              Metered consumption
              <span className="stat__sub">
                {fmt(consumption.days)} days of 15-minute readings
              </span>
            </span>
            <span className="stat__value">
              {fmt(consumption.totalKwh)} kWh
            </span>
          </div>

          <div className="stat">
            <span className="stat__name">
              Annualised
              <span className="stat__sub">extrapolated from the above</span>
            </span>
            <span className="stat__value">
              ~{fmt(consumption.annualisedKwh)} kWh
            </span>
          </div>

          <div className="stat">
            <span className="stat__name">
              Highest 15-min draw
              <span className="stat__sub">measured</span>
            </span>
            <span className="stat__value">
              {fmt(consumption.peakKw, 2)} kW
            </span>
          </div>

          <div className="stat">
            <span className="stat__name">
              Physical limit
              <span className="stat__sub">from asset configuration</span>
            </span>
            <span className="stat__value">
              {fmt(asset.physicalLimitKw, 1)} kW
            </span>
          </div>

          <p className="source">
            Source: the Fluvius integration on this asset, and the physical
            power limit entered in its configuration.
          </p>
        </div>

        {draft.type === "hedge" && (
          <div className="block">
            <div className="block__label">What this hedge covers</div>

            {coverage.verdict === "none" ? (
              <p className="note">
                Enter a volume to see how much of this connection's consumption
                it would cover.
              </p>
            ) : (
              <>
                <div
                  className={
                    "headline " +
                    (coverage.verdict === "negligible"
                      ? "headline--warn"
                      : coverage.verdict === "exceeds"
                        ? "headline--danger"
                        : "headline--ok")
                  }
                >
                  {coverage.percentOfAnnual < 0.1
                    ? "<0.1"
                    : fmt(coverage.percentOfAnnual, 1)}
                  % of annual consumption
                </div>

                <div className="bar">
                  <div
                    className={
                      "bar__fill" +
                      (coverage.verdict === "negligible"
                        ? " bar__fill--warn"
                        : coverage.verdict === "exceeds"
                          ? " bar__fill--danger"
                          : "")
                    }
                    style={{
                      width: `${Math.min(100, coverage.percentOfAnnual)}%`,
                    }}
                  />
                </div>

                <p className="note">
                  <strong>
                    {fmt(hedgeKwh)} kWh
                  </strong>{" "}
                  is about{" "}
                  <strong>{fmt(coverage.equivalentDays, 1)} days</strong> of
                  this connection's typical consumption, and{" "}
                  {fmt(hoursAtPhysicalLimit(hedgeKwh, asset.physicalLimitKw), 1)}{" "}
                  hours at its physical limit. The rest of the period would be
                  priced by whichever other line applies.
                </p>

                {coverage.verdict === "negligible" && (
                  <div className="notice notice--warn">
                    <span className="notice__icon">!</span>
                    <div>
                      <p className="notice__title">
                        This hedge is very small for this connection
                      </p>
                      <p className="notice__body">
                        A hedge under 5% of consumption is more often a units
                        mistake than a deliberate position. Check whether MWh
                        was intended.
                      </p>
                    </div>
                  </div>
                )}

                {coverage.verdict === "exceeds" && (
                  <div className="notice notice--danger">
                    <span className="notice__icon">!</span>
                    <div>
                      <p className="notice__title">
                        This hedge exceeds what the connection consumes
                      </p>
                      <p className="notice__body">
                        A hedge bills the full volume whether it is used or not,
                        so the surplus would be paid for and not consumed.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(draft.type === "hedge" || draft.type === "spot") && (
          <div className="block">
            <div className="block__label">Market reference</div>

            <div className="stat">
              <span className="stat__name">
                Day-ahead average
                <span className="stat__sub">
                  last {market.hours} hours
                </span>
              </span>
              <span className="stat__value">
                €{fmt(market.averageEurPerMwh, 2)}/MWh
              </span>
            </div>

            <div className="stat">
              <span className="stat__name">
                Range
                <span className="stat__sub">same period</span>
              </span>
              <span className="stat__value">
                €{fmt(market.minEurPerMwh, 0)} to €
                {fmt(market.maxEurPerMwh, 0)}
              </span>
            </div>

            {draft.type === "hedge" && priceComparison.verdict !== "unset" && (
              <>
                <p className="note" style={{ marginTop: "var(--s-3)" }}>
                  Your hedge price of{" "}
                  <strong>€{fmt(draft.hedgePrice, 2)}/MWh</strong> is{" "}
                  <strong>
                    {Math.abs(priceComparison.deltaPercent) < 0.5
                      ? "level with"
                      : `${fmt(Math.abs(priceComparison.deltaPercent), 0)}% ${
                          priceComparison.deltaPercent < 0 ? "below" : "above"
                        }`}
                  </strong>{" "}
                  that average. A hedge is meant to differ from spot, so a
                  difference is not itself a problem.
                </p>

                {(priceComparison.verdict === "implausible-low" ||
                  priceComparison.verdict === "implausible-high") && (
                  <div className="notice notice--danger">
                    <span className="notice__icon">!</span>
                    <div>
                      <p className="notice__title">
                        This price is outside any plausible range
                      </p>
                      <p className="notice__body">
                        No supplier would agree to this. The usual cause is a
                        confusion between €/MWh and €/kWh, which differ by a
                        factor of 1,000.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            <p className="source">
              Source: day-ahead prices already held on the Market Data page.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
