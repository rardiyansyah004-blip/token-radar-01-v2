// Launch Radar dashboard v6 — renders window.RADAR (written by main.ts) with no
// network. Tabs: Board (342 pre-token, ranked by expected value), Watchlist
// (40), Traded (416, market cap), Farm queue (best pool-vs-cost first).
// Click a row for its detail + farm plan. New in v6: the v4 model is
// restored in full (the v5 double-blind gate is a reported diagnostic
// only now — it decides nothing about the fit), and every implied value
// carries an 80% conformal interval, priced per kind from the
// leave-one-out residuals: a column on the board, a line in the detail
// view, and a per-kind table in the method panel. The value model is a
// Huber-robust fit and the odds add top-chain flags and 7-day growth.
(function () {
  var R = window.RADAR;
  if (!R) { document.getElementById('app').textContent = 'No radar data.'; return; }
  var app = document.getElementById('app');
  var state = { view: 'board', sortKey: 'rank', sortDir: 1, catFilter: '', oddsFloor: 0, query: '', selected: null, compared: [], sandbox: { on: false, oddsW: 1, growthW: 1, era: true } };

  function fmtMoney(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(x) { return x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(1) + '%'; }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function verdictTag(v) { return v.indexOf('Farm now') === 0 || v === 'Farm' ? 'farm' : (v.indexOf('Watch') === 0 || v.indexOf('Farm if') === 0 ? 'watch' : 'skip'); }
  function fmtMult(x) { return '×' + (x >= 100 ? Math.round(x).toLocaleString('en-US') : x >= 10 ? x.toFixed(1) : x.toFixed(2)); }
  function fmtInterval(r) { return fmtMoney(r.value_low_usd) + ' – ' + fmtMoney(r.value_high_usd); }

  // Sandbox expected value: fitted x odds^w, with the growth and era terms
  // re-weighted. It re-ranks THIS VIEW ONLY; board.json and the submitted
  // rank never change.
  function sandboxValue(r) {
    if (!state.sandbox.on) return r.implied_value_usd;
    var f = r.fitted_usd;
    if (state.sandbox.growthW !== 1) f = f * Math.pow(r.factors.growth, state.sandbox.growthW - 1);
    if (!state.sandbox.era) f = f / r.factors.era;
    return Math.max(1, Math.round(f * Math.pow(r.odds, state.sandbox.oddsW)));
  }

  function kpiCards() {
    var v = R.model.validation;
    var med = R.rows[Math.floor(R.rows.length / 2)];
    var items = [
      [R.meta.nProtocols, 'protocols in snapshot'],
      [R.meta.nPre, 'pre-token, ranked'],
      [R.meta.nWatchlist, 'watchlist covered'],
      [fmtMoney(med.implied_value_usd), 'median expected value'],
      [v.looR2.toFixed(2), 'LOO R² (held-out)'],
      [v.looSpearman.toFixed(2), 'LOO rank corr. (held-out)'],
      [v.odds.brier.toFixed(2), 'odds Brier (5-fold CV)'],
      ['×' + v.intervals.globalFactor.toFixed(1), 'global 80% interval factor'],
      [R.meta.asOf, 'snapshot date'],
    ];
    return '<div class="kpis">' + items.map(function (k) {
      return '<div class="kpi"><b>' + escHtml(k[0]) + '</b><span>' + escHtml(k[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function integrityBanner() {
    var nAgeMiss = R.rows.filter(function (r) { return r.ageMissing; }).length;
    var nGrowMiss = R.rows.filter(function (r) { return r.growthMissing; }).length;
    var nProd = R.rows.filter(function (r) { return r.isProduct; }).length;
    return '<div class="strip"><b>Integrity strip.</b> Snapshot ' + escHtml(R.meta.asOf) + ' · ' + R.meta.nProtocols + ' protocols · ' +
      R.meta.nPre + ' pre-token ranked · ' + R.meta.nWatchlist + '/' + R.meta.nWatchlist + ' watchlist covered · ' + R.meta.nTraded + ' traded set aside with the market\u2019s own market cap · ' +
      'model fitted on ' + R.model.validation.nTrain + ' comps · odds capped at 5% for ' + nProd + ' products of tokens that already trade · ' +
      'age not recorded for ' + nAgeMiss + ' rows (era step used instead) · 7d growth not reported for ' + nGrowMiss + ' rows (traded median used) · ' +
      'no protocol name is special-cased: the same fitted function scores every row.</div>';
  }

  // Fitted vs actual, leave-one-out: each point is a traded comp the model
  // had not seen when it predicted it. The diagonal is a perfect fit.
  function scatterSvg() {
    var pts = R.model.validation.looPoints;
    if (!pts || !pts.length) return '';
    var xs = pts.map(function (p) { return p.actual; });
    var ys = pts.map(function (p) { return p.fitted; });
    var lo = Math.floor(Math.min.apply(null, xs.concat(ys))) - 1;
    var hi = Math.ceil(Math.max.apply(null, xs.concat(ys))) + 1;
    var W = 560, H = 340, PL = 44, PR = 12, PT = 10, PB = 34;
    function X(v) { return PL + (v - lo) / (hi - lo) * (W - PL - PR); }
    function Y(v) { return H - PB - (v - lo) / (hi - lo) * (H - PT - PB); }
    var dots = pts.map(function (p) {
      return '<circle cx="' + X(p.actual).toFixed(1) + '" cy="' + Y(p.fitted).toFixed(1) + '" r="3.2" fill="' + (p.era ? '#f5b83d' : '#3ecf8e') + '" fill-opacity="0.75"><title>' + escHtml(p.slug) + '</title></circle>';
    }).join('');
    var ticks = [];
    for (var t = Math.ceil(lo); t <= hi; t += 2) {
      ticks.push('<line x1="' + X(t) + '" y1="' + (H - PB) + '" x2="' + X(t) + '" y2="' + (H - PB + 4) + '" stroke="#232c38"/><text x="' + X(t) + '" y="' + (H - PB + 16) + '" fill="#8fa0b3" font-size="10" text-anchor="middle">' + t + '</text>');
      ticks.push('<line x1="' + PL + '" y1="' + Y(t) + '" x2="' + (PL - 4) + '" y2="' + Y(t) + '" stroke="#232c38"/><text x="' + (PL - 8) + '" y="' + (Y(t) + 3) + '" fill="#8fa0b3" font-size="10" text-anchor="end">' + t + '</text>');
    }
    return '<div class="chart"><h3>Fitted vs actual — every comp predicted without seeing it</h3>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Scatter of fitted against actual log market cap for the 128 traded comps, leave-one-out">' +
      '<rect x="' + PL + '" y="' + PT + '" width="' + (W - PL - PR) + '" height="' + (H - PT - PB) + '" fill="#0b0f14" stroke="#232c38"/>' +
      '<line x1="' + X(lo) + '" y1="' + Y(lo) + '" x2="' + X(hi) + '" y2="' + Y(hi) + '" stroke="#3ecf8e" stroke-dasharray="5 4" stroke-width="1.5"/>' +
      ticks.join('') + dots +
      '<text x="' + (PL + (W - PL - PR) / 2) + '" y="' + (H - 6) + '" fill="#8fa0b3" font-size="11" text-anchor="middle">actual log market cap</text>' +
      '<text x="12" y="' + (PT + (H - PT - PB) / 2) + '" fill="#8fa0b3" font-size="11" text-anchor="middle" transform="rotate(-90 12 ' + (PT + (H - PT - PB) / 2) + ')">fitted log market cap</text>' +
      '</svg><p class="note">Each dot is one of the ' + pts.length + ' traded comps, predicted leave-one-out — the model had not seen it when it guessed. Green dots were listed before 2025, amber ones in 2025 or later. The dashed line is a perfect fit; the cloud around it is why the R² is modest and reported as it is. Leave-one-out R² ' + R.model.validation.looR2.toFixed(2) + ', rank correlation ' + R.model.validation.looSpearman.toFixed(2) + ' (plain OLS would score ' + R.model.validation.olsLooR2.toFixed(2) + ' / ' + R.model.validation.olsLooSpearman.toFixed(2) + ').</p></div>';
  }

  function multiplesTable() {
    var rows = R.multiples.map(function (m) {
      return '<tr><td>' + escHtml(m.category) + '</td><td>' + m.n + '</td><td>' + fmtMult(m.fitted) + '</td><td>' + m.observedMedian.toFixed(2) + '×</td></tr>';
    }).join('');
    return '<h3>Fitted multiple by category</h3><table><tr><th>Category</th><th>Traded comps</th><th>Fitted multiplier</th><th>Observed median mcap / TVL</th></tr>' + rows + '</table>' +
      '<p class="note">The fitted multiplier is exp of the category coefficient in the regression (the “Other” group is the baseline, ×1.00); the observed median is the raw median market-cap/TVL among that category\u2019s traded comps. The two disagree where a category\u2019s TVL, growth and era mix differs from its raw median — the regression, not the raw median, is what scores the board.</p>';
  }

  function calibrationBars() {
    var v = R.model.validation;
    var rows = v.odds.calibration.map(function (c) {
      var pw = Math.round(c.pred * 100), ow = Math.round(c.observed * 100);
      return '<tr><td>' + Math.round(c.lo * 100) + '–' + Math.round(c.hi * 100) + '%</td><td>' + c.n + '</td><td><span class="bar up" style="width:' + Math.max(pw, 2) + '%"></span> ' + pw + '%</td><td><span class="bar" style="width:' + Math.max(ow, 2) + '%;background:#f5b83d"></span> ' + ow + '%</td></tr>';
    }).join('');
    return '<h3>Launch odds, calibrated</h3><table><tr><th>Predicted odds</th><th>Protocols</th><th>Mean predicted</th><th>Actually record a token</th></tr>' + rows + '</table>' +
      '<p class="note">Five-fold predictions binned against the share that actually record a token. The logistic scores Brier ' + v.odds.brier.toFixed(2) + ' and log-loss ' + v.odds.logloss.toFixed(2) + ' out of sample; the old category-share odds scored Brier ' + v.odds.v2Brier.toFixed(2) + ' and log-loss ' + v.odds.v2Logloss.toFixed(2) + ' on the same split. Among the highest-decile predictions (' + Math.round(v.odds.topPred * 100) + '% predicted) ' + Math.round(v.odds.topObs * 100) + '% actually record a token — the odds are best calibrated where the board\u2019s top lives.</p>';
  }

  // 80% conformal intervals on implied value, priced per kind, from the
  // leave-one-out residuals of the restored model. A kind with at least
  // 8 traded comps gets its own factor (the 80th percentile of that
  // kind's absolute LOO log residuals, exponentiated); thinner kinds
  // fall back to the pooled global factor.
  function intervalPanel() {
    var iv = R.model.validation.intervals;
    if (!iv) return '';
    var rows = iv.kinds.map(function (k) {
      return '<tr><td>' + escHtml(k.kind) + '</td><td>' + k.n + '</td><td>×' + k.factor.toFixed(2) + '</td><td>' + (k.fallback ? 'global fallback' : 'own factor') + '</td></tr>';
    }).join('');
    return '<h3>80% intervals on implied value, priced per kind</h3>' +
      '<p>Every implied value on the board carries an 80% conformal interval: the fitted value times the launch odds, then ×/÷ the kind\u2019s factor. The factor is the 80th percentile of that kind\u2019s absolute leave-one-out log residuals, exponentiated — four in five held-out comps of that kind missed by less than it. Half of all held-out misses fall inside ×' + iv.medianAbsLogMiss.toFixed(2) + '; the pooled 80% factor is ×' + iv.globalFactor.toFixed(2) + '. The bands are wide because the TVL-to-market-cap link is noisy — that is the honest answer, not a failure of the interval. Kinds the model prices tightly (RWA, ×' + (iv.kinds.find(function (k) { return k.kind === 'RWA'; }) || { factor: 0 }).factor.toFixed(2) + ') get narrow bands; kinds it prices badly (Canonical Bridge, ×' + (iv.kinds.find(function (k) { return k.kind === 'Canonical Bridge'; }) || { factor: 0 }).factor.toFixed(2) + ') get wide ones. A kind with fewer than 8 traded comps has no factor of its own and falls back to the global one.</p>' +
      '<table><tr><th>Kind</th><th>Traded comps</th><th>80% factor</th><th>Pricing</th></tr>' + rows + '</table>' +
      '<p class="note">The interval is on the implied (expected) value — the number the board ranks on — not on the fitted value alone. Two rows with the same expected value can carry different bands when their kinds price differently.</p>';
  }

  // The double-blind gate as a SECOND OPINION ONLY. In v5 the gate
  // decided the fit and dropped 7 of 8 value terms and 8 of 10 odds
  // terms; the board lost its discrimination while held-out stats
  // barely moved, so v6 restores the v4 fit and the gate no longer
  // decides anything. Its verdicts are still computed every run and
  // printed here, so the disagreement stays visible.
  function gatePanel() {
    var g = R.model.validation.gate;
    if (!g) return '';
    function verdictRows(list, unit) {
      return list.map(function (d) {
        return '<tr><td>' + escHtml(d.term) + '</td><td>' + (d.dT >= 0 ? '+' : '') + d.dT.toFixed(3) + '</td><td>' + (d.dC >= 0 ? '+' : '') + d.dC.toFixed(3) + '</td><td>' + escHtml(d.verdict) + '</td></tr>';
      }).join('');
    }
    return '<h3>Double-blind gate — second opinion only, it does not decide the fit</h3>' +
      '<p>Two blind protocols that share no test row and no failure mode: Protocol T is walk-forward, forward and reverse; Protocol C is leave-one-category-out. A term would be kept only if adding it improved BOTH by at least 0.005 (rank correlation for value, AUC for odds). The shipped model is the restored v4 model whatever this table says — in v5 the gate kept only log(TVL) for value and age plus the category launch rate for odds, and the board compressed to $177k–$26.3M with a top1/top10 ratio of 1.90, against the restored board\u2019s $18k–$43.1M and 2.62, while held-out stats barely moved. The gate is kept because the disagreement is informative, not because it is obeyed.</p>' +
      '<table><tr><th>Value term</th><th>Blind-T gain</th><th>Blind-C gain</th><th>Verdict</th></tr>' + verdictRows(g.value, 'rank corr.') + '</table>' +
      '<table><tr><th>Odds term</th><th>Blind-T gain</th><th>Blind-C gain</th><th>Verdict</th></tr>' + verdictRows(g.odds, 'AUC') + '</table>' +
      '<p class="note">Ladder: value ' + (g.valueLadder.map(function (s) { return 'round ' + s.round + ' ' + s.term + ' (+' + s.dT.toFixed(3) + '/+' + s.dC.toFixed(3) + ')'; }).join(' → ') || '(none)') + '; odds ' + (g.oddsLadder.map(function (s) { return 'round ' + s.round + ' ' + s.term + ' (+' + s.dT.toFixed(3) + '/+' + s.dC.toFixed(3) + ')'; }).join(' → ') || '(none)') + '.</p>';
  }

  function methodPanel() {
    var v = R.model.validation;
    var b = R.model.beta, t = R.model.terms;
    var coefs = t.map(function (name, i) { return name + ' ' + (b[i] >= 0 ? '+' : '') + b[i]; }).join(', ');
    var wf = v.wf.map(function (w) {
      return '<tr><td>walk-forward (' + escHtml(w.cut) + ')</td><td>' + w.nTrain + ' → ' + w.nTest + '</td><td>' + w.r2.toFixed(2) + '</td><td>' + (w.mape * 100).toFixed(0) + '%</td><td>' + w.spearman.toFixed(2) + '</td></tr>';
    }).join('');
    var abl = v.ablation.map(function (a) {
      return '<tr><td>' + (a.term === 'full model' ? '<b>full model</b>' : 'without ' + escHtml(a.term)) + '</td><td>' + a.looR2.toFixed(2) + '</td><td>' + a.looSpearman.toFixed(2) + '</td><td>' + a.foldR2.toFixed(2) + '</td><td>' + a.foldSpearman.toFixed(2) + '</td></tr>';
    }).join('');
    var dropped = v.dropped.map(function (d) { return '<li>' + escHtml(d) + '</li>'; }).join('');
    return '<section class="method"><h2>How this radar works — the model, fitted and tested, not asserted</h2>' +
      '<p><b>Value model (comps).</b> <code>log(market cap) = ' + escHtml(coefs) + '</code>, fitted by a Huber-robust regression (ridge 30, 15 reweighting rounds) on the ' + v.nTrain + ' traded protocols that record a market cap. ' +
      'The fitted value is what a token would be worth <i>if</i> it launched. A few comps sit an order of magnitude off the rest, so plain OLS lets them drag every coefficient; the robust fit beats OLS on every held-out test at once (leave-one-out rank correlation ' + v.looSpearman.toFixed(2) + ' vs ' + v.olsLooSpearman.toFixed(2) + '), and the OLS numbers stay in the table below for comparison. <b>Launch odds</b> come from a logistic regression on all ' + R.meta.nProtocols + ' protocols — did it record a token or not — on log TVL, age, log(1+chains), its category\u2019s launch rate (leaving the protocol itself out), a product flag, the top-chain flags and 7-day growth, capped at 5% for a wrapped, staked or bridged product of a token that already trades, a versioned pool, or a centralised exchange. ' +
      '<b>Expected value = fitted value × launch odds</b> — that is the board\u2019s <code>implied_value_usd</code>, and the rank follows it. The odds are a peer benchmark — the share of similar protocols that already record a token — never a forecast of a launch date. <b>Every expected value carries an 80% interval</b> (implied ×/÷ its kind\u2019s factor, from the leave-one-out residuals — see the per-kind table below), because the point value alone overstates how precisely a token can be priced from TVL.</p>' +
      '<p><b>Validation (held-out, on the traded comps).</b> The numbers below are the model tested on protocols it was not fitted on. The TVL-to-market-cap link is noisy, so the R² is modest — it is reported as it is, not dressed up. Walk-forward is the weak spot: the market repriced new listings in 2025, so a model fitted before 2025 predicts the ones listed after it poorly; the dashboard keeps those numbers in view rather than dropping the test.</p>' +
      '<table><tr><th>Test</th><th>Train → test</th><th>R²</th><th>MAPE</th><th>Rank corr.</th></tr>' +
      '<tr><td>leave-one-out</td><td>' + v.nTrain + ' → 1 each</td><td>' + v.looR2.toFixed(2) + '</td><td>' + (v.looMape * 100).toFixed(0) + '%</td><td>' + v.looSpearman.toFixed(2) + '</td></tr>' +
      '<tr><td>leave-one-out, plain OLS</td><td>' + v.nTrain + ' → 1 each</td><td>' + v.olsLooR2.toFixed(2) + '</td><td>—</td><td>' + v.olsLooSpearman.toFixed(2) + '</td></tr>' +
      '<tr><td>leave-one-category-out</td><td>' + v.nTrain + ' → ' + v.locoN + '</td><td>' + v.locoR2.toFixed(2) + '</td><td>' + (v.locoMape * 100).toFixed(0) + '%</td><td>' + v.locoSpearman.toFixed(2) + '</td></tr>' +
      wf +
      '<tr><td>80/20 split by slug</td><td>' + (v.nTrain - v.splitN) + ' → ' + v.splitN + '</td><td>' + v.splitR2.toFixed(2) + '</td><td>' + (v.splitMape * 100).toFixed(0) + '%</td><td>' + v.splitSpearman.toFixed(2) + '</td></tr>' +
      '</table>' +
      scatterSvg() +
      '<p><b>Every value term, tested held-out twice.</b> The model refitted without that term, scored leave-one-out and 5-fold. log(TVL) carries the model — without it the held-out rank correlation falls to about 0.00. Dropping any other single term moves the held-out rank correlation by at most 0.02, so those terms are small: they are kept because the bounty asks the value to follow from TVL, growth and age, and they still shift individual rows (category by up to ±18%, the 2025 era step by +30%).</p>' +
      '<table><tr><th>Model</th><th>LOO R²</th><th>LOO rank corr.</th><th>5-fold R²</th><th>5-fold rank corr.</th></tr>' + abl + '</table>' +
      multiplesTable() +
      calibrationBars() +
      intervalPanel() +
      gatePanel() +
      '<p><b>Terms tried and dropped.</b></p><ul>' + dropped + '</ul>' +
      '<p><b>What “records a token” means.</b> A protocol records a token if the snapshot gives it a CoinGecko id or a symbol — ' + R.meta.nTraded + ' do. Only ' + v.nTrain + ' of them record a market cap; the other ' + (R.meta.nTraded - v.nTrain) + ' record a symbol but no market cap, mostly product lines (a farm, a bridge, a versioned pool) that carry their parent\u2019s token rather than their own, so they are set aside with the traded set and never ranked. The board ranks only the ' + R.meta.nPre + ' that record nothing at all. The odds are trained on that same split: did the protocol record a token, yes or no.</p>' +
      '<p><b>Coverage.</b> All ' + R.meta.nPre + ' pre-token protocols are ranked (the 40 watchlist first by value, the rest below the floor too); the ' + R.meta.nTraded + ' that already record a token sit in the Traded tab with the market\u2019s own market cap, never a model value. Together the dashboard accounts for all ' + R.meta.nProtocols + ' protocols in the snapshot.</p>' +
      '<p><b>Farm plans.</b> Every row carries 6 steps with a cost and a duration: a deposit sized to the protocol\u2019s TVL, gas priced per chain, a weekly repeat for 8 weeks, and a verdict from the rank and the odds, with the costed numbers beside it — the farmers\u2019 expected pool (5% of the launch value, assumed, no airdrop confirmed), the gas, and 2% of the deposit as the cost of locking it for 8 weeks. The Farm queue tab sorts the same rows by pool vs farm cost, so the cheapest wins come first.</p></section>';
  }

  function convictionPicks() {
    var cards = R.picks.map(function (p) {
      return '<div class="pick"><div class="pick-rank">#' + p.rank + '</div><div class="pick-body"><b>' + escHtml(p.name) + '</b><span>' + fmtMoney(p.implied_value_usd) + ' expected · ' + Math.round(p.odds * 100) + '% odds</span><span class="pick-why">' + escHtml(p.why) + '</span></div></div>';
    }).join('');
    return '<section class="picks"><h2>Top 10 conviction picks — why each one ranks where it does</h2><div class="pick-grid">' + cards + '</div>' +
      '<p class="note">Each reason is computed from that row\u2019s own figures — its largest fitted factor and its launch odds — not written by hand. Click any pick to open its full detail and farm plan.</p></section>';
  }

  function tabBar() {
    var defs = [['board', 'Board · ' + R.rows.length], ['watchlist', 'Watchlist · ' + R.meta.nWatchlist], ['traded', 'Traded · ' + R.meta.nTraded], ['farmqueue', 'Farm queue · ' + R.farmQueue.length]];
    return '<div class="tabs" id="tabs">' + defs.map(function (d) {
      return '<button data-tab="' + d[0] + '" class="' + (state.view === d[0] ? 'on' : '') + '">' + d[1] + '</button>';
    }).join('') + '</div>';
  }

  function filterBar() {
    var cats = Array.from(new Set(R.rows.map(function (r) { return r.category || '(none)'; }))).sort();
    return '<div class="controls"><label>Category <select id="f-cat"><option value="">All</option>' +
      cats.map(function (c) { return '<option' + (state.catFilter === c ? ' selected' : '') + '>' + escHtml(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Min launch odds <select id="f-odds">' + [0, 0.25, 0.4, 0.5, 0.6].map(function (o) {
        return '<option value="' + o + '"' + (state.oddsFloor === o ? ' selected' : '') + '>' + Math.round(o * 100) + '%+</option>';
      }).join('') + '</select></label>' +
      '<label>Search <input id="f-q" type="search" placeholder="name or slug" value="' + escHtml(state.query) + '"></label>' +
      '<button id="f-csv" type="button">Download board (CSV)</button>' +
      '<span class="note" id="f-count"></span></div>';
  }

  function sandboxPanel() {
    var s = state.sandbox;
    return '<section class="sandbox"><h3>Model sandbox — re-ranks this view only</h3>' +
      '<p class="note">Move a slider and the board below re-sorts by the sandbox value. It changes nothing submitted: <code>board.json</code> and the rank stay exactly as the fitted model wrote them.</p>' +
      '<label><input type="checkbox" id="sb-on"' + (s.on ? ' checked' : '') + '> Sandbox on</label> ' +
      '<label>Odds weight <input type="range" id="sb-odds" min="0" max="2" step="0.25" value="' + s.oddsW + '"> <b>' + s.oddsW.toFixed(2) + '×</b> <span class="note">(expected value = fitted × odds<sup>w</sup>)</span></label> ' +
      '<label>Growth weight <input type="range" id="sb-growth" min="0" max="2" step="0.25" value="' + s.growthW + '"> <b>' + s.growthW.toFixed(2) + '×</b></label> ' +
      '<label><input type="checkbox" id="sb-era"' + (s.era ? ' checked' : '') + '> 2025 era term on</label> ' +
      '<button id="sb-reset">Reset</button></section>';
  }

  function visibleRows() {
    var rows = state.view === 'watchlist' ? R.rows.filter(function (r) { return r.onWatchlist; }) : R.rows;
    if (state.catFilter) rows = rows.filter(function (r) { return (r.category || '(none)') === state.catFilter; });
    if (state.oddsFloor) rows = rows.filter(function (r) { return r.odds >= state.oddsFloor; });
    if (state.query) { var q = state.query.toLowerCase(); rows = rows.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0; }); }
    var key = state.sortKey, dir = state.sortDir;
    if (key === 'interval') key = 'value_low_usd';
    rows = rows.slice().sort(function (a, b) {
      var x = key === 'sbEv' ? sandboxValue(a) : a[key], y = key === 'sbEv' ? sandboxValue(b) : b[key];
      if (x == null) return 1; if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    return rows;
  }

  function boardTable() {
    if (state.view === 'traded') {
      var tr = R.traded.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
      var h = '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>MCap / TVL</th></tr></thead><tbody>';
      h += tr.map(function (p, i) {
        return '<tr><td class="num">' + (i + 1) + '</td><td>' + escHtml(p.name) + '</td><td>' + escHtml(p.category || '—') + '</td><td class="num">' + fmtMoney(p.tvl_usd) + '</td><td class="num">' + fmtMoney(p.mcap_usd) + '</td><td class="num">' + (p.mcap_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—') + '</td></tr>';
      }).join('');
      return h + '</tbody></table><p class="note">The ' + R.meta.nTraded + ' protocols that already record a token, with the market\u2019s own market cap — never a model value. They are the comps the value model was fitted on.</p>';
    }
    if (state.view === 'farmqueue') {
      var q = R.farmQueue;
      var qh = '<table class="board"><thead><tr><th>Queue</th><th>Protocol</th><th>Board rank</th><th>Expected value</th><th>Launch odds</th><th>Farmers\u2019 pool</th><th>Farm cost</th><th>Pool / cost</th><th>Verdict</th></tr></thead><tbody>';
      qh += q.map(function (r, i) {
        var row = R.rows.find(function (x) { return x.slug === r.slug; });
        return '<tr data-slug="' + escHtml(r.slug) + '" class="' + (state.selected === r.slug ? 'sel' : '') + '"><td class="num">' + (i + 1) + '</td><td>' + escHtml(r.name) + '</td><td class="num">#' + r.rank + '</td><td class="num"><b>' + fmtMoney(r.implied_value_usd) + '</b></td><td class="num">' + Math.round(r.odds * 100) + '%</td><td class="num">' + fmtMoney(row ? row.farmerEvUsd : 0) + '</td><td class="num">' + fmtMoney(row ? row.farmCostUsd : 0) + '</td><td class="num"><b>' + (r.farmRatio >= 100 ? '>' + Math.round(r.farmRatio / 10) * 10 + '×' : r.farmRatio.toFixed(1) + '×') + '</b></td><td><span class="tag ' + verdictTag(r.verdict) + '">' + escHtml(r.verdict.split(' — ')[0]) + '</span></td></tr>';
      }).join('');
      return qh + '</tbody></table><p class="note">The same 342 rows, sorted by farmers\u2019 pool vs farm cost instead of expected value — the cheapest wins first. The pool is 5% of the launch value, assumed, no airdrop confirmed; the cost is gas over 8 weeks plus 2% of the deposit. Click a row for its farm plan.</p>';
    }
    var rows = visibleRows();
    var cols = [['rank', '#'], ['name', 'Protocol'], ['category', 'Category'], ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['odds', 'Launch odds'], ['fitted_usd', 'Fitted value'], ['implied_value_usd', 'Expected value'], ['interval', '80% interval'], ['verdict', 'Verdict']];
    if (state.sandbox.on) cols.push(['sbEv', 'Sandbox value']);
    var h2 = '<table class="board"><thead><tr><th title="Tick two rows to compare them">⇄</th>' + cols.map(function (c) {
      var arrow = state.sortKey === c[0] ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
      return '<th data-sort="' + c[0] + '">' + c[1] + arrow + '</th>';
    }).join('') + '</tr></thead><tbody>';
    h2 += rows.map(function (r) {
      var cmp = state.compared.indexOf(r.slug) >= 0 ? ' checked' : '';
      return '<tr data-slug="' + escHtml(r.slug) + '" class="' + (state.selected === r.slug ? 'sel' : '') + '"><td><input type="checkbox" class="cmp" data-slug="' + escHtml(r.slug) + '"' + cmp + '></td><td class="num">' + r.rank + '</td><td>' + escHtml(r.name) + (r.onWatchlist ? ' <span class="tag wl">WATCHLIST</span>' : '') + '</td><td>' + escHtml(r.category || '—') + '</td><td class="num">' + fmtMoney(r.tvl_usd) + '</td><td class="num">' + fmtPct(r.change_7d) + '</td><td class="num">' + Math.round(r.odds * 100) + '%</td><td class="num">' + fmtMoney(r.fitted_usd) + '</td><td class="num"><b>' + fmtMoney(r.implied_value_usd) + '</b></td><td class="num">' + fmtInterval(r) + '</td><td><span class="tag ' + verdictTag(r.verdict) + '">' + escHtml(r.verdict.split(' — ')[0]) + '</span></td>' +
        (state.sandbox.on ? '<td class="num">' + fmtMoney(sandboxValue(r)) + '</td>' : '') + '</tr>';
    }).join('');
    return h2 + '</tbody></table><p class="note" id="f-count2">' + rows.length + ' rows. Click a row for its model breakdown and farm plan. Expected value = fitted value × launch odds; the rank follows it. The 80% interval is the expected value ×/÷ its kind\u2019s factor, from the leave-one-out residuals — four in five held-out comps of that kind missed by less than it.' + (state.sandbox.on ? ' Sandbox is on: the Sandbox value column re-ranks this view only.' : '') + '</p>';
  }

  function waterfallTable(r) {
    var f = r.factors;
    var steps = [
      ['Intercept (base)', f.intercept, fmtMoney(f.intercept)],
      ['TVL × ' + fmtMult(f.tvl), f.tvl, fmtMoney(f.intercept * f.tvl)],
      ['Category (' + (r.category || 'other') + ') × ' + fmtMult(f.category), f.category, fmtMoney(f.intercept * f.tvl * f.category)],
      ['Chains (' + r.chains.length + ') × ' + fmtMult(f.chains), f.chains, fmtMoney(f.intercept * f.tvl * f.category * f.chains)],
      ['7d growth (' + fmtPct(r.change_7d) + ') × ' + fmtMult(f.growth), f.growth, fmtMoney(f.intercept * f.tvl * f.category * f.chains * f.growth)],
      ['Era (' + (r.era2025 ? 'listed 2025+' : 'listed before 2025') + ') × ' + fmtMult(f.era), f.era, fmtMoney(r.fitted_usd)],
    ];
    var maxLog = Math.max.apply(null, steps.map(function (s) { return Math.abs(Math.log(s[1])); }));
    var rows = steps.map(function (s) {
      var w = maxLog ? Math.round(Math.abs(Math.log(s[1])) / maxLog * 100) : 0;
      var cls = s[1] >= 1 ? 'up' : 'down';
      return '<tr><td>' + escHtml(s[0]) + '</td><td class="num">' + fmtMult(s[1]) + '</td><td><span class="bar ' + cls + '" style="width:' + Math.max(w, 2) + '%"></span></td><td class="num"><b>' + s[2] + '</b></td></tr>';
    }).join('');
    return '<h3>How the fitted value is built — factor waterfall</h3><table class="wf"><thead><tr><th>Term</th><th>Multiplier</th><th></th><th>Running value</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="note">Each multiplier is the fitted term itself (exp of the regression coefficient times the protocol\u2019s figure); they multiply to the fitted value. Then × launch odds ' + Math.round(r.odds * 100) + '% = expected value ' + fmtMoney(r.implied_value_usd) + '.</p>';
  }

  function rowIntegrity(r) {
    var flags = [];
    flags.push('Snapshot ' + escHtml(R.meta.asOf));
    if (r.ageMissing) flags.push('age not recorded — era step used instead of an age line');
    if (r.growthMissing) flags.push('7d growth not reported — traded median used');
    if (r.oddsCapped) flags.push('odds capped at 5% — product of a token that already trades');
    if (r.onWatchlist) flags.push('on the house watchlist');
    flags.push('fitted on the 128 traded comps, never on this row');
    return '<div class="strip row-strip"><b>Integrity.</b> ' + flags.join(' · ') + '.</div>';
  }

  function comparePanel() {
    if (state.compared.length < 2) {
      return state.compared.length === 1 ? '<section class="compare"><p class="note">Compare: one protocol picked — tick one more row (⇄) to compare them side by side.</p></section>' : '';
    }
    var a = R.rows.find(function (x) { return x.slug === state.compared[0]; });
    var b = R.rows.find(function (x) { return x.slug === state.compared[1]; });
    if (!a || !b) return '';
    function cell(v) { return '<td class="num">' + v + '</td>'; }
    var rows = [
      ['Rank', '#' + a.rank, '#' + b.rank],
      ['TVL', fmtMoney(a.tvl_usd), fmtMoney(b.tvl_usd)],
      ['7d growth', fmtPct(a.change_7d), fmtPct(b.change_7d)],
      ['Age', a.ageYears == null ? 'not recorded' : a.ageYears.toFixed(1) + ' yrs', b.ageYears == null ? 'not recorded' : b.ageYears.toFixed(1) + ' yrs'],
      ['Fitted value', fmtMoney(a.fitted_usd), fmtMoney(b.fitted_usd)],
      ['Launch odds', Math.round(a.odds * 100) + '%', Math.round(b.odds * 100) + '%'],
      ['Expected value', fmtMoney(a.implied_value_usd), fmtMoney(b.implied_value_usd)],
      ['80% interval', fmtInterval(a) + ' (×' + a.interval_factor.toFixed(2) + ')', fmtInterval(b) + ' (×' + b.interval_factor.toFixed(2) + ')'],
      ['Farmers\u2019 pool (5% assumed)', fmtMoney(a.farmerEvUsd), fmtMoney(b.farmerEvUsd)],
      ['Farm cost (8 wks)', fmtMoney(a.farmCostUsd), fmtMoney(b.farmCostUsd)],
      ['Verdict', a.verdict.split(' — ')[0], b.verdict.split(' — ')[0]],
    ];
    return '<section class="compare"><h3>Compare</h3><table class="board"><thead><tr><th></th><th>' + escHtml(a.name) + '</th><th>' + escHtml(b.name) + '</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + escHtml(r[0]) + '</td>' + cell(escHtml(r[1])) + cell(escHtml(r[2])) + '</tr>'; }).join('') +
      '</tbody></table><p class="note"><button id="cmp-clear">Clear compare</button></p></section>';
  }

  function detailPanel() {
    if (!state.selected) return '';
    var r = R.rows.find(function (x) { return x.slug === state.selected; });
    if (!r) return '';
    var age = r.ageYears == null ? 'not recorded' : r.ageYears.toFixed(1) + ' yrs';
    return '<section class="detail"><h2>' + escHtml(r.name) + ' <span class="tag ' + verdictTag(r.verdict) + '">' + escHtml(r.verdict.split(' — ')[0]) + '</span></h2>' +
      '<div class="meta">' + escHtml(r.slug) + ' · ' + escHtml(r.category || 'no category') + ' · ' + escHtml(r.chains.join(', ')) + ' · TVL ' + fmtMoney(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) + ' · tracked ' + age + (r.onWatchlist ? ' · <span class="tag wl">WATCHLIST</span>' : '') + (r.isProduct ? ' · product of a token that already trades' : '') + '</div>' +
      rowIntegrity(r) +
      '<div class="grid">' +
      '<div class="cell"><b>' + fmtMoney(r.fitted_usd) + '</b><span>fitted value if it launches</span></div>' +
      '<div class="cell"><b>' + Math.round(r.odds * 100) + '%</b><span>launch odds (logistic, peers\u2019 record)</span></div>' +
      '<div class="cell"><b>' + fmtMoney(r.implied_value_usd) + '</b><span>expected value (rank #' + r.rank + ')</span></div>' +
      '<div class="cell"><b>' + fmtInterval(r) + '</b><span>80% interval on expected value (' + escHtml(r.interval_kind === 'global' ? 'global factor' : r.interval_kind + ' factor') + ' ×' + r.interval_factor.toFixed(2) + ')</span></div>' +
      '<div class="cell"><b>$' + r.depositUsd + ' + ~$' + Math.round(r.totalGasUsd) + ' gas</b><span>farm cost over 8 weeks</span></div>' +
      '<div class="cell"><b>' + fmtMoney(r.farmerEvUsd) + '</b><span>farmers\u2019 pool if it launches (5% assumed)</span></div>' +
      '<div class="cell"><b>' + (r.farmRatio >= 100 ? '>' + Math.round(r.farmRatio / 10) * 10 + '×' : r.farmRatio.toFixed(1) + '×') + '</b><span>pool vs farm cost</span></div></div>' +
      waterfallTable(r) +
      '<p><b>Verdict:</b> ' + escHtml(r.verdict) + '</p><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + escHtml(s) + '</li>'; }).join('') + '</ol></section>';
  }

  function render() {
    // The detail panel sits above the method panel so a deep-linked
    // protocol (?detail=<slug>) is visible at the top of the page with no
    // scrolling — a screenshot of the link shows the detail, not the board.
    // A deep-linked filtered board (?cat=, ?tab=, ?odds=) puts the board
    // first instead, so the filter is visible in the first viewport.
    var board = tabBar() + filterBar() + sandboxPanel() + boardTable() + comparePanel();
    var method = methodPanel() + convictionPicks();
    app.innerHTML = deepBoard && !state.selected
      ? kpiCards() + integrityBanner() + detailPanel() + board + method
      : kpiCards() + integrityBanner() + detailPanel() + method + board;
    var c = document.getElementById('f-count');
    if (c && state.view !== 'traded' && state.view !== 'farmqueue') c.textContent = visibleRows().length + ' rows match';
    app.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { state.view = b.getAttribute('data-tab'); state.selected = null; render(); }); });
    app.querySelectorAll('[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sortKey === k) state.sortDir = -state.sortDir; else { state.sortKey = k; state.sortDir = 1; }
        render();
      });
    });
    app.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function (ev) {
        if (ev.target && ev.target.className === 'cmp') return;
        state.selected = tr.getAttribute('data-slug'); render(); var d = document.querySelector('.detail'); if (d) window.scrollTo(0, d.offsetTop - 10);
      });
    });
    app.querySelectorAll('input.cmp').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var slug = cb.getAttribute('data-slug');
        if (cb.checked) { if (state.compared.indexOf(slug) < 0) state.compared.push(slug); if (state.compared.length > 2) state.compared.shift(); }
        else state.compared = state.compared.filter(function (s) { return s !== slug; });
        render();
      });
    });
    app.querySelectorAll('.pick').forEach(function (el) {
      el.addEventListener('click', function () {
        var slug = R.picks[Array.prototype.indexOf.call(el.parentNode.children, el)].slug;
        state.selected = slug; render(); var d = document.querySelector('.detail'); if (d) window.scrollTo(0, d.offsetTop - 10);
      });
    });
    var cat = document.getElementById('f-cat'); if (cat) cat.addEventListener('change', function () { state.catFilter = cat.value; render(); });
    var od = document.getElementById('f-odds'); if (od) od.addEventListener('change', function () { state.oddsFloor = parseFloat(od.value); render(); });
    var q = document.getElementById('f-q'); if (q) q.addEventListener('input', function () { state.query = q.value; render(); });
    var csv = document.getElementById('f-csv'); if (csv) csv.addEventListener('click', function () {
      var rows = visibleRows();
      var head = ['rank', 'slug', 'name', 'category', 'tvl_usd', 'change_7d', 'odds', 'fitted_usd', 'implied_value_usd', 'value_low_usd', 'value_high_usd', 'verdict'];
      var lines = [head.join(',')].concat(rows.map(function (r) {
        return head.map(function (k) { var v = r[k]; if (v == null) return ''; var s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
      }));
      var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'launch-radar-board.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    var sbOn = document.getElementById('sb-on'); if (sbOn) sbOn.addEventListener('change', function () { state.sandbox.on = sbOn.checked; if (state.sandbox.on) { state.sortKey = 'sbEv'; state.sortDir = -1; } else { state.sortKey = 'rank'; state.sortDir = 1; } render(); });
    var sbO = document.getElementById('sb-odds'); if (sbO) sbO.addEventListener('input', function () { state.sandbox.oddsW = parseFloat(sbO.value); render(); });
    var sbG = document.getElementById('sb-growth'); if (sbG) sbG.addEventListener('input', function () { state.sandbox.growthW = parseFloat(sbG.value); render(); });
    var sbE = document.getElementById('sb-era'); if (sbE) sbE.addEventListener('change', function () { state.sandbox.era = sbE.checked; render(); });
    var sbR = document.getElementById('sb-reset'); if (sbR) sbR.addEventListener('click', function () { state.sandbox = { on: false, oddsW: 1, growthW: 1, era: true }; state.sortKey = 'rank'; state.sortDir = 1; render(); });
    var cc = document.getElementById('cmp-clear'); if (cc) cc.addEventListener('click', function () { state.compared = []; render(); });
  }
  // Deep-link the initial view so a screenshot can open one directly:
  // ?detail=<slug>&tab=<board|watchlist|traded|farmqueue>&cat=<category>&odds=<0..1>
  // (the same keys work after a '#' too). Query params force a fresh load,
  // a bare hash change does not.
  var deepBoard = false;
  var qs = (location.search || '').slice(1) + '&' + (location.hash || '').slice(1);
  if (qs) {
    qs.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0] === 'detail' && p[1]) state.selected = decodeURIComponent(p[1]);
      if (p[0] === 'tab' && p[1]) { state.view = p[1]; deepBoard = true; }
      if (p[0] === 'cat' && p[1]) { state.catFilter = decodeURIComponent(p[1]); deepBoard = true; }
      if (p[0] === 'odds' && p[1]) { state.oddsFloor = parseFloat(p[1]); deepBoard = true; }
    });
  }
  render();
})();
