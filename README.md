# Contract coverage check

A prototype for the Companion.energy contract management case.

It is a contract line editor for a single grid connection. As you fill in a
line, it checks the line against what is already known about that connection:
how much it consumes, how much power it can physically draw, what day-ahead
electricity has cost recently, and which contract lines already price it.

![The app on first load](docs/screenshot.png)

---

## Running it

Requires Node.js 18 or newer.

```bash
npm install
npm run dev      # then open http://localhost:5173
```

Other commands:

```bash
npm test         # run the test suite (70 tests)
npm run build    # type-check and build for production
```

There is no backend, login or database. All data is mocked and built into the
app.

---

## What's on the screen

The app opens with a new **Day-ahead energy** line from 1 July to 31 December
2026, on a connection whose existing contract (*Engie supply 2026*) already
prices the whole year.

**New contract line** (left). The form for the line being added:

- Line types: **Spot price**, **Hedge** and **Markup**
- Energy direction: consumption or injection
- Spot: scaling and constant, with a formula preview that also shows what the
  line would have cost per MWh at recent day-ahead prices
- Hedge: volume in **kWh** or **kW**, and a price in €/MWh
- Markup: a flat €/MWh amount
- The dates the line applies

**Context panel** (right). Updates as you type:

- *This connection:* metered consumption, the yearly figure it extrapolates to,
  the highest 15-minute draw, and the physical power limit (7.4 kW)
- *What this hedge covers* (hedge lines only): the share of the connection's
  expected consumption during the line's dates, the same volume expressed in
  days of typical use, and a warning when the volume looks wrong
- *Market reference:* the recent day-ahead average and range, and how a hedge
  price compares with that average

**Coverage timeline** (bottom). Every line pricing the connection across 2026,
with the new line included, followed by a notice for each overlap or gap.

**Add line** stores nothing. It only confirms that warnings do not block
saving.

---

## What it checks

Nothing is ever blocked. Every check below produces a warning or a note.

| Situation | What the app shows |
| --- | --- |
| Two spot lines for the same direction on overlapping dates | A red warning naming both lines, their prices and the number of days that overlap |
| A hedge and a spot line on the same dates | An amber note: this is normal, but the screen does not show how the volume divides between them |
| One line ending 30 June and the next starting 1 July | Nothing. A clean handover is not an overlap |
| A markup on the same dates as anything else | Nothing. Markups add to a price rather than compete with it |
| Three or more lines overlapping on the same dates | One combined warning, not one per pair |
| Days in 2026 with no spot or hedge line for consumption | A gap warning |
| A hedge under 5% of expected consumption for its dates | "This hedge is very small for this connection" |
| A hedge over 100% of expected consumption for its dates | "This hedge exceeds what the connection consumes" |
| A hedge in kW above the 7.4 kW physical limit | "More power than this connection can draw" |
| A hedge price more than 5× above or below the market average | Flagged as a likely typo or unit mix-up |
| A hedge price within that range | Shown as a percentage above or below the market, without a warning |

A hedge in **kW** is read as that much power in every hour of the line's dates.
A hedge in **kWh** is a total amount of energy over those dates.

---

## Things to try

1. **Change Applies from to 1 January.** The overlap warning grows to the full
   year.
2. **Switch the line type to Hedge, keeping 1 January.** The 100 kWh volume is
   2.7% of the year's expected consumption and is flagged as very small.
3. **Set Applies from back to 1 July and the volume to 2,000 kWh.** That is
   about half a year's consumption, but more than the connection uses between
   July and December, so it is flagged as exceeding it.
4. **Switch the unit to kW and set the volume to 10.** That is 44,160 kWh over
   the six months, and more power than the 7.4 kW connection can draw.
5. **Set the hedge price to 5.** It is flagged as more than five times below
   the market. Set it to 60 and it is reported as 63% below the market,
   without a warning.

Gap warnings are covered by the tests but cannot be triggered from the screen,
because the existing contract already covers all of 2026.

---

## Mock data

Everything lives in [`src/data/mockData.ts`](src/data/mockData.ts) and is
generated deterministically, so the app looks the same on every load.

| Data | Details |
| --- | --- |
| Connection | Grid connection "Flavius", Fluvius Zenne-Dijle, physical limit 7.4 kW |
| Meter readings | 15-minute readings from 1 September to 6 October 2026, 369.73 kWh in total, with a household-style daily profile |
| Day-ahead prices | Hourly prices for the same period, averaging about €161/MWh, with a midday dip, an evening peak, occasional spikes and occasional negative hours |
| Existing contract | *Engie supply 2026*, 1 January to 31 December 2026: a spot line at `1 × spot + 9.00` and a hedge of 100 kWh at €60/MWh |

---

## Project structure

```
src/
  domain/              logic only, no React
    types.ts           the data model: lines, contracts, assets, readings
    coverage.ts        overlap and gap detection
    volume.ts          consumption summary, hedge coverage, kW/kWh conversion
    market.ts          market summary and hedge price comparison
    *.test.ts          tests for the above
  data/
    mockData.ts        the connection, readings, prices and existing contract
  components/
    LineForm.tsx       the new line form
    ContextPanel.tsx   consumption, hedge coverage and market reference
    CoverageTimeline.tsx  all lines on one 2026 axis
    ConflictNotice.tsx    overlap and gap notices
  styles/
    tokens.css         colours, spacing and type scale
    app.css            all component styles
  App.tsx              wires the data, the logic and the components together
```

All decisions are made in `domain/`, which is tested without rendering
anything. The components only display the results.

Built with React 18, TypeScript, Vite and Vitest. Styling is plain CSS.

---

## Scope

The app covers three line types (spot, hedge and markup) for one connection's
consumption in 2026. It does not include editing or deleting existing lines,
time-of-day windows, the other line types, saving, or layouts below tablet
width.
