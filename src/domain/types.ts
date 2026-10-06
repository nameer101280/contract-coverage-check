/**
 * Domain model, deliberately narrower than Companion's.
 *
 * Companion has 17 contract line types. This prototype models three, because
 * three is enough to demonstrate the problem: two that set a price for the same
 * energy flow (spot, hedge) and one that adds to it without competing (markup).
 * Adding the other fourteen would be breadth where the case asked for depth.
 */

/** Which way the energy physically moves. */
export type EnergyDirection = "consumption" | "injection";

export type LineType = "spot" | "hedge" | "markup";

/**
 * A line is "price-setting" if it establishes the base price for a volume of
 * energy. Two price-setting lines on the same asset, direction and period are
 * a conflict: the same kWh gets priced twice.
 *
 * A markup is additive. It sits on top of whatever the base price is, so two
 * markups overlapping is normal and not worth flagging.
 */
export const PRICE_SETTING_TYPES: readonly LineType[] = ["spot", "hedge"];

export type VolumeUnit = "kWh" | "MWh";

/** A closed date range. Both ends inclusive. */
export interface Period {
  /** ISO date, YYYY-MM-DD */
  from: string;
  /** ISO date, YYYY-MM-DD */
  to: string;
}

export interface ContractLine {
  id: string;
  name: string;
  type: LineType;
  direction: EnergyDirection;
  period: Period;

  /** Spot: price = scaling × dayAhead + constant (€/MWh) */
  scaling?: number;
  constant?: number;

  /** Hedge: a fixed volume at a fixed price */
  hedgeVolume?: number;
  hedgeVolumeUnit?: VolumeUnit;
  hedgePrice?: number;

  /** Markup: a flat addition in €/MWh */
  markup?: number;
}

export interface Contract {
  id: string;
  name: string;
  supplier?: string;
  period: Period;
  lines: ContractLine[];
  /** Grid tariffs are set by the DSO and maintained by Companion. */
  managedByCompanion?: boolean;
}

export interface Asset {
  id: string;
  name: string;
  /** Maximum power the connection can physically draw, in kW. */
  physicalLimitKw: number;
  /** Contractual access power, in kW. */
  accessPowerKw: number;
}

/** One interval from the meter. Companion collects these every 15 minutes. */
export interface MeterReading {
  /** ISO timestamp, UTC */
  at: string;
  /** Energy consumed in that interval, kWh */
  consumptionKwh: number;
}

/** Day-ahead market price for one hour. */
export interface MarketPrice {
  at: string;
  /** €/MWh */
  priceEurPerMwh: number;
}
