# Launch Radar v5 — a token-launch radar for token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rardiyansyah004-blip/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rardiyansyah004-blip/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pre-token protocols, ranked by expected value: a fitted value model
times launch odds — where every term in both models earned its place
under TWO independent blind tests, and the rest were dropped.
Built for make.fun `token-radar-01`.

## Run it

```sh
node main.ts --input <snapshot.json>
# reproduce the validation without writing anything:
node main.ts --validate --input <snapshot.json>
```

See `VALIDATION.md` for the protocol itself: the two blind tests,
the forward-selection gate, the thresholds, and the numbers.

---

<sub>Entered on [make.fun](https://make.fun/?ref=g75rgwrg&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## What it is

- **758 protocols** from the sealed DeFiLlama snapshot (2026-11-14, floor $50M).
- **342 pre-token protocols ranked** on the board; the **40-protocol
  watchlist** is covered in full; the **416 that already record a token**
  sit on the Traded tab with the market's own market cap, never a model value.
- **The scope:** every ranked protocol is one blip on a polar radar —
  angle is its sector, distance from the centre is how long it has run
  with no token, area is TVL, the tail is its 7-day TVL growth, colour
  is the farm verdict. Filters dim the rest; a row and its blip light
  together. The farm planner takes a capital and an hours-a-week budget
  and picks, schedules and totals the farms that fit.
- **Top of the board:** Polymarket International ($26.3M expected,
  89% odds), USDD ($25.6M), Veda ($21.5M).

## The model — and the gate that built it

**Value model:** a Huber-robust regression (ridge 30, 15 reweighting
rounds) of log(market cap) on the terms the gate kept — which is
`log(TVL)` alone:

```
log(market cap) = 7.106 + 0.516 · log(TVL)
```

Fitted on the 128 traded protocols that record a market cap. A few
comps sit an order of magnitude off the rest, so plain OLS lets them
drag every coefficient; the robust fit beats OLS on every held-out
test at once (leave-one-out rank correlation 0.41 vs 0.40).

**The double-blind gate (this entry's architecture).** Eight candidate
value terms and ten candidate odds terms were put through two blind
protocols that share no test row and no failure mode — Protocol T,
walk-forward forward and reverse (fit before a cut, test after it, and
the reverse), and Protocol C, leave-one-category-out. The gate runs
FORWARD: start with no term, add the term whose addition improves
both protocols the most, stop when no remaining term clears 0.005 on
both. Forward, not backward: in the full model a term can be masked by
a near-duplicate — the odds model carries three age encodings that hide
each other, so backward elimination dropped all three while any one of
them earns its place on both protocols once the others are out.

The ladders:

| | value (rank corr.) | odds (AUC) |
| --- | --- | --- |
| round 1 | log(TVL) +0.371 / +0.919 | age +0.323 / +0.392 |
| round 2 | — (nothing else clears both) | category launch rate +0.045 / +0.085 |
| round 3 | — | — (nothing else clears both) |

**Dropped value terms** (what adding them to the final model would
bring on the two protocols): category −0.012/−0.001,
log(1+chains) −0.031/−0.015, growth −0.000/−0.000, 2025 era step
+0.003/+0.003, size tier −0.012/−0.001, growth asymmetry
+0.001/−0.000, log(1+age) −0.019/−0.008. **Dropped odds terms:**
log(TVL) −0.037/−0.005, log(1+chains) −0.028/+0.002, product flag
−0.004/+0.001, top-chain flags −0.038/+0.005, growth +0.000/−0.000,
log(1+age) −0.007/+0.000, 2025 era step +0.000/+0.002, size tier
−0.027/−0.006.

The size curve carries the value: dropping the other seven value
terms moves the held-out numbers nowhere (leave-one-out rank
correlation 0.41 with the curve alone, 0.41 with all eight terms).
An independent top-10 entry's published backtest ladder reaches the
same conclusion — past the size curve, the sector term does not improve
the held-out miss. Two independent checks, same answer.

**Launch odds:** a logistic regression on all 758 protocols — did it
record a token or not — on the terms the gate kept (age and its
category's launch rate, leaving the protocol itself out), capped at 5%
for wrapped, staked or bridged products of a token that already
trades. The odds are a peer benchmark, never a forecast of a launch
date. Expected value = fitted value x launch odds; the rank follows
it. Every fitted value carries a blind range of ×3.53: half the
leave-one-out misses fall inside it.

## Validation (held-out, on the traded comps)

- Value: leave-one-out R² 0.18, rank correlation 0.41, MAPE 85%;
  leave-one-category-out R² 0.25, rank 0.51 (n=100); walk-forward
  (train before 2025-01-01, test after) R² −0.18, rank 0.24;
  walk-forward (2025-06-01) R² −0.37, rank −0.04; 80/20 split by
  slug R² −0.05, rank 0.47. The walk-forward numbers are the weak
  spot and are kept in view, not dropped.
- Odds: 5-fold Brier 0.20, log-loss 0.59 (the old category-share odds
  scored 0.32 and 1.02 on the same split), with calibration bins within
  0.09 of the observed launch share and the top decile predicted 90%
  vs 85% observed.
- Terms tried and dropped in earlier rounds: a straight age line
  (fitted before 2025 it adds +0.37 log points a year, fitted after it
  says −0.91 — it fails walk-forward), a log(market-cap/TVL) target, a
  log(TVL) squared term, category size, TVL rank percentile, per-category
  TVL slopes, k-nearest-neighbour and median-multiple blends, a rank
  regression, and a plain LAD fit instead of Huber. The full list, with
  the held-out reason for each, is on the dashboard.

## Reference (Top-1 rule)

The #1 entry (kiencx, 966,767) and the tied #2 (kevin, 966,767) both
make the same point in their titles: every value term fitted and
tested held-out twice / kept or dropped on two blind tests. Neither
has a linked GitHub, and neither do #3–#5; the first usable repo in
the top 10 is #7 sudhan's `token-launch-radar` (github.com/ItzSudhan),
studied read-only: its scheme — a polar scope, a backtest ladder
printed under it, a farm planner with a capital and hours budget, and
a blind range on every value — is imitated here in this entry's own
code (nothing copied). The held-out-twice signal from the #1/#2 titles
is the double-blind gate above.

## Farm plans

Every row carries 6 steps with a cost and a duration: a deposit sized
to the protocol's TVL, gas priced per chain, a weekly repeat for 8
weeks, and a verdict from the rank and the odds, with the costed
numbers beside it — the farmers' expected pool (5% of the launch
value, assumed, no airdrop confirmed), the gas, and 2% of the deposit
as the cost of locking it for 8 weeks. The Farm queue tab sorts the
same rows by pool vs farm cost; the planner fits them to a capital
and hours-a-week budget.

## What "records a token" means

A protocol records a token if the snapshot gives it a CoinGecko id or
a symbol — 416 do. Only 128 of them record a market cap; the other
288 record a symbol but no market cap, mostly product lines (a farm, a
bridge, a versioned pool) that carry their parent's token rather than
their own, so they are set aside with the traded set and never ranked.
The board ranks only the 342 that record nothing at all. Implied
values are the model's own estimate, not a forecast of a launch and
not financial advice.

## Run

`node main.ts --input <snapshot.json>` writes `board.json`, `data.js`,
the dashboard and `screenshots/` to `$MAKEFUN_OUTPUT_DIR` (default
`./output`). Deterministic: two runs are byte-identical.
