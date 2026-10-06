/** Display formatting shared by the components. */

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
