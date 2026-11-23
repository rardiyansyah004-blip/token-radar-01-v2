# Launch Radar — a token-launch radar for token-radar-01

Pre-token protocols, ranked by expected value: a fitted value model
times launch odds. Built for make.fun `token-radar-01`.

## What it is

- **758 protocols** from the sealed DeFiLlama snapshot (2026-11-14, floor $50M).
- **342 pre-token protocols ranked** on the board; the **40-protocol
  watchlist** is covered in full; the **416 that already record a token**
  sit on the Traded tab with the market's own market cap, never a model value.
- **Value model:** ridge OLS of log(market cap) on log(TVL), category,
  log(1+chains), age and 7-day growth, fitted on the 128 traded protocols
  that record a market cap. Fitted value = what a protocol would be worth
  if it launched.
- **Launch odds:** the smoothed share of a protocol's category peers that
  already record a token, capped at 5% for wrapped, staked or bridged
  products of a token that already trades, versioned pools and centralised
  exchanges. Expected value = fitted value x launch odds; the rank follows it.
- **Validation (held-out, on the traded comps):** leave-one-out R2 0.13,
  rank correlation 0.35, MAPE 88%; walk-forward (train before 2025-01-01,
  test after) R2 -0.78, rank 0.20; walk-forward (2025-06-01) R2 -0.72,
  rank -0.09; 80/20 split by slug R2 -0.24, rank 0.40. The TVL-to-market-cap
  link is noisy, so the R2 is modest — it is reported as it is, not dressed up.
- **Farm plans:** every row carries 6 steps with a cost and a duration —
  a deposit sized to the protocol's TVL, gas priced per chain, a weekly
  repeat for 8 weeks, and a verdict (Farm now / Farm / Farm if you already
  use it / Watch / Skip) from expected value against that cost.

## Run

`node main.ts --input <snapshot.json>` writes `board.json`, `data.js`,
the dashboard and `screenshots/` to `$MAKEFUN_OUTPUT_DIR` (default
`./output`). Deterministic: two runs are byte-identical.
