import { useState } from "react";
import { MonthSplit, YearShares } from "../domain/split";
import { formatKwh, formatPercent, unitFor } from "./format";

/**
 * How the year's consumption divides between hedge and spot.
 *
 * One column per month, stacked from the baseline: what the hedges fix, then
 * what is left on spot. Hedged volume beyond the month's consumption sits on
 * top in the danger colour, because that energy is paid for and never used.
 * Every value is also in the summary line and the table, so the hover
 * readout adds detail but never gates it.
 */

const PLOT_PX = 160;

const SEGMENTS = [
  { key: "hedged", label: "Hedged", className: "split__seg--hedged" },
  { key: "spot", label: "On spot", className: "split__seg--spot" },
  { key: "unpriced", label: "No price", className: "split__seg--unpriced" },
  { key: "excess", label: "Hedged beyond consumption", className: "split__seg--excess" },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]["key"];

function valueOf(m: MonthSplit, key: SegmentKey): number {
  switch (key) {
    case "hedged":
      return Math.min(m.hedgedKwh, m.expectedKwh);
    case "spot":
      return m.spotKwh;
    case "unpriced":
      return m.unpricedKwh;
    case "excess":
      return m.excessKwh;
  }
}

/** The smallest 1, 2, 2.5 or 5 × 10ⁿ at or above n, for clean axis ticks. */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= n) ?? 10;
  return step * magnitude;
}

interface Props {
  months: MonthSplit[];
  shares: YearShares;
}

export function ConsumptionSplit({ months, shares }: Props) {
  const [active, setActive] = useState<number | null>(null);

  const max = niceCeil(
    Math.max(...months.map((m) => Math.max(m.expectedKwh, m.hedgedKwh))),
  );
  const ticks = [max, max / 2, 0];
  const unit = unitFor(max);
  const shown = SEGMENTS.filter(
    (s) => s.key === "hedged" || s.key === "spot" || months.some((m) => valueOf(m, s.key) > 0),
  );

  return (
    <div className="split-chart">
      <p className="split-chart__summary">
        Across the year: <strong>{formatPercent(shares.hedged)} hedged</strong>,{" "}
        <strong>{formatPercent(shares.spot)} on spot</strong>
        {shares.unpriced > 0 && (
          <>
            , <strong>{formatPercent(shares.unpriced)} with no price</strong>
          </>
        )}
        .
      </p>
      {shares.excessKwh > 0 && (
        <p className="split-chart__alert">
          <span aria-hidden="true">!</span> Hedges exceed expected consumption by{" "}
          <strong>{formatKwh(shares.excessKwh)}</strong>: paid for at the hedge
          price, never used.
        </p>
      )}

      <ul className="split-chart__legend">
        {shown.map((s) => (
          <li key={s.key}>
            <span className={`split-chart__key ${s.className}`} />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="split-chart__plot">
        <div className="split-chart__axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t}>{formatKwh(t, unit)}</span>
          ))}
        </div>

        <div className="split-chart__columns" style={{ height: PLOT_PX }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="split-chart__grid"
              style={{ bottom: (t / max) * PLOT_PX }}
            />
          ))}

          {months.map((m, i) => {
            const parts = SEGMENTS.map((s) => ({
              ...s,
              px: (valueOf(m, s.key) / max) * PLOT_PX,
            })).filter((p) => p.px >= 0.5);

            return (
              <div
                key={m.label}
                className="split-chart__slot"
                tabIndex={0}
                aria-label={`${m.label}: ${SEGMENTS.map(
                  (s) => `${s.label} ${formatKwh(valueOf(m, s.key), unit)}`,
                ).join(", ")}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <div className="split-chart__column">
                  {parts.map((p, idx) => (
                    <div
                      key={p.key}
                      className={
                        `split__seg ${p.className}` +
                        (idx === parts.length - 1 ? " split__seg--top" : "") +
                        (idx > 0 ? " split__seg--stacked" : "")
                      }
                      style={{ height: p.px }}
                    />
                  ))}
                </div>
                <span className="split-chart__month">{m.label}</span>

                {active === i && (
                  <div className="split-chart__tip" role="tooltip">
                    <div className="split-chart__tip-title">
                      {m.label} · {formatKwh(m.expectedKwh, unit)} expected
                    </div>
                    {SEGMENTS.filter((s) => valueOf(m, s.key) > 0).map((s) => (
                      <div key={s.key} className="split-chart__tip-row">
                        <span className={`split-chart__line ${s.className}`} />
                        <strong>{formatKwh(valueOf(m, s.key), unit)}</strong> {s.label.toLowerCase()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <details className="split-chart__table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Expected</th>
              {shown.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                <td>{formatKwh(m.expectedKwh, unit)}</td>
                {shown.map((s) => (
                  <td key={s.key}>{formatKwh(valueOf(m, s.key), unit)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
