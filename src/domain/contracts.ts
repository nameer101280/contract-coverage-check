import { Overlap, daysInPeriod } from "./coverage";
import { Contract } from "./types";

/**
 * Resolving an overlap, not just reporting it.
 *
 * Almost every overlap between two spot lines has the same cause: a new
 * supplier was added and the old contract was never ended. So the fix is
 * almost always the same too, and the warning can offer it directly instead
 * of sending the user off to find the right contract and date.
 */

const MS_PER_DAY = 86_400_000;

export function dayBefore(isoDate: string): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) - MS_PER_DAY;
  return new Date(t).toISOString().slice(0, 10);
}

export function contractOf(
  contracts: Contract[],
  lineId: string,
): Contract | undefined {
  return contracts.find((c) => c.lines.some((l) => l.id === lineId));
}

/**
 * The same contract, ending on `lastDay`.
 *
 * Lines still running on that day stop then; lines that would only have
 * started later are dropped. A hedge in kWh is a fixed amount spread evenly
 * over its dates, so it keeps only the share that falls before the end. A
 * hedge in kW is a rate, so it is unchanged.
 */
export function endContract(contract: Contract, lastDay: string): Contract {
  const lines = contract.lines
    .filter((l) => l.period.from <= lastDay)
    .map((l) => {
      if (l.period.to <= lastDay) return l;
      const period = { from: l.period.from, to: lastDay };
      if (l.type !== "hedge" || l.hedgeVolumeUnit === "kW") {
        return { ...l, period };
      }
      const kept = daysInPeriod(period) / daysInPeriod(l.period);
      return { ...l, period, hedgeVolume: (l.hedgeVolume ?? 0) * kept };
    });

  return {
    ...contract,
    period: {
      from: contract.period.from,
      to: contract.period.to < lastDay ? contract.period.to : lastDay,
    },
    lines,
  };
}

export interface Ending {
  /** The line whose contract should end */
  lineId: string;
  lastDay: string;
}

/**
 * Which line to end, and when, so two spot lines hand over cleanly.
 *
 * The one that started first is the one that was never ended, so it stops the
 * day before the other begins. When both start on the same day there is no
 * handover to restore and the choice is the user's, so nothing is suggested.
 */
export function suggestEnding(overlap: Overlap): Ending | null {
  const spot = overlap.lines.filter((l) => l.type === "spot");
  if (spot.length !== 2) return null;

  const [a, b] = spot;
  if (a.period.from === b.period.from) return null;
  const [earlier, later] = a.period.from < b.period.from ? [a, b] : [b, a];
  return { lineId: earlier.id, lastDay: dayBefore(later.period.from) };
}
