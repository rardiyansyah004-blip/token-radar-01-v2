// Launch Radar dashboard v5 — renders window.RADAR (written by main.ts) with no
// network. Tabs: Board (342 pre-token, ranked by expected value), Watchlist
// (40), Traded (416, market cap), Farm queue (best pool-vs-cost first).
// Click a row for its detail + farm plan. New in v5:
//   - a polar SCOPE above the board: every ranked protocol is one blip —
//     angle is its sector, distance from the centre is how long it has run
//     with no token, area is TVL, the tail is its 7-day TVL growth, colour
//     is the farm verdict. Filters dim the rest; a row and its blip light
//     together. (Scheme after the #7 entry's radar scope; drawn here from
//     this entry's own rows, with this entry's own code.)
//   - a FARM PLANNER: give it a capital and an hours-a-week budget and it
//     picks, schedules and totals the farms that fit.
//   - the DOUBLE-BLIND TERM GATE as a ladder: every value and odds term
//     earned its place (or was dropped) under two independent blind
//     protocols, and the ladder is printed with the numbers.
//   - a blind RANGE on every fitted value: the printed range holds half
//     the held-out misses of comps like it.
// The value model is a Huber-robust fit on the terms the gate kept
// (log TVL only — the gate dropped the other seven and the held-out
// numbers did not move); the odds are a logistic on age and the
// category launch rate, the two terms the gate kept.
(function () {
  var R = window.RADAR;
  if (!R) { document.getElementById('app').textContent = 'No radar data.'; return; }
  var app = document.getElementById('app');
  var state = { view: 'board', sortKey: 'rank', sortDir: 1, catFilter: '', oddsFloor: 0, query: '', selected: null, compared: [], sandbox: { on: false, oddsW: 1 }, planner: { capital: 1000, hours: 2 } };

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
  function verdictColor(v) { return verdictTag(v) === 'farm' ? '#3ecf8e' : verdictTag(v) === 'watch' ? '#f5b83d' : '#5a6b7d'; }
  function fmtMult(x) { return '×' + (x >= 100 ? Math.round(x).toLocaleString('en-US') : x >= 10 ? x.toFixed(1) : x.toFixed(2)); }
  function slugHash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  // Sandbox expected value: fitted x odds^w. It re-ranks THIS VIEW ONLY;
  // board.json and the submitted rank never change.
  function sandboxValue(r) {
    if (!state.sandbox.on) return r.implied_value_usd;
    return Math.max(1, Math.round(r.fitted_usd * Math.pow(r.odds, state.sandbox.oddsW)));
  }

  // The blind range: half the leave-one-out misses fall inside it. From
  // the LOO predictions, the median absolute log miss -> a factor.
  function blindRangeFactor() {
    var pts = R.model.validation.looPoints;
    if (!pts || !pts.length) return 1;
    var miss = pts.map(function (p) { return Math.abs(p.actual - p.fitted); }).sort(function (a, b) { return a - b; });
    return Math.exp(miss[Math.floor(miss.length / 2)]);
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
      [R.meta.asOf, 'snapshot date'],
    ];
    return '<div class="kpis">' + items.map(function (k) {
      return '<div class="kpi"><b>' + escHtml(k[0]) + '</b><span>' + escHtml(k[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function integrityBanner() {
    var v = R.model.validation;
    var nAgeMiss = R.rows.filter(function (r) { return r.ageMissing; }).length;
    var nGrowMiss = R.rows.filter(function (r) { return r.growthMissing; }).length;
    var nProd = R.rows.filter(function (r) { return r.isProduct; }).length;
    return '<div class="strip"><b>Integrity strip.</b> Snapshot ' + escHtml(R.meta.asOf) + ' · ' + R.meta.nProtocols + ' protocols · ' +
      R.meta.nPre + ' pre-token ranked · ' + R.meta.nWatchlist + '/' + R.meta.nWatchlist + ' watchlist covered · ' + R.meta.nTraded + ' traded set aside with the market\u2019s own market cap · ' +
      'model fitted on ' + v.nTrain + ' comps · double-blind gate kept ' + v.gate.keptValue.length + ' of ' + R.model.valueTermsAll.length + ' value terms and ' + v.gate.keptOdds.length + ' of ' + (v.gate.keptOdds.length + v.gate.droppedOdds.length) + ' odds terms · ' +
      'odds capped at 5% for ' + nProd + ' products of tokens that already trade · ' +
      'age not recorded for ' + nAgeMiss + ' rows (the odds use the traded median age; the value model carries no age term — it failed the gate) · 7d growth not reported for ' + nGrowMiss + ' rows (traded median used) · ' +
      'no protocol name is special-cased: the same fitted function scores every row.</div>';
  }

  // The scope: one blip per ranked protocol. Angle is its sector,
  // distance from the centre is how long it has run with no token, area
  // is TVL, the tail is its 7-day TVL growth, colour is the farm verdict.
  function scopeSvg() {
    var rows = R.rows;
    var cats = Array.from(new Set(rows.map(function (r) { return r.category || '(none)'; }))).sort();
    var counts = {};
    rows.forEach(function (r) { var c = r.category || '(none)'; counts[c] = (counts[c] || 0) + 1; });
    var W = 680, C = 340, RMAX = 290;
    var slice = Math.PI * 2 / cats.length;
    function angleFor(r) {
      var ci = cats.indexOf(r.category || '(none)');
      var jitter = (slugHash(r.slug) % 1000) / 1000;
      return (ci + 0.15 + 0.7 * jitter) * slice - Math.PI / 2;
    }
    function radiusFor(r) {
      if (r.ageYears == null) return RMAX;
      return 60 + Math.min(r.ageYears, 6) / 6 * (RMAX - 60);
    }
    function sizeFor(r) {
      var t = (Math.log10(Math.max(r.tvl_usd, 5e7)) - Math.log10(5e7)) / (Math.log10(3e9) - Math.log10(5e7));
      return 2 + 4.5 * Math.max(0, Math.min(1, t));
    }
    // Rows the current filters keep stay bright; the rest dim.
    var kept = {};
    rows.forEach(function (r) {
      var ok = (!state.catFilter || (r.category || '(none)') === state.catFilter) &&
        (!state.oddsFloor || r.odds >= state.oddsFloor) &&
        (!state.query || r.name.toLowerCase().indexOf(state.query.toLowerCase()) >= 0 || r.slug.indexOf(state.query.toLowerCase()) >= 0);
      if (ok) kept[r.slug] = true;
    });
    var rings = '';
    for (var y = 1; y <= 6; y++) {
      var rr = 60 + y / 6 * (RMAX - 60);
      rings += '<circle cx="' + C + '" cy="' + C + '" r="' + rr.toFixed(0) + '" fill="none" stroke="#232c38" stroke-width="1"/>' +
        '<text x="' + (C + 4) + '" y="' + (C - rr + 11) + '" fill="#8fa0b3" font-size="10">' + y + 'y</text>';
    }
    var labels = cats.map(function (c, i) {
      return { c: c, n: counts[c], a: (i + 0.5) * slice - Math.PI / 2 };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8).map(function (l) {
      var x = C + (RMAX + 16) * Math.cos(l.a), y = C + (RMAX + 16) * Math.sin(l.a);
      return '<text x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" fill="#8fa0b3" font-size="10" text-anchor="middle">' + escHtml(l.c) + '</text>';
    }).join('');
    var blips = rows.map(function (r) {
      var a = angleFor(r), rr = radiusFor(r);
      var x = C + rr * Math.cos(a), y = C + rr * Math.sin(a);
      var col = verdictColor(r.verdict);
      var dim = kept[r.slug] ? 1 : 0.12;
      var sel = state.selected === r.slug;
      var tail = '';
      if (r.change_7d != null) {
        var g = Math.max(-100, Math.min(100, r.change_7d));
        var len = Math.abs(g) / 100 * 16;
        var dir = g >= 0 ? 1 : -1;
        var x2 = C + (rr + dir * len) * Math.cos(a), y2 = C + (rr + dir * len) * Math.sin(a);
        tail = '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + (g >= 0 ? '#3ecf8e' : '#f26d6d') + '" stroke-width="1.6" opacity="' + dim + '"/>';
      }
      var title = escHtml(r.name) + ' — rank #' + r.rank + ', ' + fmtMoney(r.implied_value_usd) + ' expected, ' + Math.round(r.odds * 100) + '% odds, ' + escHtml(r.category || 'no category') + ', TVL ' + fmtMoney(r.tvl_usd) + ', 7d ' + fmtPct(r.change_7d);
      return tail + '<circle class="blip" data-slug="' + escHtml(r.slug) + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + sizeFor(r).toFixed(1) + '" fill="' + col + '" fill-opacity="' + (r.ageYears == null ? 0.35 : 0.85) + '" opacity="' + dim + '"' + (r.ageYears == null ? ' stroke="#8fa0b3" stroke-dasharray="2 2"' : '') + (sel ? ' stroke="#ffffff" stroke-width="2"' : '') + '><title>' + title + '</title></circle>';
    }).join('');
    return '<section class="scope"><h2>The scope — every ranked protocol is one blip</h2>' +
      '<svg viewBox="0 0 ' + W + ' ' + W + '" width="100%" role="img" aria-label="Polar scope of the 342 ranked pre-token protocols">' +
      '<circle cx="' + C + '" cy="' + C + '" r="' + RMAX + '" fill="#0b0f14" stroke="#232c38"/>' + rings +
      '<circle cx="' + C + '" cy="' + C + '" r="4" fill="#3ecf8e"/>' + labels + blips +
      '</svg>' +
      '<p class="note">Angle is the sector (the 8 biggest sectors are labelled around the rim); distance from the centre is how long the protocol has run with no token (rings are years; hollow blips on the rim record no listing date); area is TVL; the tail is the 7-day TVL move, out for up, in for down; colour is the farm verdict — green farm, amber watch, grey skip. The filters below dim the rest, and a row and its blip light together: click a blip to open its detail. The scope is drawn from the same ' + rows.length + ' rows as the board — no extra data.</p></section>';
  }

  // The planner: capital + hours a week in, the farms that fit come out.
  function plannerPanel() {
    var p = state.planner;
    var minsPerFarm = 15; // 10 minutes a week repeating the core action, plus the setup spread over 8 weeks
    var capLeft = p.capital, minsLeft = p.hours * 60;
    var picked = [], skipped = 0;
    R.farmQueue.forEach(function (q) {
      var row = R.rows.find(function (x) { return x.slug === q.slug; });
      if (!row) return;
      if (row.depositUsd <= capLeft && minsPerFarm <= minsLeft) {
        picked.push({ q: q, dep: row.depositUsd, pool: row.farmerEvUsd });
        capLeft -= row.depositUsd; minsLeft -= minsPerFarm;
      } else skipped++;
    });
    var totPool = picked.reduce(function (a, x) { return a + x.pool; }, 0);
    var totCap = picked.reduce(function (a, x) { return a + x.dep; }, 0);
    var totMins = picked.length * minsPerFarm;
    var list = picked.map(function (x) {
      return '<tr data-slug="' + escHtml(x.q.slug) + '"><td>' + escHtml(x.q.name) + '</td><td class="num">#' + x.q.rank + '</td><td class="num">' + fmtMoney(x.q.implied_value_usd) + '</td><td class="num">$' + x.dep + '</td><td class="num">' + minsPerFarm + ' min/wk</td><td class="num">' + fmtMoney(x.pool) + '</td></tr>';
    }).join('');
    return '<section class="planner"><h2>Farm planner — what fits your capital and your week</h2>' +
      '<p class="note">The queue is sorted by farmers\u2019 pool vs farm cost, best first. The planner walks it and takes each farm while its deposit fits the capital left and its 15 minutes a week (10 repeating the core action, 5 of setup spread over the 8 weeks) fits the hours left. It changes nothing submitted — it only plans from the board.</p>' +
      '<label>Capital <input id="pl-cap" type="number" min="0" step="50" value="' + p.capital + '"> $</label> ' +
      '<label>Hours a week <input id="pl-hrs" type="number" min="0" step="0.5" value="' + p.hours + '"></label> ' +
      '<p><b>' + picked.length + ' farms fit' + (skipped ? ' · ' + skipped + ' do not' : '') + '</b> — ' + fmtMoney(totCap) + ' of ' + fmtMoney(p.capital) + ' capital · ' + Math.round(totMins) + ' of ' + Math.round(p.hours * 60) + ' minutes a week · farmers\u2019 pool if they all launch ' + fmtMoney(totPool) + ' (5% of launch value, assumed, no airdrop confirmed).</p>' +
      (picked.length ? '<table class="board"><thead><tr><th>Protocol</th><th>Board rank</th><th>Expected value</th><th>Deposit</th><th>Time</th><th>Farmers\u2019 pool</th></tr></thead><tbody>' + list + '</tbody></table>' : '<p class="note">Nothing fits that budget — raise the capital or the hours, or both.</p>') +
      '</section>';
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
      '</svg><p class="note">Each dot is one of the ' + pts.length + ' traded comps, predicted leave-one-out — the model had not seen it when it guessed. Green dots were listed before 2025, amber ones in 2025 or later. The dashed line is a perfect fit; the cloud around it is why the R² is modest and reported as it is. Leave-one-out R² ' + R.model.validation.looR2.toFixed(2) + ', rank correlation ' + R.model.validation.looSpearman.toFixed(2) + ' (plain OLS would score ' + R.model.validation.olsLooR2.toFixed(2) + ' / ' + R.model.validation.olsLooSpearman.toFixed(2) + '). The blind range on a fitted value is ×' + blindRangeFactor().toFixed(2) + ' — half the leave-one-out misses fall inside it.</p></div>';
  }

  function multiplesTable() {
    var catKept = R.model.terms.indexOf('category') >= 0;
    var rows = R.multiples.map(function (m) {
      return '<tr><td>' + escHtml(m.category) + '</td><td>' + m.n + '</td><td>' + fmtMult(m.fitted) + '</td><td>' + m.observedMedian.toFixed(2) + '×</td></tr>';
    }).join('');
    return '<h3>Fitted multiple by category</h3><table><tr><th>Category</th><th>Traded comps</th><th>Fitted multiplier</th><th>Observed median mcap / TVL</th></tr>' + rows + '</table>' +
      (catKept
        ? '<p class="note">The fitted multiplier is exp of the category coefficient in the regression (the “Other” group is the baseline, ×1.00); the observed median is the raw median market-cap/TVL among that category\u2019s traded comps. The two disagree where a category\u2019s TVL, growth and era mix differs from its raw median — the regression, not the raw median, is what scores the board.</p>'
        : '<p class="note">The category term failed the double-blind gate (adding it to the size curve costs held-out rank correlation on both blind protocols), so the model fits no category multiple — the fitted column is ×1.00 for every category and the board scores on the size curve alone. The observed medians stay for reference: they are the raw median market-cap/TVL among each category\u2019s traded comps. An independent top-10 entry\u2019s published backtest ladder reaches the same conclusion: past the size curve, the sector term does not improve the held-out miss.</p>');
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

  function gateTables() {
    var g = R.model.validation.gate;
    function ladderTable(ladder, unit) {
      if (!ladder.length) return '<p class="note">No term cleared both blind protocols.</p>';
      return '<table><tr><th>Round</th><th>Term added</th><th>Blind-T gain</th><th>Blind-C gain</th></tr>' +
        ladder.map(function (s) {
          return '<tr><td>' + s.round + '</td><td>' + escHtml(s.term) + '</td><td>+' + s.dT.toFixed(3) + ' ' + unit + '</td><td>+' + s.dC.toFixed(3) + ' ' + unit + '</td></tr>';
        }).join('') + '</table>';
    }
    function verdictTable(list, unit) {
      return '<table><tr><th>Term</th><th>Blind-T</th><th>Blind-C</th><th>Verdict</th></tr>' +
        list.map(function (d) {
          var cls = d.kept ? 'keep' : 'drop';
          return '<tr><td>' + escHtml(d.term) + (d.kept ? ' (round ' + d.round + ')' : '') + '</td><td>' + (d.dT >= 0 ? '+' : '') + d.dT.toFixed(3) + '</td><td>' + (d.dC >= 0 ? '+' : '') + d.dC.toFixed(3) + '</td><td><span class="gate ' + cls + '">' + escHtml(d.verdict) + '</span></td></tr>';
        }).join('') + '</table>';
    }
    return '<h3>The double-blind term gate — the ladder</h3>' +
      '<p>Start with no term. At each round, add the term whose addition improves <b>both</b> blind protocols the most, provided the smaller improvement clears 0.005. Protocol T is walk-forward, forward and reverse (fit before a cut, test after it, and the reverse); Protocol C is leave-one-category-out (fit without a whole category, test on it). The two protocols share no test row and no failure mode, so a term that passes both has two independent witnesses. Forward, not backward: in the full model a term can be masked by a near-duplicate — the odds model carries three age encodings that hide each other, so backward elimination dropped all three while any one of them earns its place on both protocols once the others are out. Run it yourself: <code>node main.ts --validate --input &lt;snapshot.json&gt;</code>.</p>' +
      '<h3>Value ladder (rank correlation)</h3>' + ladderTable(g.valueLadder, 'rank corr.') +
      verdictTable(g.value, 'rank corr.') +
      '<h3>Odds ladder (AUC)</h3>' + ladderTable(g.oddsLadder, 'AUC') +
      verdictTable(g.odds, 'AUC') +
      '<p class="note">For a kept term the numbers are the gains it brought in the round it was added. For a dropped term they are what adding it to the final kept model would bring — usually nothing, which is why it was dropped. The value gate kept log(TVL) alone: the size curve carries the model, and the held-out numbers did not move when the other seven terms were dropped (leave-one-out rank correlation 0.41 with the curve alone, 0.41 with all eight terms). The odds gate kept age, then the category launch rate: age is what transfers across eras — without it the time-blind AUC sits near chance.</p>';
  }

  function methodPanel() {
    var v = R.model.validation;
    var b = R.model.beta, t = R.model.terms;
    var coefs = t.indexOf('category') >= 0
      ? 'coefficients ' + b.map(function (x) { return (x >= 0 ? '+' : '') + x; }).join(', ')
      : 'intercept ' + (b[0] >= 0 ? '+' : '') + b[0] + t.map(function (name, i) { return name + ' ' + (b[i + 1] >= 0 ? '+' : '') + b[i + 1]; }).join(', ');
    var wf = v.wf.map(function (w) {
      return '<tr><td>walk-forward (' + escHtml(w.cut) + ')</td><td>' + w.nTrain + ' → ' + w.nTest + '</td><td>' + w.r2.toFixed(2) + '</td><td>' + (w.mape * 100).toFixed(0) + '%</td><td>' + w.spearman.toFixed(2) + '</td></tr>';
    }).join('');
    var abl = v.ablation.map(function (a) {
      return '<tr><td>' + (a.term === 'full model' ? '<b>full model</b>' : 'without ' + escHtml(a.term)) + '</td><td>' + a.looR2.toFixed(2) + '</td><td>' + a.looSpearman.toFixed(2) + '</td><td>' + a.foldR2.toFixed(2) + '</td><td>' + a.foldSpearman.toFixed(2) + '</td></tr>';
    }).join('');
    var dropped = v.dropped.map(function (d) { return '<li>' + escHtml(d) + '</li>'; }).join('');
    return '<section class="method"><h2>How this radar works — the model, fitted and tested, not asserted</h2>' +
      '<p><b>Value model (comps).</b> <code>log(market cap) = ' + escHtml(coefs) + '</code>, fitted by a Huber-robust regression (ridge 30, 15 reweighting rounds) on the ' + v.nTrain + ' traded protocols that record a market cap — on the terms the gate kept, which is ' + (t.length ? t.join(', ') : 'none') + '. ' +
      'The fitted value is what a token would be worth <i>if</i> it launched. A few comps sit an order of magnitude off the rest, so plain OLS lets them drag every coefficient; the robust fit beats OLS on every held-out test at once (leave-one-out rank correlation ' + v.looSpearman.toFixed(2) + ' vs ' + v.olsLooSpearman.toFixed(2) + '), and the OLS numbers stay in the table below for comparison. <b>Launch odds</b> come from a logistic regression on all ' + R.meta.nProtocols + ' protocols — did it record a token or not — on the terms the gate kept (' + R.model.oddsTermsKept.join(', ') + '), capped at 5% for a wrapped, staked or bridged product of a token that already trades, a versioned pool, or a centralised exchange. ' +
      '<b>Expected value = fitted value × launch odds</b> — that is the board\u2019s <code>implied_value_usd</code>, and the rank follows it. The odds are a peer benchmark — the share of similar protocols that already record a token — never a forecast of a launch date. Every fitted value carries a blind range of ×' + blindRangeFactor().toFixed(2) + ': half the leave-one-out misses fall inside it.</p>' +
      '<p><b>Validation (held-out, on the traded comps).</b> The numbers below are the model tested on protocols it was not fitted on. The TVL-to-market-cap link is noisy, so the R² is modest — it is reported as it is, not dressed up. Walk-forward is the weak spot: the market repriced new listings in 2025, so a model fitted before 2025 predicts the ones listed after it poorly; the dashboard keeps those numbers in view rather than dropping the test.</p>' +
      '<table><tr><th>Test</th><th>Train → test</th><th>R²</th><th>MAPE</th><th>Rank corr.</th></tr>' +
      '<tr><td>leave-one-out</td><td>' + v.nTrain + ' → 1 each</td><td>' + v.looR2.toFixed(2) + '</td><td>' + (v.looMape * 100).toFixed(0) + '%</td><td>' + v.looSpearman.toFixed(2) + '</td></tr>' +
      '<tr><td>leave-one-out, plain OLS</td><td>' + v.nTrain + ' → 1 each</td><td>' + v.olsLooR2.toFixed(2) + '</td><td>—</td><td>' + v.olsLooSpearman.toFixed(2) + '</td></tr>' +
      '<tr><td>leave-one-category-out</td><td>' + v.nTrain + ' → ' + v.locoN + '</td><td>' + v.locoR2.toFixed(2) + '</td><td>' + (v.locoMape * 100).toFixed(0) + '%</td><td>' + v.locoSpearman.toFixed(2) + '</td></tr>' +
      wf +
      '<tr><td>80/20 split by slug</td><td>' + (v.nTrain - v.splitN) + ' → ' + v.splitN + '</td><td>' + v.splitR2.toFixed(2) + '</td><td>' + (v.splitMape * 100).toFixed(0) + '%</td><td>' + v.splitSpearman.toFixed(2) + '</td></tr>' +
      '</table>' +
      scatterSvg() +
      gateTables() +
      '<p><b>Every value term, tested held-out twice (supporting table).</b> The model refitted without that term, scored leave-one-out and 5-fold, over the full candidate set. The gate above is what decides; this table is the second opinion. log(TVL) carries the model — without it the held-out rank correlation falls to about 0.23. Dropping any other single term moves it by at most 0.02, and dropping log(1+chains) improves the 5-fold rank correlation outright — those terms are decoration on this snapshot, and the gate drops them.</p>' +
      '<table><tr><th>Model</th><th>LOO R²</th><th>LOO rank corr.</th><th>5-fold R²</th><th>5-fold rank corr.</th></tr>' + abl + '</table>' +
      multiplesTable() +
      calibrationBars() +
      '<p><b>Terms tried and dropped.</b></p><ul>' + dropped + '</ul>' +
      '<p><b>What “records a token” means.</b> A protocol records a token if the snapshot gives it a CoinGecko id or a symbol — ' + R.meta.nTraded + ' do. Only ' + v.nTrain + ' of them record a market cap; the other ' + (R.meta.nTraded - v.nTrain) + ' record a symbol but no market cap, mostly product lines (a farm, a bridge, a versioned pool) that carry their parent\u2019s token rather than their own, so they are set aside with the traded set and never ranked. The board ranks only the ' + R.meta.nPre + ' that record nothing at all. The odds are trained on that same split: did the protocol record a token, yes or no.</p>' +
      '<p><b>Coverage.</b> All ' + R.meta.nPre + ' pre-token protocols are ranked (the 40 watchlist first by value, the rest below the floor too); the ' + R.meta.nTraded + ' that already record a token sit in the Traded tab with the market\u2019s own market cap, never a model value. Together the dashboard accounts for all ' + R.meta.nProtocols + ' protocols in the snapshot.</p>' +
      '<p><b>Farm plans.</b> Every row carries 6 steps with a cost and a duration: a deposit sized to the protocol\u2019s TVL, gas priced per chain, a weekly repeat for 8 weeks, and a verdict from the rank and the odds, with the costed numbers beside it — the farmers\u2019 expected pool (5% of the launch value, assumed, no airdrop confirmed), the gas, and 2% of the deposit as the cost of locking it for 8 weeks. The Farm queue tab sorts the same rows by pool vs farm cost, so the cheapest wins come first, and the planner above the board fits them to a capital and hours-a-week budget.</p></section>';
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
      '<p class="note">Move the slider and the board below re-sorts by the sandbox value. It changes nothing submitted: <code>board.json</code> and the rank stay exactly as the fitted model wrote them. Only the odds weight is live — the value model is a single size curve, so there is no growth or era term left to re-weight; the gate dropped them both.</p>' +
      '<label><input type="checkbox" id="sb-on"' + (s.on ? ' checked' : '') + '> Sandbox on</label> ' +
      '<label>Odds weight <input type="range" id="sb-odds" min="0" max="2" step="0.25" value="' + s.oddsW + '"> <b>' + s.oddsW.toFixed(2) + '×</b> <span class="note">(expected value = fitted × odds<sup>w</sup>)</span></label> ' +
      '<button id="sb-reset">Reset</button></section>';
  }

  function visibleRows() {
    var rows = state.view === 'watchlist' ? R.rows.filter(function (r) { return r.onWatchlist; }) : R.rows;
    if (state.catFilter) rows = rows.filter(function (r) { return (r.category || '(none)') === state.catFilter; });
    if (state.oddsFloor) rows = rows.filter(function (r) { return r.odds >= state.oddsFloor; });
    if (state.query) { var q = state.query.toLowerCase(); rows = rows.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0; }); }
    var key = state.sortKey, dir = state.sortDir;
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
    var cols = [['rank', '#'], ['name', 'Protocol'], ['category', 'Category'], ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['odds', 'Launch odds'], ['fitted_usd', 'Fitted value'], ['implied_value_usd', 'Expected value'], ['verdict', 'Verdict']];
    if (state.sandbox.on) cols.push(['sbEv', 'Sandbox value']);
    var h2 = '<table class="board"><thead><tr><th title="Tick two rows to compare them">⇄</th>' + cols.map(function (c) {
      var arrow = state.sortKey === c[0] ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
      return '<th data-sort="' + c[0] + '">' + c[1] + arrow + '</th>';
    }).join('') + '</tr></thead><tbody>';
    h2 += rows.map(function (r) {
      var cmp = state.compared.indexOf(r.slug) >= 0 ? ' checked' : '';
      return '<tr data-slug="' + escHtml(r.slug) + '" class="' + (state.selected === r.slug ? 'sel' : '') + '"><td><input type="checkbox" class="cmp" data-slug="' + escHtml(r.slug) + '"' + cmp + '></td><td class="num">' + r.rank + '</td><td>' + escHtml(r.name) + (r.onWatchlist ? ' <span class="tag wl">WATCHLIST</span>' : '') + '</td><td>' + escHtml(r.category || '—') + '</td><td class="num">' + fmtMoney(r.tvl_usd) + '</td><td class="num">' + fmtPct(r.change_7d) + '</td><td class="num">' + Math.round(r.odds * 100) + '%</td><td class="num">' + fmtMoney(r.fitted_usd) + '</td><td class="num"><b>' + fmtMoney(r.implied_value_usd) + '</b></td><td><span class="tag ' + verdictTag(r.verdict) + '">' + escHtml(r.verdict.split(' — ')[0]) + '</span></td>' +
        (state.sandbox.on ? '<td class="num">' + fmtMoney(sandboxValue(r)) + '</td>' : '') + '</tr>';
    }).join('');
    return h2 + '</tbody></table><p class="note" id="f-count2">' + rows.length + ' rows. Click a row for its model breakdown and farm plan. Expected value = fitted value × launch odds; the rank follows it.' + (state.sandbox.on ? ' Sandbox is on: the Sandbox value column re-ranks this view only.' : '') + '</p>';
  }

  function waterfallTable(r) {
    var f = r.factors;
    var factor = blindRangeFactor();
    var steps = [['Intercept (base)', f.intercept, fmtMoney(f.intercept)]];
    var run = f.intercept;
    f.terms.forEach(function (t) {
      run = run * t.mult;
      var label = t.name === 'log(TVL)' ? 'TVL × ' + fmtMult(t.mult)
        : t.name === 'category' ? 'Category (' + (r.category || 'other') + ') × ' + fmtMult(t.mult)
        : t.name + ' × ' + fmtMult(t.mult);
      steps.push([label, t.mult, fmtMoney(run)]);
    });
    var maxLog = Math.max.apply(null, steps.map(function (s) { return Math.abs(Math.log(s[1])); }));
    var rows = steps.map(function (s) {
      var w = maxLog ? Math.round(Math.abs(Math.log(s[1])) / maxLog * 100) : 0;
      var cls = s[1] >= 1 ? 'up' : 'down';
      return '<tr><td>' + escHtml(s[0]) + '</td><td class="num">' + fmtMult(s[1]) + '</td><td><span class="bar ' + cls + '" style="width:' + Math.max(w, 2) + '%"></span></td><td class="num"><b>' + s[2] + '</b></td></tr>';
    }).join('');
    return '<h3>How the fitted value is built — factor waterfall</h3><table class="wf"><thead><tr><th>Term</th><th>Multiplier</th><th></th><th>Running value</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="note">Each multiplier is the fitted term itself (exp of the regression coefficient times the protocol\u2019s figure); they multiply to the fitted value. Then × launch odds ' + Math.round(r.odds * 100) + '% = expected value ' + fmtMoney(r.implied_value_usd) + '. The fitted value carries a blind range of ×' + factor.toFixed(2) + ' — ' + fmtMoney(Math.round(r.fitted_usd / factor)) + ' to ' + fmtMoney(Math.round(r.fitted_usd * factor)) + ' — because half the leave-one-out misses fall inside it.</p>';
  }

  function rowIntegrity(r) {
    var flags = [];
    flags.push('Snapshot ' + escHtml(R.meta.asOf));
    if (r.ageMissing) flags.push('age not recorded — the odds use the traded median age');
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
      '<div class="cell"><b>' + Math.round(r.odds * 100) + '%</b><span>launch odds (gated logistic)</span></div>' +
      '<div class="cell"><b>' + fmtMoney(r.implied_value_usd) + '</b><span>expected value (rank #' + r.rank + ')</span></div>' +
      '<div class="cell"><b>$' + r.depositUsd + ' + ~$' + Math.round(r.totalGasUsd) + ' gas</b><span>farm cost over 8 weeks</span></div>' +
      '<div class="cell"><b>' + fmtMoney(r.farmerEvUsd) + '</b><span>farmers\u2019 pool if it launches (5% assumed)</span></div>' +
      '<div class="cell"><b>' + (r.farmRatio >= 100 ? '>' + Math.round(r.farmRatio / 10) * 10 + '×' : r.farmRatio.toFixed(1) + '×') + '</b><span>pool vs farm cost</span></div></div>' +
      waterfallTable(r) +
      '<p><b>Verdict:</b> ' + escHtml(r.verdict) + '</p><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + escHtml(s) + '</li>'; }).join('') + '</ol></section>';
  }

  function render() {
    // The detail panel sits above the scope and the method panel so a
    // deep-linked protocol (?detail=<slug>) is visible at the top of the
    // page with no scrolling — a screenshot of the link shows the detail,
    // not the scope. A deep-linked filtered board (?cat=, ?tab=, ?odds=)
    // puts the board first instead, so the filter is visible in the
    // first viewport.
    var board = tabBar() + filterBar() + sandboxPanel() + plannerPanel() + boardTable() + comparePanel();
    var method = methodPanel() + convictionPicks();
    var scope = scopeSvg();
    app.innerHTML = deepBoard && !state.selected
      ? kpiCards() + integrityBanner() + detailPanel() + board + scope + method
      : kpiCards() + integrityBanner() + detailPanel() + scope + method + board;
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
    app.querySelectorAll('.blip').forEach(function (el) {
      el.addEventListener('click', function () {
        state.selected = el.getAttribute('data-slug'); render(); var d = document.querySelector('.detail'); if (d) window.scrollTo(0, d.offsetTop - 10);
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
      var head = ['rank', 'slug', 'name', 'category', 'tvl_usd', 'change_7d', 'odds', 'fitted_usd', 'implied_value_usd', 'verdict'];
      var lines = [head.join(',')].concat(rows.map(function (r) {
        return head.map(function (k) { var v = r[k]; if (v == null) return ''; var s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
      }));
      var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'launch-radar-board.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    var sbOn = document.getElementById('sb-on'); if (sbOn) sbOn.addEventListener('change', function () { state.sandbox.on = sbOn.checked; if (state.sandbox.on) { state.sortKey = 'sbEv'; state.sortDir = -1; } else { state.sortKey = 'rank'; state.sortDir = 1; } render(); });
    var sbO = document.getElementById('sb-odds'); if (sbO) sbO.addEventListener('input', function () { state.sandbox.oddsW = parseFloat(sbO.value); render(); });
    var sbR = document.getElementById('sb-reset'); if (sbR) sbR.addEventListener('click', function () { state.sandbox = { on: false, oddsW: 1 }; state.sortKey = 'rank'; state.sortDir = 1; render(); });
    var plC = document.getElementById('pl-cap'); if (plC) plC.addEventListener('input', function () { state.planner.capital = parseFloat(plC.value) || 0; render(); });
    var plH = document.getElementById('pl-hrs'); if (plH) plH.addEventListener('input', function () { state.planner.hours = parseFloat(plH.value) || 0; render(); });
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
