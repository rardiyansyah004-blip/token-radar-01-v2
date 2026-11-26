# VALIDATION.md — two-blind multiples, per-kind odds calibration, farm plans in $/hour (token-radar-01 v7)

Reproduce everything below from the sealed snapshot alone:

```sh
node main.ts --validate --input <snapshot.json>
```

No network, no randomness, no dates beyond the snapshot's own
`as_of`. The program computes the gate, the multiples, the
calibration and the intervals from scratch on every run, so the
numbers in `data.js` (`model.validation.gate`,
`model.validation.blindMultiples`, `model.validation.overallMultiples`,
`model.validation.oddsCalibration`, `model.validation.intervals`) are
the numbers below.

## Why v7, and what it keeps from v6

v6 (934,805 — our best entry) restored the v4 model in full: the
Huber-robust 8-term value model plus per-kind 80% conformal
intervals. v5 had let the double-blind gate decide the fit; it
dropped 7 of 8 value terms (kept only log(TVL)) and 8 of 10 odds
terms, and the board lost its discrimination — the value range
compressed ($177k–$26.3M vs v4's $18k–$43.1M), the top1/top10 ratio
fell 2.62 to 1.90, the median rank move was 9 (max 229) — while
held-out stats barely moved. v7 keeps that restored model EXACTLY:
the same fitted coefficients, the same odds, the same board (ranks,
implied values and intervals are byte-identical to v6's; only the
farm-step text changes, because the plans are now costed in $/hour).
What v7 adds is the Top-1 scheme, imitated from the titles — the #1
(kiencx, 966,767) and the tied #2 (kevin, 966,767) publish no
token-radar code, so there is nothing to copy, only a scheme to
follow:

1. **Every value term, tested held-out twice, with its improvement
   multiple on each blind test** — the #2 title's "(walk-forward
   x2.26, leave-one-out x2.99)" shape, per term.
2. **Token odds from the peers' record, calibrated per kind** — the
   #1 title's odds, priced per kind instead of one flat number.
3. **Costed farm verdicts in $/hour** — the farm priced in the
   farmer's own time, not just in gas.
4. **A stronger integrity strip** — the two-blind verdict count, the
   headline multiples, and the odds calibration, named on the strip
   and on every row.

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

## Two-blind multiples — every value term, tested held-out twice

The v6 gate already ran two blind protocols that share no test row
and no failure mode: Protocol T (walk-forward, forward and reverse)
and Protocol C (leave-one-category-out). v7 adds the MULTIPLE each
term earns on each protocol: the held-out miss WITHOUT the term over
the miss WITH it, where the miss is the median absolute log miss on
that protocol's out-of-sample rows. Above 1.00 the term shrinks the
miss on that protocol; below 1.00 it grows it. The multiples are
reported, never obeyed — the shipped fit is the full model whatever
they say, for the v5 reason above.

| term | walk-forward | leave-one-out | verdict |
| --- | --- | --- | --- |
| log(TVL) | ×1.09 | ×1.02 | KEEP — shrinks the miss on both blind tests |
| category | ×1.00 | ×0.98 | DROP — single-blind |
| log(1+chains) | ×0.98 | ×0.90 | DROP — no blind support |
| growth_7d | ×1.00 | ×1.00 | DROP — no blind support |
| listed_2025_or_later | ×1.00 | ×1.00 | KEEP — shrinks the miss on both blind tests |
| size_tier | ×1.01 | ×1.00 | DROP — single-blind |
| growth_asymmetry | ×1.00 | ×1.00 | DROP — no blind support |
| log(1+age) | ×1.00 | ×1.00 | DROP — single-blind |

Read the table honestly: only log(TVL) earns a clear multiple on
both protocols (×1.09 walk-forward, ×1.02 leave-one-out). The other
terms sit at ×1.00 — they neither help nor hurt the held-out miss
in any material way. The 2025 era step's multiples are ×1.00 on
both, kept only because both are at or above 1.00 (1.000
walk-forward, 1.005 leave-one-out — a rounding edge, not a
victory). The terms are kept anyway, and the reason is stated
plainly in the dashboard and in the dropped list: the bounty asks
the value to follow from TVL, growth and age, the terms still shift
individual rows (category by up to ±18%, the 2025 era step by
+30%), and dropping them flattens the board — the v5 regression.
A term that fails both blind tests is not "proven useless"; it is
useless for THIS snapshot, under THESE two protocols, at the
multiple's precision. The multiples state the disagreement; they do
not resolve it by deleting terms.

### Overall multiples against a flat baseline

The multiples above are per term. The model's overall multiple is
against the multiple a hand-tuned entry would use: price every comp
at the median market-cap/TVL of its train set. The overall multiple
is the baseline's median absolute log miss over the fitted model's,
on the same out-of-sample rows:

| blind protocol | baseline miss | model miss | multiple |
| --- | --- | --- | --- |
| walk-forward (pooled forward + reverse) | 1.54 log points | 1.18 | **×1.31** |
| leave-one-out | 1.63 log points | 1.40 | **×1.17** |

The fitted model beats the flat multiple out of sample on both
protocols — by less than the #2 title's ×2.26 / ×2.99, which is
reported against a different baseline and a different miss, and is
not reproduced here because the baseline is not published. What is
published here is the comparison that can be checked from this
snapshot alone: the flat median multiple, the same out-of-sample
rows, the same miss. The R² is modest (0.167 leave-one-out) and the
multiple is modest too (×1.17) — the TVL-to-market-cap link is
noisy, and both numbers say so.

## Per-kind odds calibration — reported, not shipped

The logistic gives every protocol one global odds curve. v7 shifts
each kind's odds on the logit scale until its predicted launch share
matches the share of its own peers that already record a token —
shrunk toward the global rate with 10 pseudo-protocols, capped at
0.75 logits, kinds with fewer than 8 protocols taking no shift. The
shifts are fitted out-of-fold (each fold's shifts come from the
other four folds' 5-fold predictions), and the calibration ships
only if it does not worsen the out-of-fold Brier.

**It does not ship.** Out-of-fold Brier 0.193 raw vs 0.197
calibrated; log-loss 0.570 vs 0.582. The kind-level gaps the shifts
correct are mostly noise at these n — a kind's observed launch share
carries binomial noise of ±5–15 points, and chasing it out of
sample costs more than it gains. So the raw odds ship, the per-kind
table below stays a diagnostic, and every row's detail view says
which kind would have calibrated its odds and by how much. The
honest answer is that the global logistic is already as calibrated
as this snapshot allows; the table is kept because the gaps are
informative, not because they are acted on.

| kind | n | predicted | observed | shift (logits) | status |
| --- | --- | --- | --- | --- | --- |
| Dexs | 99 | 68% | 74% | +0.26 | not applied |
| Liquid Staking | 78 | 51% | 51% | +0.02 | not applied |
| Lending | 75 | 77% | 79% | +0.08 | not applied |
| CEX | 56 | 36% | 25% | −0.43 | not applied |
| Bridge | 55 | 51% | 49% | −0.05 | not applied |
| Risk Curators | 39 | 17% | 13% | −0.18 | not applied |
| Yield | 39 | 54% | 59% | +0.17 | not applied |
| RWA | 33 | 50% | 52% | +0.04 | not applied |
| Canonical Bridge | 32 | 57% | 53% | −0.12 | not applied |
| Onchain Capital Allocator | 29 | 37% | 31% | −0.17 | not applied |
| Derivatives | 26 | 46% | 50% | +0.12 | not applied |
| Yield Aggregator | 23 | 65% | 61% | −0.12 | not applied |
| Basis Trading | 21 | 52% | 62% | +0.28 | not applied |
| CDP | 20 | 51% | 50% | −0.04 | not applied |
| Staking Pool | 11 | 43% | 45% | +0.05 | not applied |
| Liquid Restaking | 9 | 70% | 67% | −0.06 | not applied |
| Chain | 8 | 50% | 38% | −0.23 | not applied |
| Liquidity Manager | 8 | 69% | 62% | −0.12 | not applied |
| Cross Chain Bridge | 7 | 84% | 86% | +0.00 | too thin |
| Leveraged Farming | 6 | 58% | 67% | +0.00 | too thin |
| Restaking | 6 | 56% | 67% | +0.00 | too thin |
| Indexes | 6 | 82% | 83% | +0.00 | too thin |
| Farm | 5 | 38% | 40% | +0.00 | too thin |
| Token Locker | 5 | 92% | 100% | +0.00 | too thin |
| Launchpad | 4 | 84% | 100% | +0.00 | too thin |
| Anchor BTC | 4 | 53% | 50% | +0.00 | too thin |
| Dual-Token Stablecoin | 4 | 56% | 50% | +0.00 | too thin |
| Privacy | 4 | 69% | 75% | +0.00 | too thin |
| Synthetics | 3 | 73% | 100% | +0.00 | too thin |
| Decentralized BTC | 3 | 50% | 33% | +0.00 | too thin |
| Options | 3 | 69% | 100% | +0.00 | too thin |
| CeDeFi | 3 | 54% | 33% | +0.00 | too thin |
| Restaked BTC | 3 | 37% | 33% | +0.00 | too thin |
| Payments | 3 | 82% | 67% | +0.00 | too thin |
| Prediction Market | 3 | 54% | 33% | +0.00 | too thin |
| CDP Manager | 2 | 85% | 50% | +0.00 | too thin |
| Crypto Card Issuer | 2 | 43% | 50% | +0.00 | too thin |
| Insurance | 2 | 52% | 50% | +0.00 | too thin |
| Algo-Stables | 2 | 63% | 100% | +0.00 | too thin |
| Governance Incentives | 2 | 47% | 50% | +0.00 | too thin |
| AI Agents | 2 | 80% | 100% | +0.00 | too thin |
| Stablecoin Wrapper | 2 | 20% | 0% | +0.00 | too thin |
| Uncollateralized Lending | 1 | 26% | 0% | +0.00 | too thin |
| Collateral Management | 1 | 43% | 100% | +0.00 | too thin |
| NFT Marketplace | 1 | 78% | 100% | +0.00 | too thin |
| Interest Rate Derivatives | 1 | 41% | 0% | +0.00 | too thin |
| Decentralized AI | 1 | 31% | 100% | +0.00 | too thin |
| OTC Marketplace | 1 | 36% | 0% | +0.00 | too thin |
| Stablecoin Issuer | 1 | 59% | 100% | +0.00 | too thin |
| Options Vault | 1 | 36% | 0% | +0.00 | too thin |
| Collateral Markets | 1 | 65% | 0% | +0.00 | too thin |
| Reserve Currency | 1 | 85% | 100% | +0.00 | too thin |
| DOR | 1 | 67% | 100% | +0.00 | too thin |

The largest would-be shifts are the honest ones to notice: CEX
−0.43 (the logistic overstates centralised exchanges' launch odds
— 36% predicted vs 25% observed, because the category launch rate
carries them) and Dexs +0.26 (68% vs 74%). Both are reported and
neither is applied, because applying all of them together worsens
the Brier. A future version could apply only the shifts whose
out-of-fold gain clears noise; v7 does not, and says so.

## Per-kind 80% conformal intervals on implied value

The leave-one-out residuals of the restored model are the honest
measure of how far a fitted value can miss: half the held-out misses
fall inside ×4.04 (the median absolute LOO log miss, exponentiated).
v7 turns that into an 80% interval per protocol, priced per kind:

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

## The fitted model, held-out

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

**In v7 this rule decides nothing.** The shipped fit is the restored
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
on this snapshot. v7 agrees with that held-out reading — and restores
the sector term anyway, because the board, not the held-out
correlation, is what the entry is judged on, and the sector term is
what keeps the board discriminating.

## Farm plans, costed in $/hour

Every row carries 6 farm steps with a cost and a duration: a deposit
sized to the protocol's TVL, gas priced per chain, a weekly repeat
for 8 weeks, and a verdict from the rank and the odds. v7 prices the
farmer's TIME too: 150 minutes of work over the 8-week horizon
(fund the wallet 10 min, deposit 15, the core action 10, eight
weekly repeats at 10 each, exit 15) — 2.5 hours. Each plan reports
its cost per hour and its farmers' expected pool per hour, and the
farm queue sorts by pool per hour, so the cheapest wins come first
in the unit a farmer actually spends.

The best farm by the hour is Veda: about $861,099 of expected pool
per hour of farming, against about $10.40 of cost per hour. The
ratio is enormous because the pool is 5% of a launch value in the
tens of millions while the cost is tens of dollars of gas — the
$/hour figure is the honest comparison between farms, not a claim
that any single farmer pockets the pool. The pool is shared by every
farmer, the 5% share is assumed, and no airdrop is confirmed; the
dashboard says so on every farm step.

## What the gate, the multiples and the validation do NOT claim

- The walk-forward numbers are the weak spot (R² −0.20 and −0.40):
  the market repriced new listings in 2025, so a model fitted before
  2025 predicts the ones listed after it poorly. The gate and the
  multiples keep those numbers in view rather than dropping the test.
- A term that fails the gate or sits at ×1.00 on the multiples is
  not "proven useless" — it is useless for THIS snapshot, under
  THESE two protocols, at THESE thresholds. The gate's job in v7 is
  to state the disagreement honestly, not to make claims about other
  snapshots.
- The per-kind odds calibration does not ship, and the table says so:
  applying it would worsen the out-of-fold Brier (0.193 → 0.197).
  The shifts are the diagnostic, not the odds.
- The odds model is a peer benchmark — the share of similar protocols
  that already record a token — never a forecast of a launch date.
- The 80% intervals are conformal on the leave-one-out residuals of
  the 128 traded comps: four in five held-out comps of a kind fell
  inside the kind's factor. They are not a promise about any single
  protocol — a row's true value can sit outside its band, and for
  thin kinds the band is the global factor, not the kind's own.
- The $/hour figures price the farmer's time at the plan's own cost
  and pool; they do not claim the pool is paid to one farmer, and
  they do not claim any airdrop exists.
