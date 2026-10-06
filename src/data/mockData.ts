import {
  Asset,
  Contract,
  ContractLine,
  MarketPrice,
  MeterReading,
} from "../domain/types";

/**
 * Data from my own session on the platform, not invented.
 *
 * I registered a real grid connection (my flat in Leuven, Fluvius as DSO,
 * Zenne-Dijle, Laagspanningsnet - piekmeting) and connected my actual digital
 * meter, so the consumption figures below come from a real Fluvius feed:
 * 369.73 kWh from 1 September to 6 October 2026, as the platform's Energy
 * Cost report shows it.
 *
 * The two supplier contracts are the ones I created in the real wizard. The
 * overlap between them is the mistake I made without being told.
 */

export const asset: Asset = {
  id: "flavius",
  name: "Flavius",
  // Entered in the asset configuration screen, whose own help text says the
  // value is used for "validating that your energy flows stay within the
  // physical boundaries of your installation".
  physicalLimitKw: 7.4,
  accessPowerKw: 7.4,
};

/**
 * 15-minute readings reconstructed to match the shape and total of the real
 * feed: 369.73 kWh across 36 days, baseline around 0.1 kW overnight, a morning
 * bump, an evening peak near 1 kW, and occasional appliance bursts.
 *
 * Deterministic so the prototype looks the same on every load.
 */
function buildReadings(): MeterReading[] {
  const out: MeterReading[] = [];
  const start = Date.parse("2026-09-01T00:00:00Z");
  const intervals = 36 * 96; // 1 Sep to 6 Oct, in quarter hours

  // Small deterministic pseudo-random source, so no dependency and no drift.
  let seed = 20260901;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let i = 0; i < intervals; i++) {
    const at = start + i * 900_000;
    const hour = ((at / 3_600_000) % 24 + 24) % 24;

    const base = 0.055;
    const morning = 0.09 * Math.exp(-((hour - 8) ** 2) / 1.6);
    const evening = 0.22 * Math.exp(-((hour - 19.5) ** 2) / 3.2);

    let kwh = (base + morning + evening) * (0.82 + rand() * 0.36);
    if (rand() < 0.012) kwh += 0.25 + rand() * 0.45;

    // Cannot exceed the physical limit: 7.4 kW for 15 minutes = 1.85 kWh.
    out.push({
      at: new Date(at).toISOString(),
      consumptionKwh: Math.min(Number(kwh.toFixed(3)), 1.85),
    });
  }

  // Scale to the real metered total so the headline figure is the true one.
  const total = out.reduce((s, r) => s + r.consumptionKwh, 0);
  const factor = 369.73 / total;
  return out.map((r) => ({
    ...r,
    consumptionKwh: Number((r.consumptionKwh * factor).toFixed(4)),
  }));
}

export const meterReadings: MeterReading[] = buildReadings();

/**
 * Hourly day-ahead prices for the same 36 days as the readings, with a
 * Belgian shape: a midday dip when solar is abundant, an evening peak, the
 * occasional scarcity spike and the occasional negative hour.
 *
 * The shape is generated, but the level is not. It is matched to the Market
 * Data page for 1 September to 6 October 2026, which shows an average of
 * €161.40/MWh, a low of −€1.95 and a daily spread of about €220.
 */
function buildPrices(): MarketPrice[] {
  const out: MarketPrice[] = [];
  const start = Date.parse("2026-09-01T00:00:00Z");
  let seed = 7215;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let i = 0; i < 36 * 24; i++) {
    const at = start + i * 3_600_000;
    const hour = ((at / 3_600_000) % 24 + 24) % 24;

    // Midday solar dip, evening scarcity peak.
    const dip = -60 * Math.exp(-((hour - 13) ** 2) / 8);
    const peak = 105 * Math.exp(-((hour - 19) ** 2) / 6);
    let price = 156 + dip + peak + (rand() - 0.5) * 40;

    // A still evening with low reserves.
    if (rand() < 0.004) price += 100 + rand() * 250;

    // Negative prices happen on windy, sunny, low-demand hours.
    if (rand() < 0.015) price = -(0.5 + rand() * 1.5);

    out.push({
      at: new Date(at).toISOString(),
      priceEurPerMwh: Number(price.toFixed(2)),
    });
  }
  return out;
}

export const marketPrices: MarketPrice[] = buildPrices();

/** What already prices this asset before the user adds anything. */
export const contracts: Contract[] = [
  {
    id: "engie-2026",
    name: "Engie supply 2026",
    supplier: "Engie",
    period: { from: "2026-01-01", to: "2026-12-31" },
    lines: [
      {
        id: "engie-spot",
        name: "Day-ahead energy",
        type: "spot",
        direction: "consumption",
        period: { from: "2026-01-01", to: "2026-12-31" },
        scaling: 1,
        constant: 9,
      },
      {
        id: "engie-hedge",
        name: "Hedge",
        type: "hedge",
        direction: "consumption",
        period: { from: "2026-01-01", to: "2026-12-31" },
        hedgeVolume: 100,
        hedgeVolumeUnit: "kWh",
        hedgePrice: 60,
      },
    ],
  },
];

/**
 * The second contract — "Luminus supply", 1 July to 31 December, spot at
 * 1 × spot + 12.00 — is deliberately NOT in this list. It is what the user is
 * drafting in the form: a new supplier taken on mid-year, with the old
 * contract never ended. That is the mistake I made on the real platform, and
 * the one this prototype catches before it is saved.
 */

/** Every line that prices this asset, flattened, as the asset view shows them. */
export const existingLines: ContractLine[] = contracts.flatMap((c) => c.lines);

/** Which contract a line came from, for naming it in a warning. */
export const contractForLine = (lineId: string): Contract | undefined =>
  contracts.find((c) => c.lines.some((l) => l.id === lineId));

/** The window the coverage timeline is drawn against. */
export const analysisWindow = { from: "2026-01-01", to: "2026-12-31" };
