# Contract check

A prototype for the Companion.energy contract management case.

It checks a new contract line against what Companion already knows about the
connection: how much it uses, how much power it can physically draw, what
electricity has cost on the market recently, and which contracts already price
it. Anything that looks wrong is listed at the top of the page, in plain
words, with an estimate of what it costs and a fix where there is one.

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
npm test         # run the test suite (106 tests)
npm run build    # type-check and build for production
```

There is no backend, login or database. All data is mocked and built into the
app.

---

## What's on the screen

**Connection switch** (top right). Two connections to try the checks on:

- **Household:** a flat with real meter totals and contracts
- **Industrial site:** an invented plant at typical industrial scale, where the
  same mistakes are worth thousands of euros

Both open with a new market-price line from 1 July to 31 December 2026, on a
connection whose existing contract already prices the whole year. Switching
starts the other connection from its own contracts.

**Things to look at** (top). The answer to "is this line right?". Each problem
is a numbered card: what is wrong, which contracts and dates, and what it is
worth. Where there is a fix, the card has a button for it. Situations that look
odd but are normal are explained in one quiet line underneath. With nothing
wrong, it says so.

**Contracts on this connection** (left). Every line pricing the connection
across 2026 on one timeline, with the new line in orange.

**How your electricity is priced each month** (left, below). One column per
month: the share fixed by hedges, the share at the market price, and any hedged
volume beyond what the connection uses. Hover or focus a month for its
figures, or open the table view.

**New line** (right). The line being added, in plain words: market price, a
fixed-price hedge or a supplier margin; its price; its dates. Companion's own
notation for the same line (for example `1 × spot + 12.00`) is shown
underneath. The checks re-run as you type. **Reset** restores the connection's
original contracts and line.

**What Companion already knows** (right, below). The connection's yearly use,
its physical power limit and the recent market price.

---

## What it checks

Nothing is ever blocked.

| Situation | What the app shows |
| --- | --- |
| Two market-price lines for the same electricity on overlapping dates | A problem naming both contracts, their prices and the dates, with an estimate of what each would cost over those days |
| ...and one of them started first | A button to end that one's contract the day before the other starts |
| A fixed-price hedge and a market-price line on the same dates | One "Normal" line: the hedge fixes part of the price, the market price covers the rest |
| One line ending 30 June and the next starting 1 July | Nothing. A clean handover is not an overlap |
| A supplier margin on the same dates as anything else | Nothing. A margin adds to a price rather than competing with it |
| Three or more lines overlapping on the same dates | One combined problem, not one per pair |
| Days in 2026 with no market-price or hedge line | A problem: those days are missing from cost totals |
| A hedge under 5% of the use expected while it applies | "This hedge covers only …", to check for a units mistake |
| A hedge over 100% of that use | "This hedge is more than this connection uses", and red in the monthly chart |
| A hedge in kW above the connection's physical limit | "… is more power than this connection can draw" |
| A hedge price more than 5× above or below the market average | "… is more than five times off the market price" |
| A hedge price within that range | Shown under the editor as a percentage above or below the market, without a warning |

Problems are listed first, things to check next, and normal situations last.

How the figures are worked out:

- A hedge in **kW** is that much power in every hour of the line's dates. A
  hedge in **kWh** is a total amount, spread evenly over those dates.
- Expected use is the metered daily rate times the number of days. It ignores
  seasons.
- Cost estimates apply each line's formula to the market price weighted by
  when the connection actually used electricity, over the metered period.
- Ending a contract early keeps only the share of a kWh hedge that falls
  before the new end date.

---

## Things to try

On **Household**:

1. **Set From to 1 January.** The problem grows to the full year.
2. **Set it back to 1 July and click "End Engie supply 2026 on 30 Jun 2026".**
   The old contract stops the day before, the list says there is nothing to
   look at, and **Reset** brings it back.
3. **Choose "Fixed-price hedge" and set From to 1 January.** The 100 kWh amount
   covers 2.7% of the year's use and is listed as something to check.
4. **Set From back to 1 July and the amount to 2,000 kWh.** That is about half
   a year's use, but more than the connection uses between July and December.
   It is listed as a problem, and the monthly chart turns those months red.
5. **Switch the unit to kW and set the amount to 10.** That is more power than
   the 7.4 kW connection can draw.
6. **Set the fixed price to 5.** It is listed as more than five times off the
   market price. Set it to 60 and the editor reports it as 63% below the
   market, without a warning.

On **Industrial site**:

7. **Read the problem.** The two contracts are about €2,160 apart over six
   months.
8. **Choose "Fixed-price hedge".** The 400 kWh amount covers less than 0.1% of
   the site's use: what typing 400 in kWh looks like when the supplier
   contract says 400 MWh.

Gaps are covered by the tests but cannot be produced from the screen, because
the existing contracts already cover all of 2026.

---

## Mock data

Everything lives in [`src/data/`](src/data/) and is generated
deterministically, so the app looks the same on every load. Both connections
share the same day-ahead prices.

| Data | Household | Industrial site |
| --- | --- | --- |
| Source | Real meter total and contracts | Invented, for illustration |
| Connection | "Flavius", Fluvius Zenne-Dijle, 7.4 kW | "Ghent plant", Fluvius medium voltage, 500 kW |
| Meter readings | 15-minute readings, 1 September to 6 October 2026, 369.73 kWh in total, household-style daily profile | Same period, about 1.7 GWh a year, two weekday shifts and a low base load |
| Existing contract | *Engie supply 2026*: `1 × spot + 9.00` and a hedge of 100 kWh at €60/MWh | *Annual supply 2026*: `1 × spot + 4.00` and a hedge of 800,000 kWh at €95/MWh |
| New line | `1 × spot + 12.00` from 1 July | `1 × spot + 6.50` from 1 July |

Day-ahead prices are hourly for the same period, averaging about €161/MWh,
with a midday dip, an evening peak, occasional spikes and occasional negative
hours.

---

## Project structure

```
src/
  domain/                 logic only, no React
    types.ts              the data model: lines, contracts, assets, readings
    coverage.ts           overlap and gap detection
    volume.ts             consumption summary, hedge coverage, kW/kWh conversion
    market.ts             market summary and hedge price comparison
    cost.ts               what competing lines would cost over an overlap
    contracts.ts          ending a contract and suggesting which one to end
    split.ts              month-by-month division between hedge and spot
    issues.ts             every check in one ranked list
    *.test.ts             tests for the above
  data/
    scenarios.ts          the two connections the app switches between
    mockData.ts           the household connection and the day-ahead prices
    factory.ts            the industrial site
    random.ts             the deterministic random source the data uses
  components/
    IssueList.tsx         the things to look at, with costs and fixes
    LineEditor.tsx        the new line, in plain words
    ConnectionFacts.tsx   what Companion already knows about the connection
    CoverageTimeline.tsx  all lines on one 2026 axis
    ConsumptionSplit.tsx  the month-by-month chart
    format.ts             number formatting shared by the components
  styles/
    tokens.css            colours, spacing and type scale
    app.css               component styles
    split-chart.css       chart styles
  App.tsx                 the page and the connection switch
  Workspace.tsx           one connection's state, wiring the logic to the components
```

All decisions are made in `domain/`, which is tested without rendering
anything. The components only display the results.

Built with React 18, TypeScript, Vite and Vitest. Styling is plain CSS.

---

## Scope

The app covers three line types (spot, hedge and markup) for consumption in
2026. It does not include editing existing lines one by one, time-of-day
windows, the other line types, saving, or layouts below tablet width.
