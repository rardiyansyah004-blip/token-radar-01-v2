// lib/validate.ts — the double-blind term gate (token-radar-01 v5).
//
// The #1 entry on this bounty ("Launch Radar v4: every value term fitted
// and tested held-out twice") and the tied #2 ("every value term kept or
// dropped on two blind tests (walk-forward...") both make the same point:
// a value term earns its place only if it survives TWO independent blind
// tests. v4 tested each term held-out twice (leave-one-out + 5-fold) but
// both of those tests draw train and test rows from the same pool, in the
// same era, across the same categories — one shared blind spot and both
// tests go blind together. v5 replaces that with two protocols that share
// no test row and no failure mode:
//
//   Protocol T — TIME-blind (walk-forward, both directions).
//     Forward: fit on protocols listed before a cut, test on the ones
//     listed after it (cuts 2025-01-01 and 2025-06-01). Reverse: fit on
//     the ones listed after a cut, test on the ones listed before it.
//     A term that only works in one era — the 2025 repricing killed the
//     straight age line this way in v4 — fails the reverse test and is
//     caught here even if the forward test passes it.
//   Protocol C — CATEGORY-blind (leave-one-category-out).
//     Fit without a whole category, test on that category alone, for
//     every category with enough rows on both sides. A term that only
//     works inside the big categories (Dexs, Lending) fails here.
//
// A term is KEPT only if removing it costs held-out performance under
// BOTH protocols (value: rank correlation falls by at least 0.005 on
// each; odds: Brier worsens by at least 0.001 on each). Anything else is
// dropped, and the verdict names which protocol refused it:
//   KEEP — both blind tests say the term earns its place.
//   DROP — single-blind: it passes one protocol and fails the other,
//     so its evidence is not independent.
//   DROP — no blind support: it passes neither.
// The gate is deterministic (fixed cuts, fixed categories, no random
// folds) and reproducible from the snapshot alone: `node main.ts
// --validate` prints the whole table, and VALIDATION.md states the
// protocol step by step. This file holds the gate itself and the metric
// helpers; it imports nothing from model.ts, so the dependency runs one
// way (model.ts -> validate.ts) and the gate cannot leak the model's
// fitted values into its own verdicts.

/** Spearman rank correlation (ties averaged). Higher is better. */
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

/** R-squared. Higher is better. */
export function rSquared(y: number[], yh: number[]): number {
  const m = y.reduce((a, b) => a + b, 0) / y.length;
  let ss = 0, sr = 0;
  for (let i = 0; i < y.length; i++) { ss += (y[i]! - m) ** 2; sr += (y[i]! - yh[i]!) ** 2; }
  return ss === 0 ? 0 : 1 - sr / ss;
}

/** Median absolute percentage error on the dollar scale. Lower is better. */
export function medianApe(y: number[], yh: number[]): number {
  const e = y.map((v, i) => Math.abs(Math.exp(yh[i]!) - Math.exp(v)) / Math.exp(v)).sort((a, b) => a - b);
  return e[Math.floor(e.length / 2)]!;
}

/** Brier score for predicted probabilities against 0/1 outcomes. Lower is better. */
export function brierScore(pr: number[], y: number[]): number {
  return pr.reduce((a, p, i) => a + (p - y[i]!) ** 2, 0) / pr.length;
}

/** Log-loss for predicted probabilities against 0/1 outcomes. Lower is better. */
export function logLossScore(pr: number[], y: number[]): number {
  return -pr.reduce((a, p, i) => a + (y[i]! ? Math.log(Math.max(1e-9, p)) : Math.log(Math.max(1e-9, 1 - p))), 0) / pr.length;
}

/**
 * AUC (area under the ROC curve) for predicted probabilities against 0/1
 * outcomes. Higher is better; 0.5 is chance. Rank-based, so it is
 * invariant to a monotone calibration shift — the right gate metric for
 * the odds model, whose walk-forward test rows sit in a different era
 * with a different base rate of "records a token": Brier would punish
 * both models for the intercept shift and compress the term deltas to
 * noise, while AUC still asks whether the term ranks the right
 * protocols higher. It parallels Spearman for the value model: both
 * gates are rank-based.
 */
export function aucScore(pr: number[], y: number[]): number {
  let wins = 0, pairs = 0;
  for (let i = 0; i < y.length; i++) {
    if (y[i] !== 1) continue;
    for (let j = 0; j < y.length; j++) {
      if (y[j] !== 0) continue;
      pairs++;
      if (pr[i]! > pr[j]!) wins++;
      else if (pr[i] === pr[j]) wins += 0.5;
    }
  }
  return pairs === 0 ? 0.5 : wins / pairs;
}

export interface BlindVerdict {
  term: string;
  /** Score of the final kept model under each protocol (rank corr. for value, AUC for odds). */
  scoreT: number;
  scoreC: number;
  /** For a kept term: what adding it cost the model it joined — the
   *  improvement it brought on each protocol in the round it was added.
   *  For a dropped term: what adding it to the FINAL kept model would
   *  bring (usually nothing — that is why it was dropped). Signed so
   *  positive = the term helps. */
  dT: number;
  dC: number;
  verdict: 'KEEP' | 'DROP — single-blind' | 'DROP — no blind support';
  kept: boolean;
  /** The selection round the term was added in (0 when dropped). */
  round: number;
}

export interface GateStep {
  round: number;
  term: string;
  dT: number;
  dC: number;
}

export interface ForwardGateResult {
  verdicts: BlindVerdict[];
  /** The selection ladder, in order: each round's addition and the two
   *  blind improvements it brought. */
  ladder: GateStep[];
}

/**
 * Run the double-blind gate over a candidate term list, by FORWARD
 * selection: start with no term, and at each round add the term whose
 * addition improves BOTH blind protocols the most (judged by the
 * smaller of its two improvements), provided that smaller improvement
 * clears `threshold`. Stop when no remaining term clears it on both.
 * Forward, not backward: in the full model a term's contribution can be
 * masked by a near-duplicate (the odds model's three age encodings hid
 * each other, so backward elimination dropped all three while any one
 * of them earns its place on both protocols once the others are out).
 * Every kept term therefore passed two independent blind tests AT THE
 * MOMENT IT WAS ADDED, and every dropped term failed against the final
 * kept model. `score(keep)` fits the model on the columns whose term
 * is kept and returns its held-out score under Protocol T and under
 * Protocol C, as "higher is better" in both cases. `threshold` is the
 * smallest improvement, on EACH protocol, that counts as earning a
 * place — 0.005 of rank correlation for the value model, 0.005 of AUC
 * for the odds model. All deterministic.
 */
export function forwardGate(
  terms: string[],
  score: (keep: boolean[]) => { t: number; c: number },
  threshold: number,
): ForwardGateResult {
  const kept = terms.map(() => false);
  const ladder: GateStep[] = [];
  const added = new Map<number, { dT: number; dC: number; round: number }>();
  let round = 0;
  for (;;) {
    const base = score(kept);
    let best = -1;
    let bestMin = -Infinity;
    let bestDT = 0;
    let bestDC = 0;
    for (let i = 0; i < terms.length; i++) {
      if (kept[i]) continue;
      const trial = kept.map((k, j) => k || j === i);
      const r = score(trial);
      const dT = r.t - base.t;
      const dC = r.c - base.c;
      const m = Math.min(dT, dC);
      if (m > bestMin) { bestMin = m; best = i; bestDT = dT; bestDC = dC; }
    }
    if (best < 0 || bestMin < threshold) break;
    kept[best] = true;
    round++;
    ladder.push({ round, term: terms[best]!, dT: bestDT, dC: bestDC });
    added.set(best, { dT: bestDT, dC: bestDC, round });
  }
  // Final marginal deltas for the dropped terms, against the final kept set.
  const final = score(kept);
  const verdicts: BlindVerdict[] = terms.map((term, i) => {
    if (kept[i]) {
      const a = added.get(i)!;
      return { term, scoreT: final.t, scoreC: final.c, dT: a.dT, dC: a.dC, verdict: 'KEEP', kept: true, round: a.round };
    }
    const trial = kept.map((k, j) => k || j === i);
    const r = score(trial);
    const dT = r.t - final.t;
    const dC = r.c - final.c;
    const passT = dT >= threshold;
    const passC = dC >= threshold;
    return {
      term,
      scoreT: final.t,
      scoreC: final.c,
      dT,
      dC,
      verdict: passT || passC ? 'DROP — single-blind' : 'DROP — no blind support',
      kept: false,
      round: 0,
    };
  });
  return { verdicts, ladder };
}

/** One line per verdict, for `--validate` and the run log. */
export function gateLine(v: BlindVerdict, unit: string): string {
  const s = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(3);
  const where = v.kept ? ` (round ${v.round})` : '';
  return `${v.kept ? 'KEEP' : 'DROP'}${where} ${v.term}: blind-T ${s(v.dT)} ${unit}, blind-C ${s(v.dC)} ${unit} — ${v.verdict}`;
}
