import { useState } from "react";
import { scenarios } from "./data/scenarios";
import { Workspace } from "./Workspace";
import "./styles/app.css";

export default function App() {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

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

        <div className="scenarios" role="group" aria-label="Connection">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              className="scenario"
              aria-pressed={s.id === scenario.id}
              onClick={() => setScenarioId(s.id)}
            >
              <span className="scenario__label">{s.label}</span>
              <span className="scenario__source">{s.source}</span>
            </button>
          ))}
        </div>

        <span className="asset-chip">
          ⚡ {scenario.asset.name}
          <span className="asset-chip__meta">
            Grid connection · {scenario.connection} ·{" "}
            {scenario.asset.physicalLimitKw} kW
          </span>
        </span>
      </header>

      {/* Keyed on the scenario, so switching starts from that scenario's own
          contracts and draft rather than carrying edits across. */}
      <Workspace key={scenario.id} scenario={scenario} />

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
