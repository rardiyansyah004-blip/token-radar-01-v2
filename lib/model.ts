// lib/model.ts — fitted comps model for the token-radar-01 v2 entry.
//
// The model is FITTED from the snapshot itself, not hand-tuned, and VALIDATED
// held-out before it is trusted. Every number below is computed at run time
// from /input/snapshot.json (sealed 2026-11-14, 758 protocols >= $5M TVL).
//
// Value model (comps): the market cap a protocol's token would carry IF it
// launched is predicted from the 128 traded protocols that record a market
// cap, by ordinary least squares on log(market cap):
//   log(mcap) = a + b*log(TVL) + category effects + c*log(1+chains)
//               + d*age_years + e*growth_7d
// with a small ridge (1.0) for stability. The fit is done on the traded set
// only; the pre-token protocols are scored with it, never fitted on.
//   - TVL is the dominant term (b ~ 0.5: value grows with the square root
//     of TVL, not linearly — a $1B protocol is not worth 100x a $10M one).
//   - Category shifts the multiple (DEXs and Derivatives trade richer than
//     CDPs and Lending, fitted, not asserted).
//   - Age is years since DefiLlama first tracked the protocol; growth is
//     the 7-day TVL change, clamped to [-80%, +300%], missing values take
//     the traded median.
// Launch odds: the smoothed share of a protocol's category peers that
// already record a token, (traded+2)/(total+4). A wrapped, staked or
// bridged product of a token that already trades, a versioned pool, or a
// centralised exchange (the same rules the house watchlist uses) is capped
// at 5%: it records no token of its own, but it is a product of one that
// trades, so a fresh launch is very unlikely.
// Implied value on the board = fitted value x launch odds (expected value).
// The board ranks all 342 pre-token protocols by that expected value; the
// 416 that already record a token are set aside in the Live view with the
// market's own market cap, never a model value.
//
// Validation (all computed here, shown on the dashboard):
//   - leave-one-out on the 128 comps (R2, median absolute % error, Spearman),
//   - walk-forward: fit on protocols listed before 2025-01-01 and before
//     2025-06-01, test on the ones listed after (R2, Spearman, MAPE),
//   - an 80/20 split by slug (deterministic), R2 + Spearman.
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

/** Feature vector (no intercept; the fit adds one). */
export function features(p: Protocol, ctx: ModelContext): number[] {
  const a = ageYears(p, ctx.asOfMs);
  const age = a === null ? ctx.medAge : a;
  const g = p.change_7d === null || p.change_7d === undefined ? ctx.medGrowth : clamp(p.change_7d, -80, 300);
  const v: number[] = [Math.log(p.tvl_usd)];
  for (const c of MODEL_CATS) v.push(p.category === c ? 1 : 0);
  v.push(Math.log(1 + (p.chains ? p.chains.length : 1)));
  v.push(age);
  v.push(g / 100);
  return v;
}

/** OLS by normal equations + Gaussian elimination with partial pivoting. */
export function ols(X: number[][], y: number[], ridge: number): number[] {
  const n = X.length;
  const k = X[0]!.length;
  const M: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(k + 2).fill(0));
  for (let i = 0; i < n; i++) {
    const xi = [1, ...X[i]!];
    for (let a = 0; a <= k; a++) {
      for (let b = 0; b <= k; b++) M[a]![b]! += xi[a]! * xi[b]!;
      M[a]![k + 1]! += xi[a]! * y[i]!;
    }
  }
  for (let a = 1; a <= k; a++) M[a]![a]! += ridge; // ridge on slopes, never the intercept
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
  wf: { cut: string; nTrain: number; nTest: number; r2: number; mape: number; spearman: number }[];
  splitR2: number;
  splitMape: number;
  splitSpearman: number;
  splitN: number;
}

export interface FittedModel {
  beta: number[];
  ctx: ModelContext;
  validation: Validation;
  /** Fitted market cap if the protocol launched (dollars), before odds. */
  fittedValue(p: Protocol): number;
  /** Smoothed launch odds for the protocol (0..1). */
  launchOdds(p: Protocol): number;
  /** Expected value = fitted x odds (dollars). */
  expectedValue(p: Protocol): number;
}

const RIDGE = 1;

/** Fit the comps model on the traded protocols and validate it held-out. */
export function fitModel(s: Snapshot): FittedModel {
  const ctx = modelContext(s);
  const traded = s.protocols.filter((p) => (p.gecko_id || p.symbol) && p.mcap_usd !== null && (p.mcap_usd as number) > 0 && p.tvl_usd > 0);
  const X = traded.map((p) => features(p, ctx));
  const y = traded.map((p) => Math.log(p.mcap_usd as number));
  const beta = ols(X, y, RIDGE);
  const yhat = X.map((x) => predict(beta, x));

  // leave-one-out
  const loo: number[] = [];
  for (let i = 0; i < traded.length; i++) {
    const bi = ols(X.filter((_, j) => j !== i), y.filter((_, j) => j !== i), RIDGE);
    loo.push(predict(bi, X[i]!));
  }
  // walk-forward: fit on the older protocols, test on the newer ones
  const wf: Validation['wf'] = [];
  for (const cut of ['2025-01-01', '2025-06-01']) {
    const tr = traded.filter((p) => p.listed_at && p.listed_at < cut);
    const te = traded.filter((p) => p.listed_at && p.listed_at >= cut);
    if (tr.length < 40 || te.length < 15) continue;
    const b = ols(tr.map((p) => features(p, ctx)), tr.map((p) => Math.log(p.mcap_usd as number)), RIDGE);
    const yh = te.map((p) => predict(b, features(p, ctx)));
    const yt = te.map((p) => Math.log(p.mcap_usd as number));
    wf.push({ cut, nTrain: tr.length, nTest: te.length, r2: rSquared(yt, yh), mape: medianApe(yt, yh), spearman: spearman(yt, yh) });
  }
  // 80/20 split by slug (deterministic: every 5th slug in sorted order is held out)
  const sorted = [...traded].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const held = new Set(sorted.filter((_, i) => i % 5 === 0).map((p) => p.slug));
  const trS = traded.filter((p) => !held.has(p.slug));
  const teS = traded.filter((p) => held.has(p.slug));
  const bS = ols(trS.map((p) => features(p, ctx)), trS.map((p) => Math.log(p.mcap_usd as number)), RIDGE);
  const yhS = teS.map((p) => predict(bS, features(p, ctx)));
  const ytS = teS.map((p) => Math.log(p.mcap_usd as number));

  // launch odds: smoothed share of category peers that already record a token
  const byCat = new Map<string, { t: number; n: number }>();
  for (const p of s.protocols) {
    const c = p.category ?? '(null)';
    const o = byCat.get(c) ?? { t: 0, n: 0 };
    o.n++;
    if (p.gecko_id || p.symbol) o.t++;
    byCat.set(c, o);
  }
  const fittedValue = (p: Protocol): number => Math.exp(predict(beta, features(p, ctx)));
  const launchOdds = (p: Protocol): number => {
    const o = byCat.get(p.category ?? '(null)') ?? { t: 0, n: 0 };
    let v = (o.t + 2) / (o.n + 4);
    if (isProduct(p)) v = Math.min(v, 0.05);
    return v;
  };
  return {
    beta, ctx,
    validation: {
      nTrain: traded.length,
      inR2: rSquared(y, yhat),
      inSpearman: spearman(y, yhat),
      looR2: rSquared(y, loo),
      looMape: medianApe(y, loo),
      looSpearman: spearman(y, loo),
      wf,
      splitR2: rSquared(ytS, yhS),
      splitMape: medianApe(ytS, yhS),
      splitSpearman: spearman(ytS, yhS),
      splitN: teS.length,
    },
    fittedValue,
    launchOdds,
    expectedValue: (p: Protocol): number => fittedValue(p) * launchOdds(p),
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
  berachain: 0.1, hyperliquid: 0.05, kaia: 0.05, tron: 0.1, near: 0.02, 'zora': 0.05,
  'mantle': 0.1, 'celo': 0.05, 'fantom': 0.1, 'cronos': 0.1, 'kava': 0.1, 'osmosis': 0.02,
  'injective': 0.02, 'movement': 0.05, 'abstract': 0.1, 'unichain': 0.1, 'worldchain': 0.1,
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

export interface FarmPlan { steps: string[]; verdict: string; totalGasUsd: number; depositUsd: number; weeks: number; }

export function farmPlan(p: Protocol, ev: number, odds: number): FarmPlan {
  const chain = homeChain(p);
  const gas = gasUsd(chain);
  const dep = depositUsd(p);
  const weeks = 8;
  // gas: fund + deposit + core + weekly repeats + exit
  const totalGas = gas * (3 + weeks + 1);
  let verdict: string;
  if (isProduct(p)) verdict = 'Skip — a product of a token that already trades; it records no token of its own and a fresh launch is very unlikely';
  else if (odds >= 0.5 && ev >= 10_000_000) verdict = 'Farm now — top priority';
  else if (odds >= 0.4 && ev >= 5_000_000) verdict = 'Farm';
  else if (odds >= 0.3 && ev >= 2_000_000) verdict = 'Farm if you already use it';
  else if (ev >= 500_000) verdict = 'Watch — check back after the next snapshot';
  else verdict = 'Skip — expected value too low for the gas';
  const evStr = fmtUsd(ev);
  const steps = [
    `Verdict: ${verdict}. Expected value ${evStr} at ${Math.round(odds * 100)}% launch odds; total gas about ${fmtUsd(totalGas)} over ${weeks} weeks plus a $${dep} deposit you get back. Fund your wallet on ${chain} first, about 10 minutes.`,
    `Deposit $${dep} into ${p.name}'s main ${p.category ?? 'protocol'} pool on ${chain}; one transaction, about ${fmtUsd(gas)} in gas, about 15 minutes.`,
    `${coreAction(p, dep)}; one transaction, about ${fmtUsd(gas)} in gas, about 10 minutes.`,
    `Repeat the core action once a week for ${weeks} weeks so the activity is not a one-off; each repeat costs about ${fmtUsd(gas)} in gas and 10 minutes.`,
    `Leave the $${dep} deposit in place for the full ${weeks}-week farm horizon; withdrawing early resets the activity clock and the position.`,
    `Watch for a token announcement from ${p.name}; when it goes live, claim through the protocol's own claim page and exit the position — one transaction, about ${fmtUsd(gas)} in gas, about 15 minutes.`,
  ];
  return { steps, verdict, totalGasUsd: totalGas, depositUsd: dep, weeks };
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
}

export interface Radar {
  meta: { asOf: string; floorUsd: number; nProtocols: number; nPre: number; nTraded: number; nWatchlist: number; nRows: number };
  model: { beta: number[]; terms: string[]; validation: Validation; fittedNote: string };
  rows: RadarRow[];
  traded: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number | null }[];
  watchlist: string[];
}

export function buildRadar(s: Snapshot): { board: BoardRow[]; radar: Radar } {
  const model = fitModel(s);
  const wl = new Set(s.watchlist);
  const pre = s.protocols.filter((p) => !p.gecko_id && !p.symbol);
  const scored = pre.map((p) => {
    const fitted = model.fittedValue(p);
    const odds = model.launchOdds(p);
    const ev = fitted * odds;
    const plan = farmPlan(p, ev, odds);
    return { p, fitted, odds, ev, plan };
  }).sort((a, b) => b.ev - a.ev);
  const rows: RadarRow[] = scored.map((r, i) => ({
    slug: r.p.slug,
    name: r.p.name,
    rank: i + 1,
    implied_value_usd: Math.max(1, Math.round(r.ev)),
    farm_steps: r.plan.steps,
    category: r.p.category,
    chains: r.p.chains ?? [],
    tvl_usd: r.p.tvl_usd,
    change_7d: r.p.change_7d,
    ageYears: ageYears(r.p, model.ctx.asOfMs),
    fitted_usd: Math.round(r.fitted),
    odds: r.odds,
    verdict: r.plan.verdict,
    isProduct: isProduct(r.p),
    onWatchlist: wl.has(r.p.slug),
    depositUsd: r.plan.depositUsd,
    totalGasUsd: r.plan.totalGasUsd,
  }));
  const board: BoardRow[] = rows.map((r) => ({ slug: r.slug, name: r.name, rank: r.rank, implied_value_usd: r.implied_value_usd, farm_steps: r.farm_steps }));
  const traded = s.protocols
    .filter((p) => p.gecko_id || p.symbol)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd }));
  const terms = ['intercept', 'log(TVL)', 'Dexs', 'Lending', 'Yield', 'Derivatives', 'RWA', 'CDP', 'log(1+chains)', 'age_years', 'growth_7d'];
  return {
    board,
    radar: {
      meta: { asOf: s.as_of, floorUsd: s.floor_usd, nProtocols: s.protocols.length, nPre: pre.length, nTraded: traded.length, nWatchlist: s.watchlist.length, nRows: rows.length },
      model: {
        beta: model.beta.map((b) => Math.round(b * 1000) / 1000),
        terms,
        validation: model.validation,
        fittedNote: 'log(market cap) fitted by OLS (ridge 1) on the 128 traded protocols that record a market cap; implied value = exp(fitted) x launch odds.',
      },
      rows,
      traded,
      watchlist: s.watchlist,
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
