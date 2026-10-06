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
        <div>
          <h1 className="page__title">Contract check</h1>
          <p className="page__subtitle">
            Checks a new contract line against what Companion already knows
            about the connection: its meter data, market prices and other
            contracts.
          </p>
          <span className="asset-chip">
            ⚡ {scenario.asset.name}
            <span className="asset-chip__meta">
              Grid connection · {scenario.connection} ·{" "}
              {scenario.asset.physicalLimitKw} kW
            </span>
          </span>
        </div>

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
      </header>

      {/* Keyed on the scenario, so switching starts from that scenario's own
          contracts and draft rather than carrying edits across. */}
      <Workspace key={scenario.id} scenario={scenario} />

      <p className="footnote">
        Nothing here blocks saving. Some overlaps are correct: a hedge is meant
        to sit alongside a market-price line, and a genuine supplier switch can
        overlap for a few days during a handover. Refusing a real deal is worse
        than allowing a mistaken one, so the user keeps the decision and simply
        stops making it blind.
      </p>
    </div>
  );
}
