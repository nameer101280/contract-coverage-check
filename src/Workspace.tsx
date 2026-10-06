import { useMemo, useState } from "react";
import { Contract, ContractLine } from "./domain/types";
import { daysInPeriod, findGaps, findOverlaps } from "./domain/coverage";
import {
  hedgeCoverage,
  summariseConsumption,
  toKwh,
} from "./domain/volume";
import { compareToMarket, summariseMarket } from "./domain/market";
import { overlapCost, weightedSpotPrice } from "./domain/cost";
import { analysisWindow, marketPrices } from "./data/mockData";
import { Scenario } from "./data/scenarios";
import { Ending, contractOf, endContract } from "./domain/contracts";
import { LineDraft, LineForm } from "./components/LineForm";
import { ContextPanel } from "./components/ContextPanel";
import { CoverageTimeline } from "./components/CoverageTimeline";
import { ConflictNotice } from "./components/ConflictNotice";
import { ConsumptionSplit } from "./components/ConsumptionSplit";
import { monthlySplit, yearShares } from "./domain/split";

const DRAFT_ID = "__draft__";

/**
 * Every scenario opens pre-filled with the mistake I actually made on the
 * platform: a second day-ahead line from July, on a connection already priced
 * for the whole year. The real wizard accepted it without comment.
 */
function initialDraft(scenario: Scenario): LineDraft {
  return {
    name: "Day-ahead energy",
    type: "spot",
    direction: "consumption",
    from: "2026-07-01",
    to: "2026-12-31",
    scaling: 1,
    constant: scenario.draft.constant,
    hedgeVolume: scenario.draft.hedgeVolume,
    hedgeVolumeUnit: "kWh",
    hedgePrice: scenario.draft.hedgePrice,
  };
}

function draftToLine(draft: LineDraft): ContractLine {
  return {
    id: DRAFT_ID,
    name: draft.name,
    type: draft.type,
    direction: draft.direction,
    period: { from: draft.from, to: draft.to },
    scaling: draft.scaling,
    constant: draft.constant,
    hedgeVolume: draft.hedgeVolume,
    hedgeVolumeUnit: draft.hedgeVolumeUnit,
    hedgePrice: draft.hedgePrice,
  };
}

interface Props {
  scenario: Scenario;
}

/**
 * The editor for one connection: the form, what the platform knows about the
 * connection, and every line that already prices it.
 */
export function Workspace({ scenario }: Props) {
  const [draft, setDraft] = useState<LineDraft>(() => initialDraft(scenario));
  const [saved, setSaved] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>(scenario.contracts);
  const [resolved, setResolved] = useState<string | null>(null);

  const existingLines = useMemo(
    () => contracts.flatMap((c) => c.lines),
    [contracts],
  );

  const consumption = useMemo(
    () => summariseConsumption(scenario.readings),
    [scenario.readings],
  );
  const market = useMemo(() => summariseMarket(marketPrices), []);

  const draftLine = useMemo(() => draftToLine(draft), [draft]);

  const periodDays = daysInPeriod(draftLine.period);
  const hedgeKwh = toKwh(
    draft.hedgeVolume,
    draft.hedgeVolumeUnit,
    periodDays * 24,
  );

  const coverage = useMemo(
    () =>
      draft.type === "hedge"
        ? hedgeCoverage(hedgeKwh, consumption, periodDays)
        : {
            percentOfPeriod: 0,
            expectedKwh: 0,
            equivalentDays: 0,
            verdict: "none" as const,
          },
    [draft.type, hedgeKwh, consumption, periodDays],
  );

  const priceComparison = useMemo(
    () =>
      draft.type === "hedge"
        ? compareToMarket(draft.hedgePrice, market)
        : { deltaPercent: 0, verdict: "unset" as const },
    [draft.type, draft.hedgePrice, market],
  );

  const allLines = useMemo(
    () => [...existingLines, draftLine],
    [existingLines, draftLine],
  );

  const weightedPrice = useMemo(
    () => weightedSpotPrice(scenario.readings, marketPrices),
    [scenario.readings],
  );

  const overlaps = useMemo(
    () =>
      findOverlaps(allLines).map((o) => ({
        ...o,
        cost:
          weightedPrice === null
            ? null
            : overlapCost(o, consumption.perDayKwh, weightedPrice),
      })),
    [allLines, consumption.perDayKwh, weightedPrice],
  );
  const gaps = useMemo(
    () => findGaps(allLines, analysisWindow, "consumption"),
    [allLines],
  );

  const months = useMemo(
    () =>
      monthlySplit(
        allLines,
        consumption.perDayKwh,
        Number(analysisWindow.from.slice(0, 4)),
      ),
    [allLines, consumption.perDayKwh],
  );

  const applyEnding = ({ lineId, lastDay }: Ending) => {
    const when = new Date(`${lastDay}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

    if (lineId === DRAFT_ID) {
      setDraft({ ...draft, to: lastDay });
      setResolved(`This new line now ends on ${when}.`);
      return;
    }

    const target = contractOf(contracts, lineId);
    if (!target) return;
    setContracts(
      contracts.map((c) => (c.id === target.id ? endContract(c, lastDay) : c)),
    );
    setResolved(
      `${target.name} now ends on ${when}, handing over cleanly to this new line.`,
    );
  };

  const reset = () => {
    setDraft(initialDraft(scenario));
    setContracts(scenario.contracts);
    setResolved(null);
    setSaved(false);
  };

  return (
    <>
      <div className="split">
        <div>
          <LineForm draft={draft} onChange={setDraft} market={market} />

          <div className="actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setSaved(true)}
            >
              Add line
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={reset}
            >
              Reset
            </button>
            <span className="actions__hint">
              {saved
                ? "Saved. Warnings do not block saving — see below for why."
                : "Warnings never block saving."}
            </span>
          </div>
        </div>

        <ContextPanel
          asset={scenario.asset}
          consumption={consumption}
          market={market}
          draft={draft}
          hedgeKwh={hedgeKwh}
          coverage={coverage}
          priceComparison={priceComparison}
        />
      </div>

      <section className="card" style={{ marginTop: "var(--s-4)" }}>
        <div className="card__head">
          <h2 className="card__title">Coverage — consumption, 2026</h2>
          <p className="card__hint">
            Every line that prices this connection, drawn against one axis.
          </p>
        </div>
        <div className="card__body">
          <CoverageTimeline
            lines={existingLines}
            draftLine={draftLine}
            window={analysisWindow}
            contracts={contracts}
          />
          <div style={{ marginTop: "var(--s-4)" }}>
            {resolved && (
              <div className="notice notice--ok">
                <span className="notice__icon">✓</span>
                <div>
                  <p className="notice__title">{resolved}</p>
                  <p className="notice__body">
                    Reset puts the original contracts back.
                  </p>
                </div>
              </div>
            )}
            <ConflictNotice
              overlaps={overlaps}
              gaps={gaps}
              draftId={DRAFT_ID}
              contracts={contracts}
              onEnd={applyEnding}
            />
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: "var(--s-4)" }}>
        <div className="card__head">
          <h2 className="card__title">How consumption divides, 2026</h2>
          <p className="card__hint">
            Expected consumption each month at the metered rate, split between
            what the hedges fix and what is left on spot. Hedged amounts are
            spread evenly over their dates; seasonality is ignored.
          </p>
        </div>
        <div className="card__body">
          <ConsumptionSplit months={months} shares={yearShares(months)} />
        </div>
      </section>
    </>
  );
}
