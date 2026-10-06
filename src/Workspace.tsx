import { useMemo, useState } from "react";
import { Contract, ContractLine } from "./domain/types";
import { daysInPeriod, findGaps, findOverlaps } from "./domain/coverage";
import { hedgeCoverage, summariseConsumption, toKwh } from "./domain/volume";
import { compareToMarket, summariseMarket } from "./domain/market";
import { overlapCost, weightedSpotPrice } from "./domain/cost";
import { Ending, contractOf, endContract } from "./domain/contracts";
import { collectIssues } from "./domain/issues";
import { monthlySplit, yearShares } from "./domain/split";
import { analysisWindow, marketPrices } from "./data/mockData";
import { Scenario } from "./data/scenarios";
import { IssueList } from "./components/IssueList";
import { LineDraft, LineEditor } from "./components/LineEditor";
import { ConnectionFacts } from "./components/ConnectionFacts";
import { CoverageTimeline } from "./components/CoverageTimeline";
import { ConsumptionSplit } from "./components/ConsumptionSplit";

const DRAFT_ID = "__draft__";

/**
 * Every scenario opens pre-filled with the mistake I actually made on the
 * platform: a second day-ahead line from July, on a connection already priced
 * for the whole year. The real wizard accepted it without comment.
 */
function initialDraft(scenario: Scenario): LineDraft {
  return {
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
    name: "New line",
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
 * One connection, laid out in the order a reader needs it: what is wrong,
 * the contracts that show it, and the line being edited beside them.
 */
export function Workspace({ scenario }: Props) {
  const [draft, setDraft] = useState<LineDraft>(() => initialDraft(scenario));
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

  const issues = useMemo(
    () =>
      collectIssues({
        overlaps,
        gaps,
        draft,
        coverage,
        price: priceComparison,
        physicalLimitKw: scenario.asset.physicalLimitKw,
      }),
    [overlaps, gaps, draft, coverage, priceComparison, scenario.asset],
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
      `${target.name} now ends on ${when}, handing over cleanly to the new line. Reset puts it back.`,
    );
  };

  const reset = () => {
    setDraft(initialDraft(scenario));
    setContracts(scenario.contracts);
    setResolved(null);
  };

  return (
    <>
      <IssueList
        issues={issues}
        hedge={{
          volume: draft.hedgeVolume,
          unit: draft.hedgeVolumeUnit,
          kwh: hedgeKwh,
          price: draft.hedgePrice,
          coverage,
        }}
        marketAverage={market.averageEurPerMwh}
        physicalLimitKw={scenario.asset.physicalLimitKw}
        contracts={contracts}
        draftId={DRAFT_ID}
        resolved={resolved}
        onEnd={applyEnding}
      />

      <div className="layout">
        <div className="layout__main">
          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Contracts on this connection, 2026</h2>
              <p className="card__hint">The new line is in orange.</p>
            </div>
            <div className="card__body">
              <CoverageTimeline
                lines={existingLines}
                draftLine={draftLine}
                window={analysisWindow}
                contracts={contracts}
              />
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">How your electricity is priced each month</h2>
              <p className="card__hint">
                Expected use at this connection’s usual rate, split between the
                fixed-price hedge and the market price. Hedged amounts are
                spread evenly over their dates; seasons are ignored.
              </p>
            </div>
            <div className="card__body">
              <ConsumptionSplit months={months} shares={yearShares(months)} />
            </div>
          </section>
        </div>

        <aside className="layout__side">
          <LineEditor
            draft={draft}
            onChange={setDraft}
            onReset={reset}
            market={market}
            coverage={coverage}
            priceComparison={priceComparison}
          />
          <ConnectionFacts
            asset={scenario.asset}
            consumption={consumption}
            market={market}
          />
        </aside>
      </div>
    </>
  );
}
