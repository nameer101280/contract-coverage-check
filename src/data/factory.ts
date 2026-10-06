import { Asset, Contract, MeterReading } from "../domain/types";
import { seededRandom } from "./random";

/**
 * An illustrative industrial site. Unlike the flat, none of this is from a
 * real account: it exists to show the same checks at the scale Companion's
 * customers actually work at, where the same mistakes cost thousands.
 *
 * The figures are typical of a mid-sized Belgian plant on medium voltage:
 * about 1.7 GWh a year, two shifts on weekdays, a low base load at night and
 * at weekends.
 */

export const factoryAsset: Asset = {
  id: "ghent-plant",
  name: "Ghent plant",
  physicalLimitKw: 500,
  accessPowerKw: 450,
};

/**
 * 15-minute readings for the same 36 days as the flat: about 330 kW while the
 * two shifts run (06:00–22:00 on weekdays), about 70 kW otherwise, and the
 * odd peak when several lines start at once.
 */
function buildReadings(): MeterReading[] {
  const out: MeterReading[] = [];
  const start = Date.parse("2026-09-01T00:00:00Z");
  const rand = seededRandom(4242);

  for (let i = 0; i < 36 * 96; i++) {
    const at = start + i * 900_000;
    const date = new Date(at);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    const weekday = date.getUTCDay() >= 1 && date.getUTCDay() <= 5;
    const shifts = weekday && hour >= 6 && hour < 22;

    let kw = (shifts ? 330 : 70) * (0.9 + rand() * 0.2);
    if (shifts && rand() < 0.01) kw += 60 + rand() * 50;

    // Cannot exceed the physical limit: 500 kW for 15 minutes = 125 kWh.
    out.push({
      at: date.toISOString(),
      consumptionKwh: Math.min(Number((kw / 4).toFixed(3)), 125),
    });
  }
  return out;
}

export const factoryReadings: MeterReading[] = buildReadings();

/** A year-long supply deal: spot plus a margin, and a hedge on 800 MWh. */
export const factoryContracts: Contract[] = [
  {
    id: "factory-2026",
    name: "Annual supply 2026",
    period: { from: "2026-01-01", to: "2026-12-31" },
    lines: [
      {
        id: "factory-spot",
        name: "Day-ahead energy",
        type: "spot",
        direction: "consumption",
        period: { from: "2026-01-01", to: "2026-12-31" },
        scaling: 1,
        constant: 4,
      },
      {
        id: "factory-hedge",
        name: "Hedge",
        type: "hedge",
        direction: "consumption",
        period: { from: "2026-01-01", to: "2026-12-31" },
        hedgeVolume: 800_000,
        hedgeVolumeUnit: "kWh",
        hedgePrice: 95,
      },
    ],
  },
];
