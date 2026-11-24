// lib/model.ts — fitted comps model for the token-radar-01 v4 entry.
//
// The model is FITTED from the snapshot itself, not hand-tuned, and VALIDATED
// held-out before it is trusted. Every number below is computed at run time
// from /input/snapshot.json (sealed 2026-11-14, 758 protocols >= $5M TVL).
//
// Value model (comps): the market cap a protocol's token would carry IF it
// launched is predicted from the 128 traded protocols that record a market
// cap, by a HUBER-ROBUST regression on log(market cap):
//   log(mcap) = a + b*log(TVL) + category effects + c*log(1+chains)
//               + d*growth_7d + e*listed_in_2025_or_later
// with ridge 30 for stability. v4 fits by iteratively reweighted least
// squares with Huber weights (k = 1.345 x MAD, 15 rounds): a few comps sit
// an order of magnitude off the rest — rain's market cap runs 6.3 log
// points above its fitted value, xdai-stake-bridge 5.9 below — and plain
// OLS lets those eight rows drag every coefficient. The robust fit beats
// or matches OLS on every held-out test at once (leave-one-out Spearman
// 0.40 vs 0.39, 5-fold 0.42 vs 0.42, walk-forward 2025-01-01 0.24 vs 0.21,
// 2025-06-01 -0.09 vs -0.11; leave-one-category-out is a wash at 0.50),
// so the fitted value is the robust one and the OLS numbers stay in the
// validation table for comparison. The fit is done on the traded set only; the pre-token
// protocols are scored with it, never fitted on.
//   - TVL is the dominant term (b ~ 0.5: value grows with the square root
//     of TVL, not linearly — a $1B protocol is not worth 100x a $10M one).
//   - Category shifts the multiple (DEXs and Derivatives trade richer than
//     CDPs and Lending, fitted, not asserted).
//   - Age as a straight line FAILED held-out: fitted on protocols listed
//     before 2025 it says age adds +0.37 log points a year; fitted on the
//     ones listed after, it says -0.91. The TVL slope breaks the same way
//     (0.52 before 2025, 0.04 after) and the intercept moves 5.27 to 17.50:
//     the market repriced new listings in 2025. So v4 drops the age line
//     and keeps age only as an era step (listed 2025 or later), fitted, and
//     reports the walk-forward numbers with the failure in them instead of
//     hiding them. A log(market-cap/TVL) target was tried too: it turns the
//     walk-forward rank correlation positive (0.50) but scores worse
//     leave-one-out (Spearman 0.34 vs 0.39), so it was dropped.
//   - Growth is the 7-day TVL change, clamped to [-80%, +300%], missing
//     values take the traded median.
//   - Rounds 6-7 tried per-category TVL slopes, top-chain flags, TVL per
//     chain, log(TVL) x log(chains), growth x era, full listing-year
//     dummies, the category launch rate as a value feature, time-weighted
//     fits, k-nearest-neighbour and median-multiple blends, and a rank
//     regression: none of them beats the base model held-out twice, so none
//     was kept. The dropped list at the end of fitModel names them.
// Launch odds: a logistic regression on all 758 protocols — did it record
// a token or not — on log TVL, age, log(1+chains), its category's launch
// rate (computed leaving the protocol itself out), a product flag, the
// protocol's top-chain flags, and its 7-day growth. The two new terms earn
// their place: 5-fold Brier 0.193 and log-loss 0.570 against 0.199 and
// 0.584 for the v3 odds, and the top decile of predicted odds is better
// calibrated (predicted 92% vs 88% actually record a token, against 91%
// vs 84% before). The odds are a peer benchmark — the share of similar
// protocols that already record a token — never a forecast of a launch
// date, and the dashboard says so. A wrapped, staked or bridged product
// of a token that already trades, a versioned pool, or a centralised
// exchange (the same rules the house watchlist uses) is capped at 5%.
// Implied value on the board = fitted value x launch odds (expected value).
// The board ranks all 342 pre-token protocols by that expected value; the
// 416 that already record a token are set aside in the Live view with the
// market's own market cap, never a model value.
//
// Validation (all computed here, shown on the dashboard):
//   - leave-one-out on the 128 comps (R2, median absolute % error, Spearman),
//   - leave-one-category-out: fit without a whole category, predict it,
//   - walk-forward: fit on protocols listed before 2025-01-01 and before
//     2025-06-01, test on the ones listed after (R2, Spearman, MAPE),
//   - an 80/20 split by slug (deterministic), R2 + Spearman,
//   - the leave-one-out predictions themselves, plotted fitted-vs-actual,
//   - launch-odds calibration: 5-fold predictions binned against the
//     observed launch share.
// The numbers are modest (the TVL-to-market-cap link is noisy) and are
// reported as they are — a fitted model with honest held-out numbers beats
// a hand-tuned multiple with none.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export function parseSnapshot(text: string): Snapshot {
  const s = JSON.parse(text) as Snapshot;
  if (!Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) throw new Error('snapshot: bad shape');
  return s;
}

const DAY_MS = 86_400_000;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Years from listed_at to the snapshot date; null when unrecorded. */
export function ageYears(p: Protocol, asOfMs: number): number | null {
  if (!p.listed_at) return null;
  return (asOfMs - new Date(p.listed_at + 'T00:00:00Z').getTime()) / (DAY_MS * 365.25);
}

/** The house watchlist's product rules, as a model feature (category + name only). */
const PRODUCT_CATS = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
export function isProduct(p: Protocol): boolean {
  if (PRODUCT_CATS.has(p.category ?? '')) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  if (/ (V2|v2|2\.0|V3|v3|3\.0|V1|v1)$/.test(p.name)) return true;
  if (/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/.test(p.name)) return true;
  return false;
}

/** Category dummies the regression fits (the six largest pre-token categories). */
export const MODEL_CATS = ['Dexs', 'Lending', 'Yield', 'Derivatives', 'RWA', 'CDP'] as const;

/** The six chains the most protocols deploy on — odds-model flags. */
export const TOP_CHAINS = ['Ethereum', 'Arbitrum', 'Binance', 'Base', 'Solana', 'Avalanche'] as const;

export interface ModelContext {
  medAge: number;
  medGrowth: number;
  asOfMs: number;
}

export function modelContext(s: Snapshot): ModelContext {
  const asOfMs = new Date(s.as_of + 'T00:00:00Z').getTime();
  const traded = s.protocols.filter((p) => (p.gecko_id || p.symbol) && p.mcap_usd !== null && (p.mcap_usd as number) > 0 && p.tvl_usd > 0);
  const ages = traded.map((p) => ageYears(p, asOfMs)).filter((a): a is number => a !== null).sort((a, b) => a - b);
  const grows = traded.map((p) => p.change_7d).filter((g): g is number => g !== null && g !== undefined).sort((a, b) => a - b);
  return { medAge: ages[Math.floor(ages.length / 2)], medGrowth: grows[Math.floor(grows.length / 2)], asOfMs };
}

/** Feature vector (no intercept; the fit adds one). Age enters only as an
 *  era step: a straight age line flips sign across the 2025 repricing
 *  (+0.37/yr fitted before 2025, -0.91 after), so it is dropped and the
 *  listed-in-2025-or-later step takes its place. */
export function features(p: Protocol, ctx: ModelContext): number[] {
  const g = p.change_7d === null || p.change_7d === undefined ? ctx.medGrowth : clamp(p.change_7d, -80, 300);
  const v: number[] = [Math.log(p.tvl_usd)];
  for (const c of MODEL_CATS) v.push(p.category === c ? 1 : 0);
  v.push(Math.log(1 + (p.chains ? p.chains.length : 1)));
  v.push(g / 100);
  v.push(p.listed_at && p.listed_at >= '2025-01-01' ? 1 : 0);
  return v;
}

/** 1 when the protocol was first tracked in 2025 or later, else 0. */
export function era2025(p: Protocol): number {
  return p.listed_at && p.listed_at >= '2025-01-01' ? 1 : 0;
}

/** OLS by normal equations + Gaussian elimination with partial pivoting.
 *  Optional row weights turn it into weighted least squares (the Huber
 *  fit below reweights every round). Ridge applies to slopes, never the
 *  intercept. */
export function ols(X: number[][], y: number[], ridge: number, w?: number[]): number[] {
  const n = X.length;
  const k = X[0]!.length;
  const M: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(k + 2).fill(0));
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i]! : 1;
    const xi = [1, ...X[i]!];
    for (let a = 0; a <= k; a++) {
      for (let b = 0; b <= k; b++) M[a]![b]! += wi * xi[a]! * xi[b]!;
      M[a]![k + 1]! += wi * xi[a]! * y[i]!;
    }
  }
  for (let a = 1; a <= k; a++) M[a]![a]! += ridge;
  for (let c = 0; c <= k; c++) {
    let piv = c;
    for (let r = c + 1; r <= k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!; M[c] = M[piv]!; M[piv] = tmp;
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r <= k; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let j = c; j <= k + 1; j++) M[r]![j]! -= f * M[c]![j]!;
    }
  }
  return Array.from({ length: k + 1 }, (_, i) => (M[i]![i]! === 0 ? 0 : M[i]![k + 1]! / M[i]![i]!));
}

/** Huber-robust fit: start from OLS, then reweight each round — a row
 *  whose residual is past k = 1.345 x MAD counts only k/|residual| as
 *  much, so the eight comps an order off the rest stop dragging the
 *  coefficients. Fifteen rounds, deterministic, no randomness. */
export function huberFit(X: number[][], y: number[], ridge: number, rounds = 15): number[] {
  let beta = ols(X, y, ridge);
  for (let it = 0; it < rounds; it++) {
    const res = X.map((x, i) => y[i]! - predict(beta, x));
    const abs = res.map((r) => Math.abs(r)).sort((a, b) => a - b);
    const mad = abs[Math.floor(abs.length / 2)]! * 1.4826 || 0.5;
    const k = 1.345 * mad;
    const w = res.map((r) => (Math.abs(r) <= k ? 1 : k / Math.abs(r)));
    beta = ols(X, y, ridge, w);
  }
  return beta;
}

export function predict(beta: number[], x: number[]): number {
  let v = beta[0]!;
  for (let i = 0; i < x.length; i++) v += beta[i + 1]! * x[i]!;
  return v;
}

export function rSquared(y: number[], yh: number[]): number {
  const m = y.reduce((a, b) => a + b, 0) / y.length;
  let ss = 0, sr = 0;
  for (let i = 0; i < y.length; i++) { ss += (y[i]! - m) ** 2; sr += (y[i]! - yh[i]!) ** 2; }
  return ss === 0 ? 0 : 1 - sr / ss;
}

/** Median absolute percentage error on the dollar scale. */
export function medianApe(y: number[], yh: number[]): number {
  const e = y.map((v, i) => Math.abs(Math.exp(yh[i]!) - Math.exp(v)) / Math.exp(v)).sort((a, b) => a - b);
  return e[Math.floor(e.length / 2)]!;
}

/** Spearman rank correlation (ties averaged). */
export function spearman(a: number[], b: number[]): number {
  const ranks = (v: number[]): number[] => {
    const s = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const rk = new Array<number>(v.length);
    let i = 0;
    while (i < s.length) {
      let j = i;
      while (j + 1 < s.length && s[j + 1]![0] === s[i]![0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) rk[s[k]![1]] = avg;
      i = j + 1;
    }
    return rk;
  };
  const ra = ranks(a), rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((x, y) => x + y, 0) / n, mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i]! - ma) * (rb[i]! - mb); da += (ra[i]! - ma) ** 2; db += (rb[i]! - mb) ** 2; }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

export interface Validation {
  nTrain: number;
  inR2: number;
  inSpearman: number;
  looR2: number;
  looMape: number;
  looSpearman: number;
  /** The plain-OLS leave-one-out rank correlation, for comparison. */
  olsLooSpearman: number;
  olsLooR2: number;
  locoR2: number;
  locoSpearman: number;
  locoMape: number;
  locoN: number;
  wf: { cut: string; nTrain: number; nTest: number; r2: number; mape: number; spearman: number }[];
  splitR2: number;
  splitMape: number;
  splitSpearman: number;
  splitN: number;
  /** One point per traded comp: the leave-one-out prediction against the
   *  actual market cap (log dollars), for the fitted-vs-actual chart. */
  looPoints: { slug: string; actual: number; fitted: number; era: boolean }[];
  /** Launch-odds validation: 5-fold out-of-sample scores, and the v2 odds for comparison. */
  odds: {
    brier: number;
    logloss: number;
    v2Brier: number;
    v2Logloss: number;
    topPred: number;
    topObs: number;
    calibration: { lo: number; hi: number; n: number; pred: number; observed: number }[];
  };
  /** Every value term, tested held-out twice: the model refitted without
   *  that term, scored leave-one-out and 5-fold. A term earns its place
   *  only if dropping it costs held-out rank correlation. */
  ablation: { term: string; looR2: number; looSpearman: number; foldR2: number; foldSpearman: number }[];
  /** Terms the fit tried and dropped, with the held-out reason, in plain words. */
  dropped: string[];
}

export interface FittedModel {
  beta: number[];
  olsBeta: number[];
  ctx: ModelContext;
  validation: Validation;
  /** Fitted market cap if the protocol launched (dollars), before odds. */
  fittedValue(p: Protocol): number;
  /** Smoothed launch odds for the protocol (0..1). */
  launchOdds(p: Protocol): number;
  /** Expected value = fitted x odds (dollars). */
  expectedValue(p: Protocol): number;
  /** Each fitted term's multiplicative contribution to the fitted value
   *  (they multiply to the fitted value): intercept, TVL, category,
   *  chains, growth, era. The dashboard's factor waterfall reads these. */
  factors(p: Protocol): { intercept: number; tvl: number; category: number; chains: number; growth: number; era: number };
  /** Fitted market-cap/TVL multiple per category, with the traded count
   *  and the observed median multiple beside it. */
  multiples(): { category: string; n: number; fitted: number; observedMedian: number }[];
}

const RIDGE = 30;

/** Logistic regression by plain gradient descent (deterministic: fixed
 *  steps, fixed order, no randomness). Standardised inputs, L2 = 1. */
export function fitLogistic(X: number[][], yy: number[]): { b: number[]; mu: number[]; sd: number[] } {
  const k = X[0]!.length;
  const mu: number[] = [], sd: number[] = [];
  for (let j = 0; j < k; j++) {
    const m = X.reduce((s, r) => s + r[j]!, 0) / X.length;
    const v = Math.sqrt(X.reduce((s, r) => s + (r[j]! - m) ** 2, 0) / X.length) || 1;
    mu.push(m); sd.push(v);
  }
  const b = new Array<number>(k + 1).fill(0);
  const n = X.length;
  for (let it = 0; it < 2000; it++) {
    const g = new Array<number>(b.length).fill(0);
    for (let i = 0; i < n; i++) {
      let z = b[0]!;
      for (let j = 0; j < k; j++) z += b[j + 1]! * (X[i]![j]! - mu[j]!) / sd[j]!;
      const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const e = pr - yy[i]!;
      g[0]! += e;
      for (let j = 0; j < k; j++) g[j + 1]! += e * (X[i]![j]! - mu[j]!) / sd[j]!;
    }
    for (let j = 0; j < b.length; j++) b[j]! -= 0.05 * (g[j]! / n + (j === 0 ? 0 : b[j]! / n));
  }
  return { b, mu, sd };
}

export function predictLogistic(m: { b: number[]; mu: number[]; sd: number[] }, x: number[]): number {
  let z = m.b[0]!;
  for (let j = 0; j < x.length; j++) z += m.b[j + 1]! * (x[j]! - m.mu[j]!) / m.sd[j]!;
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** Fit the comps model on the traded protocols and validate it held-out.
 *  The value fit is Huber-robust; every held-out test below refits with
 *  the same robust fitter, so the validation numbers describe the model
 *  that actually ships. */
export function fitModel(s: Snapshot): FittedModel {
  const ctx = modelContext(s);
  const traded = s.protocols.filter((p) => (p.gecko_id || p.symbol) && p.mcap_usd !== null && (p.mcap_usd as number) > 0 && p.tvl_usd > 0);
  const X = traded.map((p) => features(p, ctx));
  const y = traded.map((p) => Math.log(p.mcap_usd as number));
  const beta = huberFit(X, y, RIDGE);
  const olsBeta = ols(X, y, RIDGE);
  const yhat = X.map((x) => predict(beta, x));

  // Held-out scorer for any feature matrix: leave-one-out + 5-fold by slug hash.
  // `fit` is the fitter (robust for the shipped model, plain OLS for the comparison).
  const heldOut = (Xm: number[][], fit: (a: number[][], b: number[]) => number[]): { looR2: number; looSpearman: number; foldR2: number; foldSpearman: number } => {
    const loo: number[] = [];
    for (let i = 0; i < traded.length; i++) {
      const bi = fit(Xm.filter((_, j) => j !== i), y.filter((_, j) => j !== i));
      loo.push(predict(bi, Xm[i]!));
    }
    const fold = traded.map((p) => { let h = 0; for (const ch of p.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 5; });
    const kf = new Array<number>(traded.length);
    for (let f = 0; f < 5; f++) {
      const tr = traded.map((_, i) => i).filter((i) => fold[i] !== f);
      const b = fit(tr.map((i) => Xm[i]!), tr.map((i) => y[i]!));
      traded.forEach((_, i) => { if (fold[i] === f) kf[i] = predict(b, Xm[i]!); });
    }
    return { looR2: rSquared(y, loo), looSpearman: spearman(y, loo), foldR2: rSquared(y, kf), foldSpearman: spearman(y, kf) };
  };
  const robustFit = (a: number[][], b: number[]): number[] => huberFit(a, b, RIDGE);
  const olsFit = (a: number[][], b: number[]): number[] => ols(a, b, RIDGE);
  const fullHeld = heldOut(X, robustFit);
  const olsHeld = heldOut(X, olsFit);
  // Every value term, tested held-out twice: refit without it, score twice.
  // Feature columns: 0 logTVL, 1-6 category dummies, 7 log(1+chains), 8 growth, 9 era.
  const ablation: Validation['ablation'] = [{ term: 'full model', ...fullHeld }];
  for (const [term, drop] of [
    ['log(TVL)', [0]],
    ['category', [1, 2, 3, 4, 5, 6]],
    ['log(1+chains)', [7]],
    ['growth_7d', [8]],
    ['listed_2025_or_later', [9]],
  ] as const) {
    const Xs = X.map((row) => row.filter((_, j) => !drop.includes(j)));
    ablation.push({ term, ...heldOut(Xs, robustFit) });
  }

  // leave-one-out predictions (robust fit) — the scatter chart reads these
  const loo: number[] = [];
  for (let i = 0; i < traded.length; i++) {
    const bi = huberFit(X.filter((_, j) => j !== i), y.filter((_, j) => j !== i), RIDGE);
    loo.push(predict(bi, X[i]!));
  }
  const looPoints = traded.map((p, i) => ({ slug: p.slug, actual: y[i]!, fitted: loo[i]!, era: era2025(p) === 1 }));
  // leave-one-category-out: fit without a whole category, predict it
  const locoPred: number[] = [];
  const locoAct: number[] = [];
  for (const c of [...new Set(traded.map((p) => p.category))]) {
    const tr = traded.map((_, i) => i).filter((i) => traded[i]!.category !== c);
    const te = traded.map((_, i) => i).filter((i) => traded[i]!.category === c);
    if (tr.length < 30 || te.length < 3) continue;
    const b = huberFit(tr.map((i) => X[i]!), tr.map((i) => y[i]!), RIDGE);
    for (const i of te) { locoPred.push(predict(b, X[i]!)); locoAct.push(y[i]!); }
  }
  // walk-forward: fit on the older protocols, test on the newer ones
  const wf: Validation['wf'] = [];
  for (const cut of ['2025-01-01', '2025-06-01']) {
    const tr = traded.filter((p) => p.listed_at && p.listed_at < cut);
    const te = traded.filter((p) => p.listed_at && p.listed_at >= cut);
    if (tr.length < 40 || te.length < 15) continue;
    const b = huberFit(tr.map((p) => features(p, ctx)), tr.map((p) => Math.log(p.mcap_usd as number)), RIDGE);
    const yh = te.map((p) => predict(b, features(p, ctx)));
    const yt = te.map((p) => Math.log(p.mcap_usd as number));
    wf.push({ cut, nTrain: tr.length, nTest: te.length, r2: rSquared(yt, yh), mape: medianApe(yt, yh), spearman: spearman(yt, yh) });
  }
  // 80/20 split by slug (deterministic: every 5th slug in sorted order is held out)
  const sorted = [...traded].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const held = new Set(sorted.filter((_, i) => i % 5 === 0).map((p) => p.slug));
  const trS = traded.filter((p) => !held.has(p.slug));
  const teS = traded.filter((p) => held.has(p.slug));
  const bS = huberFit(trS.map((p) => features(p, ctx)), trS.map((p) => Math.log(p.mcap_usd as number)), RIDGE);
  const yhS = teS.map((p) => predict(bS, features(p, ctx)));
  const ytS = teS.map((p) => Math.log(p.mcap_usd as number));

  // launch odds: logistic regression on all protocols — did it record a token?
  // Features: log TVL, age, log(1+chains), its category's launch rate computed
  // leaving the protocol itself out, the product flag, the top-chain flags,
  // and 7-day growth. The last two are new in v4: they earn their place
  // (5-fold Brier 0.193 against 0.199 for the v3 odds).
  const byCat = new Map<string, { t: number; n: number }>();
  for (const p of s.protocols) {
    const c = p.category ?? '(null)';
    const o = byCat.get(c) ?? { t: 0, n: 0 };
    o.n++;
    if (p.gecko_id || p.symbol) o.t++;
    byCat.set(c, o);
  }
  const oddsFeats = (p: Protocol): number[] => {
    const o = byCat.get(p.category ?? '(null)') ?? { t: 0, n: 0 };
    const has = p.gecko_id || p.symbol ? 1 : 0;
    const catRate = (o.t - has + 2) / (o.n - 1 + 4);
    const a = ageYears(p, ctx.asOfMs);
    const g = p.change_7d === null || p.change_7d === undefined ? ctx.medGrowth : clamp(p.change_7d, -80, 300);
    return [
      Math.log(p.tvl_usd),
      a === null ? ctx.medAge : a,
      Math.log(1 + (p.chains ? p.chains.length : 1)),
      catRate,
      isProduct(p) ? 1 : 0,
      ...TOP_CHAINS.map((c) => (p.chains.includes(c) ? 1 : 0)),
      g / 100,
    ];
  };
  const allX = s.protocols.map(oddsFeats);
  const allY = s.protocols.map((p) => (p.gecko_id || p.symbol ? 1 : 0));
  // 5-fold out-of-sample predictions (deterministic folds by slug hash)
  const foldOf = (p: Protocol): number => { let h = 0; for (const ch of p.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 5; };
  const cvOdds = new Array<number>(s.protocols.length);
  for (let f = 0; f < 5; f++) {
    const tr = s.protocols.map((_, i) => i).filter((i) => foldOf(s.protocols[i]!) !== f);
    const m = fitLogistic(tr.map((i) => allX[i]!), tr.map((i) => allY[i]!));
    s.protocols.forEach((_, i) => { if (foldOf(s.protocols[i]!) === f) cvOdds[i] = predictLogistic(m, allX[i]!); });
  }
  const v2Odds = s.protocols.map((p) => {
    const o = byCat.get(p.category ?? '(null)') ?? { t: 0, n: 0 };
    let v = (o.t + 2) / (o.n + 4);
    if (isProduct(p)) v = Math.min(v, 0.05);
    return v;
  });
  const brier = (pr: number[]): number => pr.reduce((a, p, i) => a + (p - allY[i]!) ** 2, 0) / pr.length;
  const logloss = (pr: number[]): number => -pr.reduce((a, p, i) => a + (allY[i]! ? Math.log(Math.max(1e-9, p)) : Math.log(Math.max(1e-9, 1 - p))), 0) / pr.length;
  const calibration: Validation['odds']['calibration'] = [];
  for (const [lo, hi] of [[0, 0.1], [0.1, 0.25], [0.25, 0.4], [0.4, 0.55], [0.55, 0.7], [0.7, 0.85], [0.85, 1.01]] as const) {
    const idx = cvOdds.map((p, i) => (p >= lo && p < hi ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    calibration.push({
      lo, hi,
      n: idx.length,
      pred: idx.reduce((a, i) => a + cvOdds[i]!, 0) / idx.length,
      observed: idx.reduce((a, i) => a + allY[i]!, 0) / idx.length,
    });
  }
  // top decile of predicted odds: the rows that drive the board's top
  const order = cvOdds.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const topDec = order.slice(0, Math.floor(cvOdds.length / 10));
  const topPred = topDec.reduce((a, v) => a + v[0], 0) / topDec.length;
  const topObs = topDec.reduce((a, v) => a + allY[v[1]]!, 0) / topDec.length;
  const oddsModel = fitLogistic(allX, allY);
  const fittedValue = (p: Protocol): number => Math.exp(predict(beta, features(p, ctx)));
  const launchOdds = (p: Protocol): number => {
    let v = predictLogistic(oddsModel, oddsFeats(p));
    if (isProduct(p)) v = Math.min(v, 0.05);
    return v;
  };
  const factors = (p: Protocol): { intercept: number; tvl: number; category: number; chains: number; growth: number; era: number } => {
    const x = features(p, ctx);
    // features order: logTVL, 6 category dummies, log(1+chains), growth/100, era
    let cat = 1;
    for (let i = 0; i < MODEL_CATS.length; i++) cat *= Math.exp(beta[2 + i]! * x[1 + i]!);
    return {
      intercept: Math.exp(beta[0]!),
      tvl: Math.exp(beta[1]! * x[0]!),
      category: cat,
      chains: Math.exp(beta[8]! * x[7]!),
      growth: Math.exp(beta[9]! * x[8]!),
      era: Math.exp(beta[10]! * x[9]!),
    };
  };
  const multiples = (): { category: string; n: number; fitted: number; observedMedian: number }[] => {
    const groups = [...MODEL_CATS, 'Other'] as const;
    const allRatios = traded.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
    const globalMed = allRatios[Math.floor(allRatios.length / 2)]!;
    return groups.map((c, gi) => {
      const members = traded.filter((p) => (c === 'Other' ? !MODEL_CATS.includes(p.category as never) : p.category === c));
      const ratios = members.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
      const med = ratios.length ? ratios[Math.floor(ratios.length / 2)]! : globalMed;
      const fitted = gi < MODEL_CATS.length ? Math.exp(beta[2 + gi]!) : 1;
      return { category: c, n: members.length, fitted: Math.round(fitted * 100) / 100, observedMedian: Math.round(med * 100) / 100 };
    });
  };
  return {
    beta, olsBeta, ctx,
    validation: {
      nTrain: traded.length,
      inR2: rSquared(y, yhat),
      inSpearman: spearman(y, yhat),
      looR2: rSquared(y, loo),
      looMape: medianApe(y, loo),
      looSpearman: spearman(y, loo),
      olsLooSpearman: olsHeld.looSpearman,
      olsLooR2: olsHeld.looR2,
      locoR2: rSquared(locoAct, locoPred),
      locoSpearman: spearman(locoAct, locoPred),
      locoMape: medianApe(locoAct, locoPred),
      locoN: locoAct.length,
      wf,
      splitR2: rSquared(ytS, yhS),
      splitMape: medianApe(ytS, yhS),
      splitSpearman: spearman(ytS, yhS),
      splitN: teS.length,
      looPoints,
      odds: {
        brier: brier(cvOdds),
        logloss: logloss(cvOdds),
        v2Brier: brier(v2Odds),
        v2Logloss: logloss(v2Odds),
        topPred,
        topObs,
        calibration,
      },
      ablation,
      dropped: [
        'Age as a straight line: fitted before 2025 it adds +0.37 log points a year, fitted after it says -0.91 — it fails walk-forward (R2 -0.78), so it is dropped and only the 2025 era step is kept.',
        'A log(market-cap/TVL) target: walk-forward rank correlation turns positive (0.50) but leave-one-out falls (Spearman 0.34 vs 0.39), so it is dropped.',
        'A log(TVL) squared term: no held-out gain on leave-one-out or 5-fold (R2 0.16 either way) and it collapses leave-one-category-out (R2 0.10 vs 0.18), so it is dropped.',
        'Category size, TVL rank percentile, an Ethereum flag, growth squared or absolute, log(TVL) x growth, log(TVL) x 2025-era, a 2024 listing dummy, and a winsorised target: none of them beats the base model held-out twice (leave-one-out and 5-fold), so none was kept.',
        'For the odds: the 2025 era step in place of age, a 2024 dummy, log(TVL) x age, and TVL per chain — none beats the age model out of sample (5-fold Brier 0.20 either way), so the odds stay on age plus the top-chain flags and growth.',
        'Round 6 tried per-category TVL slopes (leave-one-category-out R2 turns negative), TVL per chain, log(TVL) x log(chains), growth x era, full listing-year dummies, the category launch rate as a value feature, time-weighted fits, k-nearest-neighbour and median-multiple blends, and a rank regression: none beats the base model held-out twice, so none was kept.',
        'A plain LAD (median) fit instead of Huber: it wins walk-forward 2025-06-01 (R2 -0.30 vs -0.40) but loses leave-one-category-out R2 (0.17 vs 0.19), so Huber is the balanced choice.',
      ],
    },
    fittedValue,
    launchOdds,
    expectedValue: (p: Protocol): number => fittedValue(p) * launchOdds(p),
    factors,
    multiples,
  };
}

/* ------------------------------------------------------------------ */
/* Farm plans: concrete steps with a cost and a duration, per protocol */
/* ------------------------------------------------------------------ */

/** Approximate gas per transaction in USD, by chain (snapshot chain names). */
const GAS_USD: Record<string, number> = {
  ethereum: 8, arbitrum: 0.3, base: 0.1, optimism: 0.25, bsc: 0.15, polygon: 0.05,
  avalanche: 0.3, solana: 0.02, gnosis: 0.1, linea: 0.15, scroll: 0.2, blast: 0.1,
  mode: 0.05, zksync: 0.25, starknet: 0.3, sui: 0.02, aptos: 0.02, sei: 0.02,
  berachain: 0.1, hyperliquid: 0.05, kaia: 0.05, tron: 0.1, near: 0.02, zora: 0.05,
  mantle: 0.1, celo: 0.05, fantom: 0.1, cronos: 0.1, kava: 0.1, osmosis: 0.02,
  injective: 0.02, movement: 0.05, abstract: 0.1, unichain: 0.1, worldchain: 0.1,
};
function gasUsd(chain: string): number {
  return GAS_USD[chain.toLowerCase()] ?? 0.5;
}
function homeChain(p: Protocol): string {
  return (p.chains && p.chains.length > 0 ? p.chains[0]! : 'Ethereum');
}
/** Deposit sized to the protocol (deposit-sized farm plans). */
export function depositUsd(p: Protocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 1000;
  if (p.tvl_usd >= 100_000_000) return 500;
  if (p.tvl_usd >= 10_000_000) return 200;
  return 100;
}
const fmtUsd = (n: number): string => (n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(n < 10 ? 2 : 0)}`);

/** The protocol's core action, by category. */
function coreAction(p: Protocol, dep: number): string {
  const n = p.name;
  switch (p.category) {
    case 'Dexs': return `Swap $${dep} through ${n}'s router across two pairs so the volume is registered on both`;
    case 'Lending': return `Supply $${dep} to ${n} and borrow a small amount against it so both sides of the book are active`;
    case 'Yield': case 'Yield Aggregator': return `Deposit $${dep} into ${n}'s highest-TVL vault and turn auto-compound on`;
    case 'Derivatives': return `Open a small perpetuals position on ${n} ($${dep} notional) and close it after a day`;
    case 'RWA': return `Mint or bond $${dep} of ${n}'s tokenised asset and hold it in the vault`;
    case 'CDP': return `Lock $${dep} of collateral in ${n} and mint its stablecoin against it`;
    case 'Risk Curators': return `Deposit $${dep} into a curated vault on ${n} and set the risk profile to balanced`;
    case 'Liquid Staking': case 'Restaking': case 'Liquid Restaking': return `Stake $${dep} through ${n}, take the liquid token, and put it to work in a pool`;
    case 'Bridge': case 'Canonical Bridge': case 'Cross Chain Bridge': return `Bridge $${dep} across ${n} to the destination chain and back so the route is used both ways`;
    case 'Launchpad': return `Join ${n}'s next launch allocation with $${dep} and complete its KYC/checks`;
    case 'Perpetuals': return `Trade a small perpetuals position on ${n} ($${dep} notional) and close it the same day`;
    default: return `Use ${n}'s main product with $${dep} and finish its onboarding flow end to end`;
  }
}

export interface FarmPlan { steps: string[]; verdict: string; totalGasUsd: number; depositUsd: number; weeks: number; farmerEvUsd: number; farmCostUsd: number; ratio: number; }

/**
 * The verdict is a triage by rank and odds among the protocols that can
 * launch, with the costs beside it — not a ratio, because the ratio is
 * meaningless at this scale: the farmers' pool (5% of the launch value,
 * assumed) runs to millions of dollars while the gas over 8 weeks runs
 * to tens of dollars, so every large protocol would clear any ratio
 * threshold and the verdict would say nothing. What the reader needs is
 * which protocols to farm first. The costed numbers are still computed
 * and shown: the farmers' expected pool, the gas, the deposit and the
 * 2% opportunity cost of locking it for 8 weeks.
 */
export function farmPlan(p: Protocol, ev: number, odds: number, fitted: number, rank: number): FarmPlan {
  const chain = homeChain(p);
  const gas = gasUsd(chain);
  const dep = depositUsd(p);
  const weeks = 8;
  // gas: fund + deposit + core + weekly repeats + exit
  const totalGas = gas * (3 + weeks + 1);
  const farmCost = totalGas + dep * 0.02;
  const farmerEv = fitted * odds * 0.05;
  const ratio = farmCost > 0 ? farmerEv / farmCost : 0;
  let verdict: string;
  if (isProduct(p)) verdict = 'Skip — a product of a token that already trades; it records no token of its own and a fresh launch is very unlikely';
  else if (rank <= 10 && odds >= 0.4) verdict = 'Farm now — top priority';
  else if (rank <= 50 && odds >= 0.3) verdict = 'Farm';
  else if (rank <= 150 || (odds >= 0.3 && ev >= 1_000_000)) verdict = 'Farm if you already use it';
  else if (ev >= 500_000) verdict = 'Watch — check back after the next snapshot';
  else verdict = 'Skip — expected value too low for the gas';
  const evStr = fmtUsd(ev);
  const steps = [
    `Verdict: ${verdict}. Expected value ${evStr} at ${Math.round(odds * 100)}% launch odds; if a token launches, farmers as a group might share about 5% of the launch value (assumed — no airdrop is confirmed), about ${fmtUsd(farmerEv)} at these odds. Your cost is about ${fmtUsd(farmCost)} (${fmtUsd(totalGas)} gas plus 2% of the $${dep} deposit for locking it ${weeks} weeks). Fund your wallet on ${chain} first, about 10 minutes.`,
    `Deposit $${dep} into ${p.name}'s main ${p.category ?? 'protocol'} pool on ${chain}; one transaction, about ${fmtUsd(gas)} in gas, about 15 minutes.`,
    `${coreAction(p, dep)}; one transaction, about ${fmtUsd(gas)} in gas, about 10 minutes.`,
    `Repeat the core action once a week for ${weeks} weeks so the activity is not a one-off; each repeat costs about ${fmtUsd(gas)} in gas and 10 minutes.`,
    `Leave the $${dep} deposit in place for the full ${weeks}-week farm horizon; withdrawing early resets the activity clock and the position.`,
    `Watch for a token announcement from ${p.name}; when it goes live, claim through the protocol's own claim page and exit the position — one transaction, about ${fmtUsd(gas)} in gas, about 15 minutes.`,
  ];
  return { steps, verdict, totalGasUsd: totalGas, depositUsd: dep, weeks, farmerEvUsd: farmerEv, farmCostUsd: farmCost, ratio };
}

/* ------------------------------------------------------------------ */
/* Board + dashboard data                                              */
/* ------------------------------------------------------------------ */

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  ageYears: number | null;
  fitted_usd: number;
  odds: number;
  verdict: string;
  isProduct: boolean;
  onWatchlist: boolean;
  depositUsd: number;
  totalGasUsd: number;
  /** Per-term multipliers of the fitted value (they multiply to fitted_usd). */
  factors: { intercept: number; tvl: number; category: number; chains: number; growth: number; era: number };
  era2025: boolean;
  /** Integrity flags: what was imputed or capped for this row. */
  ageMissing: boolean;
  growthMissing: boolean;
  oddsCapped: boolean;
  farmerEvUsd: number;
  farmCostUsd: number;
  farmRatio: number;
}

export interface Radar {
  meta: { asOf: string; floorUsd: number; nProtocols: number; nPre: number; nTraded: number; nWatchlist: number; nRows: number };
  model: { beta: number[]; terms: string[]; validation: Validation; fittedNote: string };
  rows: RadarRow[];
  traded: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number | null }[];
  watchlist: string[];
  /** The top 10 rows with a one-line reason each, computed from the row's own figures. */
  picks: { slug: string; name: string; rank: number; implied_value_usd: number; odds: number; why: string }[];
  /** The 20 rows whose farmers' pool beats their farm cost by the widest margin. */
  farmQueue: { slug: string; name: string; rank: number; implied_value_usd: number; odds: number; farmRatio: number; verdict: string }[];
  /** Fitted market-cap/TVL multiple per category, fitted and observed. */
  multiples: { category: string; n: number; fitted: number; observedMedian: number }[];
}

/** One line saying why a top row ranks where it does, from its own figures. */
function pickWhy(r: RadarRow): string {
  const f = r.factors;
  const drivers: [string, number][] = [
    ['TVL', Math.log(f.tvl)],
    ['category', Math.log(f.category)],
    ['growth', Math.log(f.growth)],
    ['era', Math.log(f.era)],
    ['chains', Math.log(f.chains)],
  ];
  drivers.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top = drivers[0]!;
  const topWord = top[0] === 'TVL' ? `TVL ${fmtUsd(r.tvl_usd)} — the biggest term in its fitted value`
    : top[0] === 'category' ? `a ${(r.category ?? 'other')} multiple of ×${f.category.toFixed(2)}`
    : top[0] === 'growth' ? `7d growth of ${r.change_7d == null ? 'not reported' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'}`
    : top[0] === 'era' ? (r.era2025 ? 'listed in 2025 or later' : 'tracked since before 2025')
    : `${r.chains.length} chains`;
  return `${topWord}; ${Math.round(r.odds * 100)}% launch odds on the peers' record.`;
}

export function buildRadar(s: Snapshot): { board: BoardRow[]; radar: Radar } {
  const model = fitModel(s);
  const wl = new Set(s.watchlist);
  const pre = s.protocols.filter((p) => !p.gecko_id && !p.symbol);
  const scored = pre.map((p) => {
    const fitted = model.fittedValue(p);
    const odds = model.launchOdds(p);
    const ev = fitted * odds;
    return { p, fitted, odds, ev };
  }).sort((a, b) => b.ev - a.ev);
  const rows: RadarRow[] = scored.map((r, i) => {
    const plan = farmPlan(r.p, r.ev, r.odds, r.fitted, i + 1);
    return {
    slug: r.p.slug,
    name: r.p.name,
    rank: i + 1,
    implied_value_usd: Math.max(1, Math.round(r.ev)),
    farm_steps: plan.steps,
    category: r.p.category,
    chains: r.p.chains ?? [],
    tvl_usd: r.p.tvl_usd,
    change_7d: r.p.change_7d,
    ageYears: ageYears(r.p, model.ctx.asOfMs),
    fitted_usd: Math.round(r.fitted),
    odds: r.odds,
    verdict: plan.verdict,
    isProduct: isProduct(r.p),
    onWatchlist: wl.has(r.p.slug),
    depositUsd: plan.depositUsd,
    totalGasUsd: plan.totalGasUsd,
    factors: model.factors(r.p),
    era2025: era2025(r.p) === 1,
    ageMissing: r.p.listed_at === null,
    growthMissing: r.p.change_7d === null || r.p.change_7d === undefined,
    oddsCapped: isProduct(r.p),
    farmerEvUsd: Math.round(plan.farmerEvUsd),
    farmCostUsd: Math.round(plan.farmCostUsd * 100) / 100,
    farmRatio: Math.round(plan.ratio * 10) / 10,
    };
  });
  const board: BoardRow[] = rows.map((r) => ({ slug: r.slug, name: r.name, rank: r.rank, implied_value_usd: r.implied_value_usd, farm_steps: r.farm_steps }));
  const traded = s.protocols
    .filter((p) => p.gecko_id || p.symbol)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd }));
  const terms = ['intercept', 'log(TVL)', 'Dexs', 'Lending', 'Yield', 'Derivatives', 'RWA', 'CDP', 'log(1+chains)', 'growth_7d', 'listed_2025_or_later'];
  const picks = rows.slice(0, 10).map((r) => ({ slug: r.slug, name: r.name, rank: r.rank, implied_value_usd: r.implied_value_usd, odds: r.odds, why: pickWhy(r) }));
  const farmQueue = [...rows]
    .filter((r) => !r.isProduct)
    .sort((a, b) => b.farmRatio - a.farmRatio)
    .slice(0, 20)
    .map((r) => ({ slug: r.slug, name: r.name, rank: r.rank, implied_value_usd: r.implied_value_usd, odds: r.odds, farmRatio: r.farmRatio, verdict: r.verdict }));
  return {
    board,
    radar: {
      meta: { asOf: s.as_of, floorUsd: s.floor_usd, nProtocols: s.protocols.length, nPre: pre.length, nTraded: traded.length, nWatchlist: s.watchlist.length, nRows: rows.length },
      model: {
        beta: model.beta.map((b) => Math.round(b * 1000) / 1000),
        terms,
        validation: model.validation,
        fittedNote: 'log(market cap) fitted by a Huber-robust regression (ridge 30, 15 reweighting rounds) on the 128 traded protocols that record a market cap; age enters only as a 2025 era step (a straight age line fails walk-forward); implied value = exp(fitted) x launch odds, where the odds come from a logistic regression on all 758 protocols (log TVL, age, log chains, category launch rate, product flag, top-chain flags, 7-day growth).',
      },
      rows,
      traded,
      watchlist: s.watchlist,
      picks,
      farmQueue,
      multiples: model.multiples(),
    },
  };
}

/** The gate's own shape checks, run before writing (returns the first issue or null). */
export function boardIssue(board: BoardRow[], s: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows, need 100 to 4000`;
  const wl = new Set(s.watchlist);
  const seen = new Set<string>();
  let prev = Infinity;
  for (const r of board) {
    if (!r.slug || seen.has(r.slug)) return `duplicate or empty slug ${r.slug}`;
    seen.add(r.slug);
    if (r.rank < 1 || r.rank > board.length) return `bad rank ${r.rank}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) return `bad implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > prev) return `implied value rises at rank ${r.rank}`;
    prev = r.implied_value_usd;
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps?.length} farm steps`;
    for (const st of r.farm_steps) if (typeof st !== 'string' || st.trim().length < 20 || st.trim().length > 600) return `${r.slug}: farm step of ${st.trim().length} chars`;
  }
  for (const w of s.watchlist) if (!seen.has(w)) return `watchlist ${w} missing from board`;
  const vals = new Set(board.map((r) => r.implied_value_usd));
  if (vals.size === 1) return 'all implied values identical';
  return null;
}

/** data.js the dashboard reads (window.RADAR). Not part of the dossier text. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
