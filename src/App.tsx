import { useMemo, useState } from "react";
import { ContractLine } from "./domain/types";
import { findGaps, findOverlaps } from "./domain/coverage";
import {
  hedgeCoverage,
  summariseConsumption,
  toKwh,
} from "./domain/volume";
import { compareToMarket, summariseMarket } from "./domain/market";
import {
  analysisWindow,
  asset,
  existingLines,
  marketPrices,
  meterReadings,
} from "./data/mockData";
import { LineDraft, LineForm } from "./components/LineForm";
import { ContextPanel } from "./components/ContextPanel";
import { CoverageTimeline } from "./components/CoverageTimeline";
import { ConflictNotice } from "./components/ConflictNotice";
import "./styles/app.css";

const DRAFT_ID = "__draft__";

/**
 * The prototype opens pre-filled with the mistake I actually made on the
 * platform: a second day-ahead line from July, on a connection already priced
 * for the whole year. The real wizard accepted it without comment.
 */
const INITIAL_DRAFT: LineDraft = {
  name: "Day-ahead energy",
  type: "spot",
  direction: "consumption",
  from: "2026-07-01",
  to: "2026-12-31",
  scaling: 1,
  constant: 12,
  hedgeVolume: 100,
  hedgeVolumeUnit: "kWh",
  hedgePrice: 60,
};

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

export default function App() {
  const [draft, setDraft] = useState<LineDraft>(INITIAL_DRAFT);
  const [saved, setSaved] = useState(false);

  // These summaries never change, so they are computed once.
  const consumption = useMemo(
    () => summariseConsumption(meterReadings),
    [],
  );
  const market = useMemo(() => summariseMarket(marketPrices), []);

  const draftLine = useMemo(() => draftToLine(draft), [draft]);

  const hedgeKwh = toKwh(draft.hedgeVolume, draft.hedgeVolumeUnit);

  const coverage = useMemo(
    () =>
      draft.type === "hedge"
        ? hedgeCoverage(hedgeKwh, consumption)
        : { percentOfAnnual: 0, equivalentDays: 0, verdict: "none" as const },
    [draft.type, hedgeKwh, consumption],
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
    [draftLine],
  );

  const overlaps = useMemo(() => findOverlaps(allLines), [allLines]);
  const gaps = useMemo(
    () => findGaps(allLines, analysisWindow, "consumption"),
    [allLines],
  );

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Contract coverage check</h1>
        <p className="page__subtitle">
          A contract line editor that shows what the platform already knows:
          what this connection consumes, what the market costs, and what
          already prices it. Nothing here is new data — all three live one click
          away from the real wizard, which uses none of them.
        </p>
        <span className="asset-chip">
          ⚡ {asset.name}
          <span className="asset-chip__meta">
            Grid connection · Fluvius, Zenne-Dijle ·{" "}
            {asset.physicalLimitKw} kW
          </span>
        </span>
      </header>

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
              onClick={() => {
                setDraft(INITIAL_DRAFT);
                setSaved(false);
              }}
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
          asset={asset}
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
          />
          <div style={{ marginTop: "var(--s-4)" }}>
            <ConflictNotice
              overlaps={overlaps}
              gaps={gaps}
              draftId={DRAFT_ID}
            />
          </div>
        </div>
      </section>

      <p className="footnote">
        Warnings rather than blocks: some overlaps are correct. A hedge is meant
        to sit alongside a spot line, and a genuine supplier switch can overlap
        during a handover. Refusing to save a real deal is a worse failure than
        permitting a mistaken one, so the user keeps the decision and simply
        stops making it blind.
      </p>
    </div>
  );
}
