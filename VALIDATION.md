# VALIDATION.md — the double-blind term gate (token-radar-01 v5)

Reproduce everything below from the sealed snapshot alone:

```sh
node main.ts --validate --input <snapshot.json>
```

No network, no randomness, no dates beyond the snapshot's own
`as_of`. The program runs the gate from scratch on every run, so the
numbers in `data.js` (`model.validation.gate`) are the numbers below.

## Why two blind tests, and why forward

v4 tested each term held-out twice — leave-one-out and 5-fold — but
both tests draw train and test rows from the same pool, in the same
era, across the same categories. One shared blind spot and both tests
go blind together. v5 runs two protocols that share no test row and no
failure mode, and a term must pass BOTH to be kept.

The gate runs FORWARD, not backward. In the full model a term's
contribution can be masked by a near-duplicate: the odds model
carries three age encodings (straight age, log(1+age), the 2025 era
step) that hide each other, so backward elimination — refit without
each term in turn — dropped all three, while any one of them earns its
place on both protocols once the others are out. Forward selection
(start empty, add the best term that clears both protocols, repeat)
does not have that failure mode. Every kept term passed two
independent blind tests at the moment it was added.

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
  on Brier and log-loss (5-fold), below.

## Protocol C — category-blind (leave-one-category-out)

- Value: for every category with ≥ 30 train rows and ≥ 3 test rows,
  fit without that whole category, test on it. One pooled Spearman
  over all the out-of-sample pairs (n = 100).
- Odds: for every category with ≥ 100 train rows and ≥ 30 test rows,
  the same. One pooled AUC.

## The rule

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

## Results on this snapshot

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

## The gated model, held-out

- Value (Huber-robust, ridge 30, 15 reweighting rounds, on the kept
  terms only): leave-one-out R² 0.175, Spearman 0.410, MAPE 85%;
  leave-one-category-out R² 0.251, Spearman 0.509 (n=100);
  walk-forward 2025-01-01 R² −0.18, Spearman 0.24; walk-forward
  2025-06-01 R² −0.37, Spearman −0.04; 80/20 split by slug R² −0.05,
  Spearman 0.47 (n=26). In-sample R² 0.194, Spearman 0.439. Plain OLS
  on the same kept terms: leave-one-out R² 0.170, Spearman 0.402.
- The eight-term candidate model scores leave-one-out R² 0.175,
  Spearman 0.410 — identical to the gated one-term model to three
  decimals. The seven dropped terms cost nothing held-out.
- Odds (logistic on the kept terms only): 5-fold Brier 0.200,
  log-loss 0.587; top decile predicted 90% vs 85% observed. The old
  category-share odds score Brier 0.321, log-loss 1.020 on the same
  split. Calibration bins (predicted vs observed): 0–10% 0.08 vs 0.17
  (n=18), 10–25% 0.19 vs 0.22 (n=67), 25–40% 0.33 vs 0.31 (n=129),
  40–55% 0.48 vs 0.46 (n=149), 55–70% 0.63 vs 0.63 (n=197), 70–85%
  0.78 vs 0.82 (n=127), 85–100% 0.90 vs 0.86 (n=71).
- The blind range on a fitted value is ×3.53: the median absolute
  leave-one-out log miss, exponentiated — half the held-out misses
  fall inside it.

## The supporting table (not the decider)

The dashboard also prints the v4 test — every value term refitted
without, scored leave-one-out and 5-fold, over the full eight-term
candidate set. log(TVL) carries the model (without it the held-out
rank correlation falls to 0.23 leave-one-out, 0.25 5-fold); dropping
any other single term moves it by at most 0.02, and dropping
log(1+chains) improves the 5-fold rank correlation outright. The gate
above is what decides; this table is the second opinion.

## Cross-check: an independent entry agrees

The #7 entry's published backtest ladder (leave-one-out over 86 traded
tokens, and 53 older tokens pricing 33 newer ones) finds the same
shape: a flat cap/TVL multiple misses by ×4.59/×4.54 on average, the
size curve cuts that to ×3.19/×2.53, and adding the sector term moves
it to ×3.18/×2.53 — nothing. Two independent entries, two different
metrics (rank correlation here, average miss there), the same
conclusion: the size curve is the value; the sector term is decoration
on this snapshot.

## What the gate does NOT claim

- The walk-forward numbers are the weak spot (R² −0.18 and −0.37):
  the market repriced new listings in 2025, so a model fitted before
  2025 predicts the ones listed after it poorly. The gate keeps those
  numbers in view rather than dropping the test.
- A term that fails the gate is not "proven useless" — it is useless
  for THIS snapshot, under THESE two protocols, at THESE thresholds.
  The gate's job is to stop the model from carrying decoration, not to
  make claims about other snapshots.
- The odds model is a peer benchmark — the share of similar protocols
  that already record a token — never a forecast of a launch date.
