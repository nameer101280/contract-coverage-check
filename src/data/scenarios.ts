import { Asset, Contract, MeterReading } from "../domain/types";
import { asset, contracts, meterReadings } from "./mockData";
import { factoryAsset, factoryContracts, factoryReadings } from "./factory";

/**
 * The connections the prototype can switch between. Each opens on the same
 * mistake: a new day-ahead line from 1 July on a connection whose existing
 * contract already covers the whole year.
 */
export interface Scenario {
  id: string;
  /** Shown on the switch */
  label: string;
  /** Where the data comes from, said plainly */
  source: string;
  /** Grid operator and connection type */
  connection: string;
  asset: Asset;
  readings: MeterReading[];
  contracts: Contract[];
  /** What the new line starts with in this scenario */
  draft: { constant: number; hedgeVolume: number; hedgePrice: number };
}

export const scenarios: Scenario[] = [
  {
    id: "flat",
    label: "Household",
    source: "My own flat: real meter total and contracts",
    connection: "Fluvius, Zenne-Dijle",
    asset,
    readings: meterReadings,
    contracts,
    draft: { constant: 12, hedgeVolume: 100, hedgePrice: 60 },
  },
  {
    id: "factory",
    label: "Industrial site",
    source: "Illustrative: invented, at a typical industrial scale",
    connection: "Fluvius, medium voltage",
    asset: factoryAsset,
    readings: factoryReadings,
    contracts: factoryContracts,
    // 400 typed as kWh where the supplier contract says 400 MWh: the units
    // slip the form invites, a thousandfold out.
    draft: { constant: 6.5, hedgeVolume: 400, hedgePrice: 98 },
  },
];
