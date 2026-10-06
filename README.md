# Contract coverage check

A prototype for the Companion.energy product engineer case.

It is a contract line editor that shows three things the real wizard doesn't:
what the connection actually consumes, what the market currently costs, and
what already prices that connection. None of it is new data — all three live
one click away from the real form.

---

## The problem

I registered a real grid connection on the platform (my own flat in Leuven,
Fluvius as DSO, connected to my actual digital meter) and built a contract the
way a customer would.

I hedged **100 kWh at €60/MWh** on a connection that consumes roughly
**3,800 kWh a year**. That is **2.6%** of annual consumption, about nine days,
on a contract running twelve months. Nothing told me.

Then I did what a customer does when they switch supplier: created a second
contract starting 1 July and forgot to end the first. Six months of 2026 are
now priced twice by two lines both named "Day-ahead energy". Both contracts
show a green *Active* badge. Nothing told me that either.

The platform could have caught both without acquiring anything new:

| What I needed to know | Where the platform already holds it |
| --- | --- |
| What this connection can physically draw | Asset configuration — 7.4 kW |
| What it actually consumes | Fluvius integration — 15-minute readings |
| What electricity currently costs | Market Data — day-ahead prices |
| What already prices this asset | Contracts → By Asset |

The asset configuration screen even states the principle: power limits are
collected for *"validating that your energy flows stay within the physical
boundaries of your installation."* The product knows it should validate against
reality. It just doesn't, on the screen where contracts are made.

Contracts are the input to every number Companion sells — cost dashboards,
budgets, forecasts, savings, and the optimisation engine itself. A wrong
contract doesn't throw an error. It produces a plausible number that propagates
silently.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 59 tests
npm run build
```

It opens pre-filled with the mistake: a second day-ahead line from July, on a
connection already priced for the whole year.

Things to try:

- Change the **hedge volume** to 2 MWh and watch the coverage verdict move from
  *negligible* to *partial*
- Set the **hedge price** to 5 — the value the real form accepted from me
  without comment
- Drag the **start date** to 1 January and watch the overlap grow to the full
  year
- Set it to **1 August** and see a gap in July appear instead

---

## How it's built

```
src/
  domain/          pure logic, no React, 59 tests
    types.ts       the model, narrowed to three line types
    coverage.ts    overlap and gap detection
    volume.ts      consumption summary, hedge coverage, unit conversion
    market.ts      price comparison, effective spot price
  data/
    mockData.ts    figures from my own connection
  components/      rendering only; no decisions
  styles/          design tokens + one stylesheet
```

The domain layer is where the thinking is, and it is tested without rendering
anything. The components render; they don't decide.

**The interesting logic is `coverage.ts`.** Two lines conflict when they move
energy the same way, both set a base price, and their periods intersect. The
edge cases are where the judgement sits:

- A contract ending 30 June and the next starting 1 July is **not** an overlap.
  That's what a correct supplier switch looks like, and flagging it would make
  the warning useless.
- A **markup** never conflicts. It's additive — it's meant to sit on top of a
  base price.
- A **hedge against a spot line** is flagged, but with different wording,
  because it's legitimate. The hedge covers part of the volume and spot covers
  the rest; the problem is that nothing shows how the volume divides.
- Three lines sharing a period surface as **one** warning, not three pairwise
  ones. Repeating near-identical warnings is how an alert layer gets ignored.

---

## Decisions

**Warnings, not blocks.** Nothing is prevented from saving. Some overlaps are
correct, and a genuine supplier handover can overlap by a few days. Refusing to
save a real deal is a worse failure than permitting a mistaken one, so the user
keeps the decision and simply stops making it blind.

**Context panel, not form validation.** Form validation frames this as input
hygiene. The actual problem is a missing feedback loop, and it matters as much
when auditing contracts that already exist as when creating one.

**Three line types, not seventeen.** Enough to demonstrate the pattern — two
that set a price and one that adds to it. A catalogue would be breadth where
the case asked for depth.

**Tests on the domain layer only.** Overlap detection has real edge cases:
containment, adjacency, same-day boundaries, kWh versus MWh. That's where bugs
live. Testing React rendering in a four-hour prototype costs time and proves
little.

**Hand-written CSS with a token file** rather than a utility framework, because
the information hierarchy is the point of the screen and I wanted those
decisions to be explicit.

---

## What's mocked

- **Consumption** — reconstructed to match the shape and total of the real
  Fluvius feed on my connection: 634.8 kWh across 61 days, baseline ~0.1 kW
  overnight, morning bump, evening peak near 1 kW. Deterministic, so the
  prototype looks the same every load.
- **Day-ahead prices** — 30 days of hourly prices with a plausible Belgian
  shape: midday solar dip, evening scarcity peak, occasional negative hours.
  Averages €73/MWh.
- **The existing contract** — Engie supply 2026, exactly as I created it.

No backend, no auth, no persistence. The case said mock data is expected.

---

## Deliberately not built

Responsive layout below tablet. Editing or deleting existing lines. The other
fourteen line types. Time-of-day windows on lines. Tiered tariffs. Persistence.
Deployment.

---

## If I had longer

**Volume allocation across lines.** The hardest and most valuable version of
this problem: showing *which* volume a hedge displaces and what remains on
spot, as a stacked view over the year. I understood the problem but it needs
real modelling rather than an afternoon.

**Unit reconciliation.** The hedge form asks for a volume in "kW or kWh" and a
price in €/MWh — three units, two of them a factor of 1,000 apart, on adjacent
fields. Normalising that at the model level would remove a whole class of
error.

**The Dutch grid tariffs.** A connection's cost structure includes eleven
Fluvius lines in Dutch, inside an English interface, in four different units
with no total. That's a separate problem worth its own case.

---

## On AI assistance

I used Claude while building this, as the case invites. The domain logic,
the edge-case decisions and the product judgement are mine, and the comments in
`coverage.ts` record the reasoning rather than describing the code. I can walk
through any line of it.
