// main.ts — token-radar-01 v6 entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot at /input/snapshot.json (or --input <file|dir>),
// scores every pre-token protocol with the restored v4 Huber-robust fitted
// comps model in lib/model.ts, writes the ranked board to /output/board.json,
// the dashboard's data to /output/data.js, copies dashboard/ and screenshots/
// to /output, and writes /output/dossier.json with buildDossier from
// vendor/makefun-board.ts.
//
// v6 restores the v4 fit in full (the v5 double-blind gate is kept as a
// reported diagnostic only — it decides nothing about the fit) and adds
// per-kind 80% conformal intervals on every row's implied value.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
// The program runs twice and both runs must write the same bytes: the model
// is a pure function of the snapshot (no dates, no randomness, no network).
//
// Reproduce the validation without writing anything:
//   node main.ts --validate --input ../input/snapshot.json
// prints the double-blind gate as a diagnostic (both protocols, every term,
// keep or drop with the deltas), the held-out summary, and the per-kind
// conformal interval table. See VALIDATION.md for the protocol itself.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { gateLine } from './lib/validate.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function flagValue(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = flagValue('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const v = radar.model.validation;

if (process.argv.includes('--validate')) {
  const g = v.gate;
  const iv = v.intervals;
  process.stdout.write(
    'token radar v6 — validation (reproduce with: node main.ts --validate --input <snapshot.json>)\n' +
    'restored model: v4 Huber-robust value model (log TVL, category, log(1+chains), growth, 2025 era step) + v4 odds logistic (log TVL, age, log(1+chains), category launch rate, product flag, top-chain flags, growth)\n' +
    '--- double-blind gate: DIAGNOSTIC ONLY in v6 — it does not decide the fit (v5 let it drop 7 of 8 value terms and 8 of 10 odds terms; the board lost its discrimination while held-out stats barely moved) ---\n' +
    `rule: ${g.rule}\n` +
    '--- value terms (delta = held-out rank correlation gained by adding the term; keep needs >= +0.005 on BOTH protocols) ---\n' +
    g.value.map((d) => `  ${gateLine(d, 'rank corr.')}`).join('\n') + '\n' +
    `value ladder: ${g.valueLadder.map((s) => `round ${s.round} ${s.term} (+${s.dT.toFixed(3)}/+${s.dC.toFixed(3)})`).join(' → ') || '(none)'}\n` +
    `gate would keep value terms: ${g.keptValue.join(', ') || '(none)'}; would drop: ${g.droppedValue.join(', ') || '(none)'}\n` +
    '--- odds terms (delta = AUC gained by adding the term; keep needs >= +0.005 on BOTH protocols) ---\n' +
    g.odds.map((d) => `  ${gateLine(d, 'AUC')}`).join('\n') + '\n' +
    `odds ladder: ${g.oddsLadder.map((s) => `round ${s.round} ${s.term} (+${s.dT.toFixed(3)}/+${s.dC.toFixed(3)})`).join(' → ') || '(none)'}\n` +
    `gate would keep odds terms: ${g.keptOdds.join(', ') || '(none)'}; would drop: ${g.droppedOdds.join(', ') || '(none)'}\n` +
    '--- restored model, held-out ---\n' +
    `  value: LOO R2 ${v.looR2.toFixed(3)}, LOO Spearman ${v.looSpearman.toFixed(3)}, LOO MAPE ${(v.looMape * 100).toFixed(0)}% (plain OLS: R2 ${v.olsLooR2.toFixed(3)}, Spearman ${v.olsLooSpearman.toFixed(3)}); LOCO R2 ${v.locoR2.toFixed(3)}, LOCO Spearman ${v.locoSpearman.toFixed(3)} (n=${v.locoN})\n` +
    `  walk-forward ${v.wf.map((w) => `${w.cut} R2 ${w.r2.toFixed(2)} Sp ${w.spearman.toFixed(2)}`).join('; ')}\n` +
    `  odds: 5-fold Brier ${v.odds.brier.toFixed(3)} log-loss ${v.odds.logloss.toFixed(3)} (v2 category-share odds: Brier ${v.odds.v2Brier.toFixed(3)}, log-loss ${v.odds.v2Logloss.toFixed(3)}); top-decile odds predicted ${(v.odds.topPred * 100).toFixed(0)}% vs ${(v.odds.topObs * 100).toFixed(0)}% observed\n` +
    '--- per-kind 80% conformal intervals on implied value (from the LOO residuals) ---\n' +
    `  median absolute LOO log miss (blind range): x${iv.medianAbsLogMiss.toFixed(2)}; global 80% factor: x${iv.globalFactor.toFixed(2)}\n` +
    iv.kinds.map((k) => `  ${k.kind}: n=${k.n} factor x${k.factor.toFixed(2)}${k.fallback ? ' (thin kind — global fallback)' : ''}`).join('\n') + '\n',
  );
  process.exit(0);
}

const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

const out = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

// Report the output sizes so a too-large dossier is visible at a glance.
const sizeOf = (p: string): number => (existsSync(p) ? statSync(p).size : -1);
const boardBytes = sizeOf(join(out, 'board.json'));
const dataBytes = sizeOf(join(out, 'data.js'));
const dossierBytes = sizeOf(join(out, 'dossier.json'));

const iv = v.intervals;
const top = board[0]!;
const bottom = board[board.length - 1]!;
process.stdout.write(
  `token radar: ${radar.meta.nProtocols} protocols, ${radar.meta.nWatchlist} on the watchlist, ${board.length} rows scored (${radar.meta.nPre} pre-token, ${radar.meta.nTraded} traded set aside)\n` +
    `token radar: restored v4 Huber-robust value model fitted on ${v.nTrain} comps — LOO R2 ${v.looR2.toFixed(3)}, LOO Spearman ${v.looSpearman.toFixed(3)} (plain OLS: R2 ${v.olsLooR2.toFixed(3)}, Spearman ${v.olsLooSpearman.toFixed(3)}), LOO MAPE ${(v.looMape * 100).toFixed(0)}%; LOCO R2 ${v.locoR2.toFixed(3)}, LOCO Spearman ${v.locoSpearman.toFixed(3)} (n=${v.locoN})\n` +
    `token radar: walk-forward ${v.wf.map((w) => `${w.cut} R2 ${w.r2.toFixed(2)} Sp ${w.spearman.toFixed(2)}`).join('; ')}; odds logistic 5-fold Brier ${v.odds.brier.toFixed(3)} log-loss ${v.odds.logloss.toFixed(3)} (v2 category-share odds: Brier ${v.odds.v2Brier.toFixed(3)}, log-loss ${v.odds.v2Logloss.toFixed(3)}); top-decile odds predicted ${(v.odds.topPred * 100).toFixed(0)}% vs ${(v.odds.topObs * 100).toFixed(0)}% observed\n` +
    `token radar: 80% conformal intervals on implied value — median absolute LOO log miss x${iv.medianAbsLogMiss.toFixed(2)}, global factor x${iv.globalFactor.toFixed(2)}, per-kind factors x${Math.min(...iv.kinds.map((k) => k.factor)).toFixed(2)}–x${Math.max(...iv.kinds.map((k) => k.factor)).toFixed(2)} across ${iv.kinds.length} kinds; board range $${top.implied_value_usd.toLocaleString('en-US')} (top1/top10 ${(top.implied_value_usd / board[9]!.implied_value_usd).toFixed(2)}) down to $${bottom.implied_value_usd.toLocaleString('en-US')}\n` +
    `token radar: gate (diagnostic only): would keep value [${v.gate.keptValue.join(', ')}], would drop [${v.gate.droppedValue.join(', ') || 'none'}]; would keep odds [${v.gate.keptOdds.join(', ')}], would drop [${v.gate.droppedOdds.join(', ') || 'none'}]\n` +
    `token radar: wrote ${join(out, 'board.json')} (${boardBytes} bytes), ${join(out, 'data.js')} (${dataBytes} bytes), ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')} (${dossierBytes} bytes, cap 1572864); top picks ${radar.picks.length}, farm queue ${radar.farmQueue.length}\n`,
);
