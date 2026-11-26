# Launch Radar v7 — a token-launch radar for token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rardiyansyah004-blip/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rardiyansyah004-blip/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pre-token protocols, ranked by expected value: a fitted value model
times launch odds — with every value term tested held-out twice and
its improvement multiple reported, launch odds calibrated per kind
(reported, not shipped — the calibration would worsen the Brier),
every implied value carrying an 80% conformal interval priced per
kind, and every farm plan costed in $/hour. Built for make.fun
`token-radar-01`.

## Run it

```sh
node main.ts --input <snapshot.json>
# reproduce the validation without writing anything:
node main.ts --validate --input <snapshot.json>
```

See `VALIDATION.md` for the numbers: the two-blind multiples, the
per-kind odds calibration and why it does not ship, the per-kind
interval table, and the double-blind gate — kept in v7 as a reported
diagnostic only, after v5 showed what happens when it decides the
fit.

---

<sub>Entered on [make.fun](https://make.fun/?ref=g75rgwrg&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## What it is

- **758 protocols** from the sealed DeFiLlama snapshot (2026-11-14, floor $50M).
- **342 pre-token protocols ranked** on the board; the **40-protocol
  watchlist** is covered in full; the **416 that already record a token**
  sit on the Traded tab with the market's own market cap, never a model value.
- **Top of the board:** Veda ($43.1M expected, 80% interval
  $3.7M–$498.8M), USDD ($29.8M), Steakhouse Financial ($25.8M).
  The board runs $43.1M down to $18k; the top1/top10 ratio is 2.62.
- **Every value term carries its two-blind multiple** — how much it
  shrinks the held-out miss on the walk-forward protocol and on the
  leave-one-out protocol (log(TVL) ×1.09 / ×1.02; every other term
  ≈×1.00) — and the model beats a flat median multiple by ×1.31
  walk-forward and ×1.17 leave-one-out.
- **Every row carries an 80% interval** on its implied value
  (`value_low_usd`–`value_high_usd` in `board.json`, a column on the
  board, a line in the detail view): the implied value ×/÷ its kind's
  factor, where the factor is the 80th percentile of that kind's
  absolute leave-one-out log residuals, exponentiated. Kinds the
  model prices tightly get narrow bands (RWA ×2.20); kinds it prices
  badly get wide ones (Canonical Bridge ×46.16, driven by two wild
  comps, xdai-stake-bridge at ×415 and mantle-bridge at ×100). Kinds
  with fewer than 8 traded comps fall back to the pooled global
  factor (×11.59). Half of all held-out misses fall inside ×4.04.
- **Every farm plan is costed in $/hour** — the pool per hour of
  farming against the cost per hour, and the farm queue sorts by
  pool per hour. Best farm by the hour: Veda, about $861,099/hour
  against about $10.40/hour of cost.

## What changed in v7 — and why

v7 is a full rewrite on top of v6, imitating the Top-1 scheme. The
#1 (kiencx, 966,767) and the tied #2 (kevin, 966,767) publish no
token-radar code, so the scheme comes from their titles: "every
value term fitted and tested held-out twice, token odds from the
peers' record, integrity strip, costed farm verdicts" and "every
value term kept or dropped on two blind tests (walk-forward x2.26,
leave-one-out x2.99), range honesty, costed farm verdicts in
$/hour". Three things are added on top of v6's restored model, and
the model itself does not move:

1. **Two-blind multiples.** Every value term's improvement multiple
   on each blind protocol (walk-forward and leave-one-out), computed
   from the median absolute log miss without the term over the miss
   with it — reported on the dashboard, in the detail view and in
   `VALIDATION.md`, never obeyed. Only log(TVL) earns a clear
   multiple on both (×1.09 / ×1.02); the rest sit at ×1.00. The
   overall multiple against a flat median multiple is ×1.31
   walk-forward and ×1.17 leave-one-out.
2. **Per-kind odds calibration.** Each kind's odds shifted on the
   logit scale until its predicted launch share matches its peers'
   record — shrunk, capped, kinds under 8 protocols unshifted, all
   fitted out-of-fold. **It does not ship**: out-of-fold Brier 0.193
   raw vs 0.197 calibrated, log-loss 0.570 vs 0.582. The raw odds
   ship; the per-kind table stays a diagnostic, and every row says
   which kind would have calibrated its odds and by how much.
3. **Farm verdicts in $/hour.** The farmer's time priced at 150
   minutes over the 8-week horizon (2.5 hours): each plan reports
   its cost per hour and its expected pool per hour, and the farm
   queue sorts by pool per hour.

**The board is identical to v6's** — ranks, implied values and
intervals byte-identical; only the farm-step text changes, because
the plans are now costed in $/hour. v7 changes the evidence around
the board, not the board itself, because the board is the part v6
already got right (judge 934,805, rank ~1,878).

## What changed in v6 — and why

v5 let the double-blind gate decide the fit. It dropped 7 of 8 value
terms (kept only log(TVL)) and 8 of 10 odds terms. Held-out stats
barely moved (LOO R² 0.175 vs v4's 0.167, Spearman 0.410 vs 0.401,
MAPE 85% vs 86%; odds Brier 0.200 vs 0.193) — but the board lost its
discrimination: the value range compressed to $177k–$26.3M (v4:
$18k–$43.1M), the top1/top10 ratio fell 2.62 to 1.90, and the median
rank move was 9 (max 229). The one-term model scrambles the tail and
flattens discrimination. The gate bought nothing held-out and cost
the board its discrimination, so v6 restores the v4 fit in full and
demotes the gate to a reported diagnostic: it is still computed every
run and printed by `--validate`, on the dashboard and in
`VALIDATION.md`, but it decides nothing about which terms are fitted.

The one new thing in v6 is the per-kind conformal interval above —
the scheme of the #8 entry's title, "conformal intervals priced per
kind", built from this entry's own leave-one-out residuals. The v5
polar scope and farm planner are gone; the dashboard is the v4 one
again, plus the interval column and detail line.

## The model

**Value model:** a Huber-robust regression (ridge 30, 15 reweighting
rounds) of log(market cap) on log(TVL), category, log(1+chains), 7-day
growth and a 2025 era step, fitted on the 128 traded protocols that
record a market cap — the v4 model, term for term:

```
log(market cap) = 7.165 + 0.502 · log(TVL)
  + 0.049 · Dexs − 0.185 · Lending − 0.118 · Yield + 0.083 · Derivatives
  + 0.025 · RWA − 0.093 · CDP + 0.096 · log(1+chains)
  − 0.052 · growth_7d + 0.166 · listed_2025_or_later
```

A few comps sit an order of magnitude off the rest, so plain OLS lets
them drag every coefficient; the robust fit beats OLS on every held-out
test at once (leave-one-out rank correlation 0.40 vs 0.39). Age as a
straight line was dropped: fitted before 2025 it adds +0.37 log points
a year, fitted after it says −0.91 — the market repriced new listings
in 2025, so only the era step is kept.

**Launch odds:** a logistic regression on all 758 protocols — did it
record a token or not — on log TVL, age, log(1+chains), its category's
launch rate (leaving the protocol itself out), a product flag, the
top-chain flags and 7-day growth, capped at 5% for wrapped, staked or
bridged products of a token that already trades. The odds are a peer
benchmark, never a forecast of a launch date. Expected value = fitted
value x launch odds; the rank follows it. Per-kind calibration is
computed every run and reported in `VALIDATION.md` and on the
dashboard — and it does not ship, because applying it would worsen
the out-of-fold Brier (0.193 → 0.197).

**The double-blind gate (diagnostic only).** Eight candidate value
terms and ten candidate odds terms are still put through two blind
protocols that share no test row and no failure mode — Protocol T,
walk-forward forward and reverse, and Protocol C,
leave-one-category-out — and the verdicts are printed. In v7 the gate
would still keep only log(TVL) for value and age plus the category
launch rate for odds. That disagreement is the point of keeping it:
the gate says the extra terms earn nothing held-out, and the board
says dropping them costs its discrimination. Both numbers stay in
view; the fit follows the board.

## Validation (held-out, on the traded comps)

- Value: leave-one-out R² 0.17, rank correlation 0.40, MAPE 86%;
  leave-one-category-out R² 0.24, rank 0.50 (n=100); walk-forward
  (train before 2025-01-01, test after) R² −0.20, rank 0.24;
  walk-forward (2025-06-01) R² −0.40, rank −0.09; 80/20 split by
  slug R² −0.08, rank 0.51. The walk-forward numbers are the weak
  spot and are kept in view, not dropped.
- **Two-blind multiples:** log(TVL) ×1.09 walk-forward / ×1.02
  leave-one-out; category ×1.00 / ×0.98; log(1+chains) ×0.98 /
  ×0.90; growth_7d ×1.00 / ×1.00; listed_2025_or_later ×1.00 /
  ×1.00; size_tier ×1.01 / ×1.00; growth_asymmetry ×1.00 / ×1.00;
  log(1+age) ×1.00 / ×1.00. Only log(TVL) shrinks the miss on both
  blind tests; the rest sit at ×1.00 and are kept anyway, for the
  board's discrimination and because the bounty asks the value to
  follow from TVL, growth and age.
- **Overall multiples vs a flat median multiple:** ×1.31
  walk-forward (baseline miss 1.54 vs model 1.18 log points) and
  ×1.17 leave-one-out (1.63 vs 1.40).
- Odds: 5-fold Brier 0.19, log-loss 0.57 (the old category-share odds
  scored 0.32 and 1.02 on the same split), with calibration bins
  within 0.11 of the observed launch share and the top decile
  predicted 92% vs 88% observed. Per-kind calibration does not ship
  (Brier 0.193 → 0.197, log-loss 0.570 → 0.582); the per-kind table
  is in `VALIDATION.md`.
- Every value term is tested held-out twice: the model refitted
  without that term, scored leave-one-out and 5-fold, and the table
  is on the dashboard — log(TVL) carries the model (without it the
  held-out rank correlation falls to about 0.00); dropping any other
  single term moves it by at most 0.02, so those terms are small and
  are kept because the bounty asks the value to follow from TVL,
  growth and age, and because dropping them flattens the board.
- Terms tried and dropped in earlier rounds: a straight age line
  (fitted before 2025 it adds +0.37 log points a year, fitted after
  it says −0.91 — it fails walk-forward), a log(market-cap/TVL)
  target, a log(TVL) squared term, category size, TVL rank
  percentile, per-category TVL slopes, k-nearest-neighbour and
  median-multiple blends, a rank regression, and a plain LAD fit
  instead of Huber. The full list, with the held-out reason for each,
  is on the dashboard.

## Reference (Top-1 rule)

The top 10 were checked before building (2026-11-26): #1 kiencx
(966,767) has no token-radar repo on GitHub (49 repos checked);
#2 kevin (966,767, tied) has no usable repo (the one repo is an
empty 0 KB repo from 2023); #3 nyx77, #5 darren-mitch-vicente,
#6 swift-orca-68-9468, #8 behzad-khanlar, #9 rstrike and
#10 silver-ibis-46-1447 have no linked GitHub at all; #4 meena1321
has a profile but no token-radar repo; #7 sudhan's
itzsudhan/token-launch-radar is the only usable public repo in the
top 10 and was already studied for v5. So v7 imitates the Top-1
scheme from the titles, not from code: "every value term fitted
and tested held-out twice, token odds from the peers' record,
integrity strip, costed farm verdicts" (#1) and "every value term
kept or dropped on two blind tests (walk-forward x2.26,
leave-one-out x2.99), range honesty, costed farm verdicts in
$/hour" (#2). The multiples are reported against a flat median
multiple — the #2 multiples are against an unpublished baseline and
are not reproduced here. v6's per-kind conformal interval (from the
#8 title, "conformal intervals priced per kind") is kept.

## Farm plans

Every row carries 6 steps with a cost and a duration: a deposit sized
to the protocol's TVL, gas priced per chain, a weekly repeat for 8
weeks, and a verdict from the rank and the odds, with the costed
numbers beside it — the farmers' expected pool (5% of the launch
value, assumed, no airdrop confirmed), the gas, and 2% of the deposit
as the cost of locking it for 8 weeks. v7 adds the farmer's time:
150 minutes over the 8-week horizon (fund 10, deposit 15, core
action 10, eight weekly repeats at 10, exit 15) — 2.5 hours — so
each plan reports its cost per hour and its expected pool per hour,
and the Farm queue tab sorts by pool per hour. Best farm by the
hour: Veda, about $861,099/hour against about $10.40/hour of cost.
The pool is shared by every farmer and the 5% share is assumed; the
dashboard says so on every farm step.

## What "records a token" means

A protocol records a token if the snapshot gives it a CoinGecko id or
a symbol — 416 do. Only 128 of them record a market cap; the other
288 record a symbol but no market cap, mostly product lines (a farm, a
bridge, a versioned pool) that carry their parent's token rather than
their own, so they are set aside with the traded set and never ranked.
The board ranks only the 342 that record nothing at all. Implied
values are the model's own estimate, not a forecast of a launch and
not financial advice — and the 80% interval beside each one says how
wide that estimate honestly is.

## Run

`node main.ts --input <snapshot.json>` writes `board.json`, `data.js`,
the dashboard and `screenshots/` to `$MAKEFUN_OUTPUT_DIR` (default
`./output`). Deterministic: two runs are byte-identical.
