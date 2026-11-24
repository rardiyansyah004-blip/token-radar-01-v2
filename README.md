# Launch Radar — a token-launch radar for token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rardiyansyah004-blip/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rardiyansyah004-blip/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pre-token protocols, ranked by expected value: a fitted value model
times launch odds. Built for make.fun `token-radar-01`.

## Run it

```sh
node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=g75rgwrg&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## What it is

- **758 protocols** from the sealed DeFiLlama snapshot (2026-11-14, floor $50M).
- **342 pre-token protocols ranked** on the board; the **40-protocol
  watchlist** is covered in full; the **416 that already record a token**
  sit on the Traded tab with the market's own market cap, never a model value.
- **Value model:** a Huber-robust regression (ridge 30, 15 reweighting
  rounds) of log(market cap) on log(TVL), category, log(1+chains), 7-day
  growth and a 2025 era step, fitted on the 128 traded protocols that
  record a market cap. A few comps sit an order of magnitude off the rest,
  so plain OLS lets them drag every coefficient; the robust fit beats or
  matches OLS on every held-out test at once (leave-one-out rank
  correlation 0.40 vs 0.39, 5-fold 0.42 vs 0.42, walk-forward 2025-01-01
  0.24 vs 0.21; leave-one-category-out is a wash at 0.50), and the OLS
  numbers stay in the validation table for comparison. Fitted value = what
  a protocol would be worth if it launched. Age as a straight line was dropped: fitted before 2025 it
  adds +0.37 log points a year, fitted after it says −0.91 — the market
  repriced new listings in 2025, so only the era step is kept.
- **Launch odds:** a logistic regression on all 758 protocols — did it
  record a token or not — on log TVL, age, log(1+chains), its category's
  launch rate (leaving the protocol itself out), a product flag, the
  top-chain flags and 7-day growth, capped at 5% for wrapped, staked or
  bridged products of a token that already trades. The odds are a peer
  benchmark, never a forecast of a launch date. Expected value = fitted
  value x launch odds; the rank follows it.
- **Validation (held-out, on the traded comps):** leave-one-out R2 0.17,
  rank correlation 0.40, MAPE 86%; leave-one-category-out R2 0.24, rank
  0.50; walk-forward (train before 2025-01-01, test after) R2 −0.20, rank
  0.24; walk-forward (2025-06-01) R2 −0.40, rank −0.09; 80/20 split by
  slug R2 −0.08, rank 0.51. The walk-forward numbers
  are the weak spot and are kept in view, not dropped. Odds: 5-fold Brier
  0.19, log-loss 0.57 (the old category-share odds scored 0.32 and 1.02
  on the same split), with calibration bins within 0.07 of the observed
  launch share and the top decile predicted 92% vs 88% observed.
  Every value term is tested held-out twice: the model refitted without
  that term, scored leave-one-out and 5-fold, and the table is on the
  dashboard — log(TVL) carries the model (without it the held-out rank
  correlation falls to about 0.00); dropping any other single term moves it by
  at most 0.02, so those terms are small and are kept because the bounty
  asks the value to follow from TVL, growth and age.
  Terms tried and dropped: a straight age line, a log(market-cap/TVL)
  target (walk-forward rank 0.50 but leave-one-out worse), a log(TVL)
  squared term (no held-out gain; collapses leave-one-category-out).
  A third round tried category size, TVL rank percentile, an Ethereum
  flag, growth squared/absolute, log(TVL) x growth, log(TVL) x the 2025
  era step, a 2024 listing dummy and a winsorised target for the value
  model, and growth, the era step, a 2024 dummy and the Ethereum flag
  for the odds — none of them beats the base model held-out twice, so
  the model is at what 128 comps and 10 snapshot fields support, and
  the dashboard says so instead of pretending otherwise. A fourth round
  tried per-category TVL slopes, TVL per chain, log(TVL) x log(chains),
  growth x era, full listing-year dummies, the category launch rate as a
  value feature, time-weighted fits, k-nearest-neighbour and
  median-multiple blends, and a rank regression — none beats the base
  model held-out twice either. A plain LAD (median) fit wins
  walk-forward 2025-06-01 but loses leave-one-category-out, so Huber is
  the balanced choice.
  "Records a token" means the snapshot gives a protocol a CoinGecko id
  or a symbol: 416 do. Only 128 of them record a market cap; the other
  288 record a symbol but no market cap, mostly product lines carrying
  their parent's token, so they are set aside with the traded set and
  never ranked. The board ranks only the 342 that record nothing at all.
- **Farm plans:** every row carries 6 steps with a cost and a duration —
  a deposit sized to the protocol's TVL, gas priced per chain, a weekly
  repeat for 8 weeks, and a verdict from the rank and the odds, with the
  costed numbers beside it: the farmers' expected pool (5% of the launch
  value, assumed — no airdrop is confirmed), the gas, and 2% of the
  deposit as the cost of locking it for 8 weeks.
- **Dashboard:** sortable/filterable board, a detail view per protocol
  with a factor waterfall (each fitted term as the multiplier it is), a
  top-10 conviction list with a computed one-line reason per pick, a
  fitted-vs-actual scatter of the leave-one-out predictions, a
  category-multiples table, an odds-calibration chart, a farm queue
  sorted by pool vs farm cost, a model sandbox (sliders re-rank the view
  only, never the submitted board), a compare mode for two protocols, a
  CSV download of the filtered board, and an integrity strip on every row
  (what was imputed, capped or excluded).

## Run

`node main.ts --input <snapshot.json>` writes `board.json`, `data.js`,
the dashboard and `screenshots/` to `$MAKEFUN_OUTPUT_DIR` (default
`./output`). Deterministic: two runs are byte-identical.
