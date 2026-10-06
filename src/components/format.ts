import { ContractLine } from "../domain/types";

/** Display formatting shared by the components. */

/** €9, or €6.50 when there are cents. */
function euros(n: number): string {
  return Number.isInteger(n) ? `€${n}` : `€${n.toFixed(2)}`;
}

/**
 * A line's price in words: "market price + €9" rather than the form's
 * "1 × spot + 9.00". The form keeps Companion's notation; warnings and the
 * timeline have to be understood without knowing it.
 */
export function plainPrice(line: ContractLine): string {
  if (line.type === "spot") {
    const scaling = line.scaling ?? 1;
    const constant = line.constant ?? 0;
    const base = scaling === 1 ? "market price" : `${scaling} × market price`;
    if (constant === 0) return base;
    return constant > 0
      ? `${base} + ${euros(constant)}`
      : `${base} − ${euros(-constant)}`;
  }
  if (line.type === "hedge") {
    const volume = (line.hedgeVolume ?? 0).toLocaleString("en-GB", {
      maximumFractionDigits: 1,
    });
    return `${volume} ${line.hedgeVolumeUnit ?? "kWh"} fixed at ${euros(
      line.hedgePrice ?? 0,
    )}/MWh`;
  }
  return `+${euros(line.markup ?? line.constant ?? 0)}/MWh`;
}

export type EnergyUnit = "kWh" | "MWh";

/** MWh once numbers of this size would be too long to read at a glance. */
export function unitFor(kwh: number): EnergyUnit {
  return kwh >= 100_000 ? "MWh" : "kWh";
}

/**
 * kWh or MWh. Pass a unit when several numbers are read side by side, so a
 * chart or tooltip does not mix the two.
 */
export function formatKwh(n: number, unit: EnergyUnit = unitFor(n)): string {
  const value = unit === "MWh" ? n / 1000 : n;
  const digits = value < 100 ? 1 : 0;
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: digits })} ${unit}`;
}

/** Whole euros once the amount is large enough that cents are noise. */
export function formatEur(n: number): string {
  const digits = n < 100 ? 2 : 0;
  return `€${n.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatPercent(share: number): string {
  const pct = share * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  return `${pct.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
}
