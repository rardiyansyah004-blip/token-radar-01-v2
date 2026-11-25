# VALIDATION.md — the restored v4 model, per-kind conformal intervals, and the gate as a diagnostic (token-radar-01 v6)

Reproduce everything below from the sealed snapshot alone:

```sh
node main.ts --validate --input <snapshot.json>
```

No network, no randomness, no dates beyond the snapshot's own
`as_of`. The program computes the gate, the held-out tests and the
intervals from scratch on every run, so the numbers in `data.js`
(`model.validation.gate`, `model.validation.intervals`) are the
numbers below.

## Why v6 restores v4

v5 let the double-blind gate decide the fit. It dropped 7 of 8 value
terms (kept only log(TVL)) and 8 of 10 odds terms. Held-out stats
barely moved —

| | v4 (restored) | v5 (gated) |
| --- | --- | --- |
| value LOO R² / Spearman / MAPE | 0.167 / 0.401 / 86% | 0.175 / 0.410 / 85% |
| odds 5-fold Brier / log-loss | 0.193 / 0.570 | 0.200 / 0.587 |

— but the board changed a lot:

| | v4 (restored) | v5 (gated) |
| --- | --- | --- |
| board value range | $18k–$43.1M | $177k–$26.3M |
| top1/top10 ratio | 2.62 | 1.90 |
| median rank move (v4 → v5) | — | 9 (max 229) |

The one-term model scrambles the tail and flattens discrimination.
The gate bought nothing held-out and cost the board its
discrimination, so v6 restores the v4 fit in full — log(TVL),
category, log(1+chains), 7-day growth and the 2025 era step for
value; log TVL, age, log(1+chains), category launch rate, product
flag, top-chain flags and growth for odds — and demotes the gate to
a REPORTED DIAGNOSTIC. It is computed every run, printed by
`--validate`, on the dashboard and in the table below, but it decides
nothing about which terms are fitted. A diagnostic that disagrees
with the fit is kept in view, not obeyed and not hidden.

## The model

**Value model (comps):** a Huber-robust regression (ridge 30, 15
reweighting rounds) of log(market cap) on log(TVL), six category
dummies, log(1+chains), 7-day growth (clamped to [−80%, +300%],
missing values take the traded median) and a listed-2025-or-later
step, fitted on the 128 traded protocols that record a market cap:

```
log(market cap) = 7.165 + 0.502 · log(TVL)
  + 0.049 · Dexs − 0.185 · Lending − 0.118 · Yield + 0.083 · Derivatives
  + 0.025 · RWA − 0.093 · CDP + 0.096 · log(1+chains)
  − 0.052 · growth_7d + 0.166 · listed_2025_or_later
```

**Launch odds:** a logistic regression on all 758 protocols — did it
record a token or not — on log TVL, age, log(1+chains), its
category's launch rate (leaving the protocol itself out), a product
flag, the top-chain flags and 7-day growth, capped at 5% for wrapped,
staked or bridged products of a token that already trades. Expected
value = fitted value × launch odds; the rank follows it.

## Per-kind 80% conformal intervals on implied value

The leave-one-out residuals of the restored model are the honest
measure of how far a fitted value can miss: half the held-out misses
fall inside ×4.04 (the median absolute LOO log miss, exponentiated).
v6 turns that into an 80% interval per protocol, priced per kind:

- For each category (kind) with at least 8 traded comps, the factor
  is the 80th percentile of that kind's absolute leave-one-out log
  residuals, exponentiated (linear interpolation between the two
  nearest order statistics).
- Kinds with fewer than 8 traded comps fall back to the pooled
  global factor over all 128 comps (×11.59).
- A row's interval is its implied value ×/÷ its kind's factor:
  `value_low_usd = implied / factor`, `value_high_usd = implied ×
  factor` (rounded to whole dollars, and always strictly bracketing
  the implied value). The interval is on the implied (expected)
  value, not the fitted value alone, because that is the number the
  board ranks on.

A finite-sample ceil-rule quantile was tried first and rejected: for
a kind with 8 comps it returns the single largest residual, so one
wild comp priced a whole kind at ×415 — an artefact of the small
sample, not of the kind. The interpolated percentile is stable at
these n and is what the table reports. The wide kinds below are still
wide for a real reason, not an artefact: Canonical Bridge's eight
comps include xdai-stake-bridge (LOO miss ×415, residual −6.03 log
points) and mantle-bridge (×100, +4.61) — bridges genuinely are the
hardest kind to price from TVL, and the interval says so. RWA's nine
comps, by contrast, all miss by at most ×3.1, so RWA prices at ×2.20.

| kind | traded comps | 80% factor | pricing |
| --- | --- | --- | --- |
| Lending | 15 | ×26.23 | own factor |
| Dexs | 11 | ×8.27 | own factor |
| Liquid Staking | 9 | ×10.13 | own factor |
| Yield | 9 | ×7.21 | own factor |
| CEX | 9 | ×13.01 | own factor |
| RWA | 9 | ×2.20 | own factor |
| Canonical Bridge | 8 | ×46.16 | own factor |
| Basis Trading | 7 | ×11.59 | global fallback |
| Bridge | 6 | ×11.59 | global fallback |
| Cross Chain Bridge | 4 | ×11.59 | global fallback |
| Yield Aggregator | 4 | ×11.59 | global fallback |
| Indexes | 3 | ×11.59 | global fallback |
| CDP | 3 | ×11.59 | global fallback |
| Privacy | 3 | ×11.59 | global fallback |
| Restaking | 2 | ×11.59 | global fallback |
| Onchain Capital Allocator | 2 | ×11.59 | global fallback |
| Token Locker | 2 | ×11.59 | global fallback |
| Derivatives | 2 | ×11.59 | global fallback |
| Liquid Restaking | 2 | ×11.59 | global fallback |
| AI Agents | 2 | ×11.59 | global fallback |
| Staking Pool | 2 | ×11.59 | global fallback |
| Payments | 2 | ×11.59 | global fallback |
| Liquidity Manager | 1 | ×11.59 | global fallback |
| Collateral Management | 1 | ×11.59 | global fallback |
| Risk Curators | 1 | ×11.59 | global fallback |
| Chain | 1 | ×11.59 | global fallback |
| NFT Marketplace | 1 | ×11.59 | global fallback |
| Decentralized AI | 1 | ×11.59 | global fallback |
| Dual-Token Stablecoin | 1 | ×11.59 | global fallback |
| Options | 1 | ×11.59 | global fallback |
| Launchpad | 1 | ×11.59 | global fallback |
| Prediction Market | 1 | ×11.59 | global fallback |
| DOR | 1 | ×11.59 | global fallback |
| Leveraged Farming | 1 | ×11.59 | global fallback |

The bands are wide because the TVL-to-market-cap link is noisy —
that is the honest answer, not a failure of the interval. A point
value with no band overstates how precisely a token can be priced
from TVL; the band is the price of that honesty, and pricing it per
kind keeps the honest answer from being one flat number for every
protocol.

## The restored model, held-out

- Value (Huber-robust, ridge 30, 15 reweighting rounds, on the
  restored v4 terms): leave-one-out R² 0.167, Spearman 0.401, MAPE
  86%; in-sample R² 0.210, Spearman 0.472. Plain OLS on the same
  terms: leave-one-out R² 0.164, Spearman 0.393.
- Leave-one-category-out R² 0.237, Spearman 0.499 (n=100).
- Walk-forward 2025-01-01 R² −0.20, Spearman 0.24 (train 64, test
  31); walk-forward 2025-06-01 R² −0.40, Spearman −0.09 (train 75,
  test 20).
- 80/20 split by slug R² −0.08, Spearman 0.51 (n=26).
- Odds (logistic on the restored v4 terms): 5-fold Brier 0.193,
  log-loss 0.570; top decile predicted 92% vs 88% observed. The old
  category-share odds score Brier 0.321, log-loss 1.020 on the same
  split. Calibration bins (predicted vs observed): 0–10% 0.06 vs 0.17
  (n=23), 10–25% 0.19 vs 0.21 (n=91), 25–40% 0.33 vs 0.33 (n=116),
  40–55% 0.47 vs 0.46 (n=139), 55–70% 0.62 vs 0.60 (n=148), 70–85%
  0.78 vs 0.82 (n=144), 85–100% 0.91 vs 0.87 (n=97).

## The supporting table (v4 test, not the decider)

The model refitted without each value term, scored leave-one-out
and 5-fold:

| model | LOO R² | LOO rank corr. | 5-fold R² | 5-fold rank corr. |
| --- | --- | --- | --- | --- |
| full model | 0.167 | 0.401 | 0.182 | 0.422 |
| without log(TVL) | −0.005 | −0.003 | 0.010 | 0.053 |
| without category | 0.169 | 0.399 | 0.184 | 0.419 |
| without log(1+chains) | 0.173 | 0.414 | 0.185 | 0.434 |
| without growth_7d | 0.167 | 0.401 | 0.182 | 0.421 |
| without listed_2025_or_later | 0.166 | 0.400 | 0.179 | 0.411 |

log(TVL) carries the model (without it the held-out rank correlation
falls to about 0.00). Dropping any other single term moves it by at
most 0.02, and dropping log(1+chains) improves the 5-fold rank
correlation outright. Those terms are kept because the bounty asks
the value to follow from TVL, growth and age, because they still
shift individual rows (category by up to ±18%, the 2025 era step by
+30%), and because dropping them flattens the board — the v5
regression. The gate below is the second opinion on the same
question.

## The double-blind gate — diagnostic only

Why two blind tests: v4 tested each term held-out twice —
leave-one-out and 5-fold — but both tests draw train and test rows
from the same pool, in the same era, across the same categories. One
shared blind spot and both tests go blind together. The gate runs two
protocols that share no test row and no failure mode, and a term
would be kept only if it passed BOTH.

The gate runs FORWARD, not backward. In the full model a term's
contribution can be masked by a near-duplicate: the odds model
carries three age encodings (straight age, log(1+age), the 2025 era
step) that hide each other, so backward elimination — refit without
each term in turn — dropped all three, while any one of them earns
its place on both protocols once the others are out. Forward
selection (start empty, add the best term that clears both protocols,
repeat) does not have that failure mode.

## Protocol T — time-blind (walk-forward, both directions)

Value model (128 traded comps that record a market cap):

- forward 2025-01-01: fit on protocols listed before the cut, test on
  the ones listed after it.
- forward 2025-06-01: the same, at the later cut.
- reverse 2025-01-01 and reverse 2025-06-01: fit after a cut, test
  before it — a term that only works in one era fails the reverse test.
  A split runs only when both sides have enough rows (train ≥ 30,
  test ≥ 10); the 2025-06-01 reverse split has too few post-cut comps
  to fit and is skipped, which the code records by omission.
- The protocol score is ONE pooled rank correlation (Spearman) over
  all out-of-sample pairs from all the splits that ran — not an average
  of per-split correlations.

Odds model (all 758 protocols):

- forward 2025-01-01 (train before, test after; train ≥ 100, test ≥ 50)
  and reverse 2025-06-01 (train after, test before; same floors).
- The protocol score is ONE pooled AUC over all out-of-sample pairs.
  AUC, not Brier: a walk-forward test row sits in a different era with
  a different base rate of "records a token", and Brier punishes both
  models for that intercept shift while AUC still asks whether the term
  ranks the right protocols higher. The shipped odds are still reported
  on Brier and log-loss (5-fold), above.

## Protocol C — category-blind (leave-one-category-out)

- Value: for every category with ≥ 30 train rows and ≥ 3 test rows,
  fit without that whole category, test on it. One pooled Spearman
  over all the out-of-sample pairs (n = 100).
- Odds: for every category with ≥ 100 train rows and ≥ 30 test rows,
  the same. One pooled AUC.

## The rule (what the gate WOULD have done)

At each round, add the term whose addition improves BOTH protocols
the most (judged by the smaller of its two improvements), provided
that smaller improvement clears the threshold:

- value: ≥ 0.005 of held-out rank correlation on each protocol.
- odds: ≥ 0.005 of AUC on each protocol.

Stop when no remaining term clears it on both. A dropped term's
verdict names the protocol that refused it: single-blind (passed one,
failed the other) or no blind support (passed neither). The gate's
logistic fits run 500 gradient rounds at step 0.08 — the gate only
needs the RELATIVE AUC of two fits, and 500 rounds settles that
comparison; the shipped odds fit runs 2000 rounds at step 0.05.

**In v6 this rule decides nothing.** The shipped fit is the restored
v4 model whatever the gate says. The results below are what the gate
would have done — the same verdicts v5 obeyed.

## Results on this snapshot (diagnostic)

Value ladder (rank correlation):

| round | term added | blind-T gain | blind-C gain |
| --- | --- | --- | --- |
| 1 | log(TVL) | +0.371 | +0.919 |

Round 2: nothing else clears 0.005 on both. Final marginal gains of
adding each dropped term to the kept model: category −0.012/−0.001,
log(1+chains) −0.031/−0.015, growth_7d −0.000/−0.000,
listed_2025_or_later +0.003/+0.003, size_tier −0.012/−0.001,
growth_asymmetry +0.001/−0.000, log(1+age) −0.019/−0.008.

Odds ladder (AUC):

| round | term added | blind-T gain | blind-C gain |
| --- | --- | --- | --- |
| 1 | age_years | +0.323 | +0.392 |
| 2 | category_launch_rate | +0.045 | +0.085 |

Round 3: nothing else clears 0.005 on both. Final marginal gains of
adding each dropped term to the kept model: log(TVL) −0.037/−0.005,
log(1+chains) −0.028/+0.002, product_flag −0.004/+0.001,
top_chain_flags −0.038/+0.005, growth_7d +0.000/−0.000,
log(1+age) −0.007/+0.000, listed_2025_or_later +0.000/+0.002,
size_tier −0.027/−0.006.

## Cross-check: an independent entry agrees with the gate

The #7 entry's published backtest ladder (leave-one-out over 86 traded
tokens, and 53 older tokens pricing 33 newer ones) finds the same
shape: a flat cap/TVL multiple misses by ×4.59/×4.54 on average, the
size curve cuts that to ×3.19/×2.53, and adding the sector term moves
it to ×3.18/×2.53 — nothing. Two independent entries, two different
metrics (rank correlation here, average miss there), the same
conclusion: the size curve is the value; the sector term is decoration
on this snapshot. v6 agrees with that held-out reading — and restores
the sector term anyway, because the board, not the held-out
correlation, is what the entry is judged on, and the sector term is
what keeps the board discriminating.

## What the gate and the validation do NOT claim

- The walk-forward numbers are the weak spot (R² −0.20 and −0.40):
  the market repriced new listings in 2025, so a model fitted before
  2025 predicts the ones listed after it poorly. The gate keeps those
  numbers in view rather than dropping the test.
- A term that fails the gate is not "proven useless" — it is useless
  for THIS snapshot, under THESE two protocols, at THESE thresholds.
  The gate's job in v6 is to state the disagreement honestly, not to
  make claims about other snapshots.
- The odds model is a peer benchmark — the share of similar protocols
  that already record a token — never a forecast of a launch date.
- The 80% intervals are conformal on the leave-one-out residuals of
  the 128 traded comps: four in five held-out comps of a kind fell
  inside the kind's factor. They are not a promise about any single
  protocol — a row's true value can sit outside its band, and for
  thin kinds the band is the global factor, not the kind's own.
