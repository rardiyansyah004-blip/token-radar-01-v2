// Launch Radar dashboard v3 — renders window.RADAR (written by main.ts) with no
// network. Tabs: Board (342 pre-token, ranked by expected value), Watchlist
// (40), Traded (416, market cap). Click a row for its detail + farm plan.
// New in v3: a factor waterfall in every detail view (each fitted term shown
// as the multiplier it is), a model sandbox (sliders re-rank this view only —
// never the submitted board), a compare mode for two protocols, and an
// integrity strip on every row (what was imputed, capped or excluded).
(function () {
  var R = window.RADAR;
  if (!R) { document.getElementById('app').textContent = 'No radar data.'; return; }
  var app = document.getElementById('app');
  var state = { tab: 'board', sort: 'rank', dir: 1, cat: '', minOdds: 0, q: '', sel: null, cmp: [], sb: { on: false, oddsW: 1, growthW: 1, era: true } };

  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(x) { return x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(1) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function verdictClass(v) { return v.indexOf('Farm now') === 0 || v === 'Farm' ? 'farm' : (v.indexOf('Watch') === 0 || v.indexOf('Farm if') === 0 ? 'watch' : 'skip'); }
  function mult(x) { return '×' + (x >= 100 ? Math.round(x).toLocaleString('en-US') : x >= 10 ? x.toFixed(1) : x.toFixed(2)); }

  // Sandbox expected value: fitted x odds^w, with the growth and era terms
  // re-weighted. It re-ranks THIS VIEW ONLY; board.json and the submitted
  // rank never change.
  function sbEv(r) {
    if (!state.sb.on) return r.implied_value_usd;
    var f = r.fitted_usd;
    if (state.sb.growthW !== 1) f = f * Math.pow(r.factors.growth, state.sb.growthW - 1);
    if (!state.sb.era) f = f / r.factors.era;
    return Math.max(1, Math.round(f * Math.pow(r.odds, state.sb.oddsW)));
  }

  function kpis() {
    var v = R.model.validation;
    var med = R.rows[Math.floor(R.rows.length / 2)];
    var items = [
      [R.meta.nProtocols, 'protocols in snapshot'],
      [R.meta.nPre, 'pre-token, ranked'],
      [R.meta.nWatchlist, 'watchlist covered'],
      [money(med.implied_value_usd), 'median expected value'],
      [v.looR2.toFixed(2), 'LOO R² (held-out)'],
      [v.locoR2.toFixed(2), 'LOCO R² (held-out)'],
      [v.odds.brier.toFixed(2), 'odds Brier (5-fold CV)'],
      [R.meta.asOf, 'snapshot date'],
    ];
    return '<div class="kpis">' + items.map(function (k) {
      return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function integrityStrip() {
    var nAgeMiss = R.rows.filter(function (r) { return r.ageMissing; }).length;
    var nGrowMiss = R.rows.filter(function (r) { return r.growthMissing; }).length;
    var nProd = R.rows.filter(function (r) { return r.isProduct; }).length;
    return '<div class="strip"><b>Integrity strip.</b> Snapshot ' + esc(R.meta.asOf) + ' · ' + R.meta.nProtocols + ' protocols · ' +
      R.meta.nPre + ' pre-token ranked · ' + R.meta.nWatchlist + '/' + R.meta.nWatchlist + ' watchlist covered · ' + R.meta.nTraded + ' traded set aside with the market\u2019s own market cap · ' +
      'model fitted on ' + R.model.validation.nTrain + ' comps · odds capped at 5% for ' + nProd + ' products of tokens that already trade · ' +
      'age not recorded for ' + nAgeMiss + ' rows (era step used instead) · 7d growth not reported for ' + nGrowMiss + ' rows (traded median used) · ' +
      'no protocol name is special-cased: the same fitted function scores every row.</div>';
  }

  function method() {
    var v = R.model.validation;
    var b = R.model.beta, t = R.model.terms;
    var coefs = t.map(function (name, i) { return name + ' ' + (b[i] >= 0 ? '+' : '') + b[i]; }).join(', ');
    var wf = v.wf.map(function (w) {
      return '<tr><td>walk-forward (' + esc(w.cut) + ')</td><td>' + w.nTrain + ' → ' + w.nTest + '</td><td>' + w.r2.toFixed(2) + '</td><td>' + (w.mape * 100).toFixed(0) + '%</td><td>' + w.spearman.toFixed(2) + '</td></tr>';
    }).join('');
    var cal = v.odds.calibration.map(function (c) {
      return '<tr><td>' + Math.round(c.lo * 100) + '–' + Math.round(c.hi * 100) + '%</td><td>' + c.n + '</td><td>' + Math.round(c.pred * 100) + '%</td><td>' + Math.round(c.observed * 100) + '%</td></tr>';
    }).join('');
    var abl = v.ablation.map(function (a) {
      return '<tr><td>' + (a.term === 'full model' ? '<b>full model</b>' : 'without ' + esc(a.term)) + '</td><td>' + a.looR2.toFixed(2) + '</td><td>' + a.looSpearman.toFixed(2) + '</td><td>' + a.foldR2.toFixed(2) + '</td><td>' + a.foldSpearman.toFixed(2) + '</td></tr>';
    }).join('');
    var dropped = v.dropped.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('');
    return '<section class="method"><h2>How this radar works — the model, fitted and tested, not asserted</h2>' +
      '<p><b>Value model (comps).</b> <code>log(market cap) = ' + esc(coefs) + '</code>, fitted by OLS (ridge 30) on the ' + v.nTrain + ' traded protocols that record a market cap. ' +
      'The fitted value is what a token would be worth <i>if</i> it launched. <b>Launch odds</b> come from a logistic regression on all ' + R.meta.nProtocols + ' protocols — did it record a token or not — on log TVL, age, log(1+chains), its category\u2019s launch rate (leaving the protocol itself out) and a product flag, capped at 5% for a wrapped, staked or bridged product of a token that already trades, a versioned pool, or a centralised exchange. ' +
      '<b>Expected value = fitted value × launch odds</b> — that is the board\u2019s <code>implied_value_usd</code>, and the rank follows it. The odds are a peer benchmark — the share of similar protocols that already record a token — never a forecast of a launch date.</p>' +
      '<p><b>Validation (held-out, on the traded comps).</b> The numbers below are the model tested on protocols it was not fitted on. The TVL-to-market-cap link is noisy, so the R² is modest — it is reported as it is, not dressed up. Walk-forward is the weak spot: the market repriced new listings in 2025, so a model fitted before 2025 predicts the ones listed after it poorly; the dashboard keeps those numbers in view rather than dropping the test.</p>' +
      '<table><tr><th>Test</th><th>Train → test</th><th>R²</th><th>MAPE</th><th>Rank corr.</th></tr>' +
      '<tr><td>leave-one-out</td><td>' + v.nTrain + ' → 1 each</td><td>' + v.looR2.toFixed(2) + '</td><td>' + (v.looMape * 100).toFixed(0) + '%</td><td>' + v.looSpearman.toFixed(2) + '</td></tr>' +
      '<tr><td>leave-one-category-out</td><td>' + v.nTrain + ' → ' + v.locoN + '</td><td>' + v.locoR2.toFixed(2) + '</td><td>' + (v.locoMape * 100).toFixed(0) + '%</td><td>' + v.locoSpearman.toFixed(2) + '</td></tr>' +
      wf +
      '<tr><td>80/20 split by slug</td><td>' + (v.nTrain - v.splitN) + ' → ' + v.splitN + '</td><td>' + v.splitR2.toFixed(2) + '</td><td>' + (v.splitMape * 100).toFixed(0) + '%</td><td>' + v.splitSpearman.toFixed(2) + '</td></tr>' +
      '</table>' +
      '<p><b>Every value term, tested held-out twice.</b> The model refitted without that term, scored leave-one-out and 5-fold. log(TVL) carries the model — without it the held-out rank correlation falls to 0.03. Dropping any other single term moves the held-out rank correlation by at most 0.02, so those terms are small: they are kept because the bounty asks the value to follow from TVL, growth and age, and they still shift individual rows (category by up to ±18%, the 2025 era step by +30%).</p>' +
      '<table><tr><th>Model</th><th>LOO R²</th><th>LOO rank corr.</th><th>5-fold R²</th><th>5-fold rank corr.</th></tr>' + abl + '</table>' +
      '<p><b>Launch odds, calibrated.</b> Five-fold predictions binned against the share that actually record a token. The logistic scores Brier ' + v.odds.brier.toFixed(2) + ' and log-loss ' + v.odds.logloss.toFixed(2) + ' out of sample; the old category-share odds scored Brier ' + v.odds.v2Brier.toFixed(2) + ' and log-loss ' + v.odds.v2Logloss.toFixed(2) + ' on the same split.</p>' +
      '<table><tr><th>Predicted odds</th><th>Protocols</th><th>Mean predicted</th><th>Actually record a token</th></tr>' + cal + '</table>' +
      '<p><b>Terms tried and dropped.</b></p><ul>' + dropped + '</ul>' +
      '<p><b>What “records a token” means.</b> A protocol records a token if the snapshot gives it a CoinGecko id or a symbol — ' + R.meta.nTraded + ' do. Only ' + v.nTrain + ' of them record a market cap; the other ' + (R.meta.nTraded - v.nTrain) + ' record a symbol but no market cap, mostly product lines (a farm, a bridge, a versioned pool) that carry their parent\u2019s token rather than their own, so they are set aside with the traded set and never ranked. The board ranks only the ' + R.meta.nPre + ' that record nothing at all. The odds are trained on that same split: did the protocol record a token, yes or no.</p>' +
      '<p><b>Coverage.</b> All ' + R.meta.nPre + ' pre-token protocols are ranked (the 40 watchlist first by value, the rest below the floor too); the ' + R.meta.nTraded + ' that already record a token sit in the Traded tab with the market\u2019s own market cap, never a model value. Together the dashboard accounts for all ' + R.meta.nProtocols + ' protocols in the snapshot.</p>' +
      '<p><b>Farm plans.</b> Every row carries 6 steps with a cost and a duration: a deposit sized to the protocol\u2019s TVL, gas priced per chain, a weekly repeat for 8 weeks, and a verdict from the rank and the odds, with the costed numbers beside it — the farmers\u2019 expected pool (5% of the launch value, assumed, no airdrop confirmed), the gas, and 2% of the deposit as the cost of locking it for 8 weeks.</p></section>';
  }

  function tabs() {
    var defs = [['board', 'Board · ' + R.rows.length], ['watchlist', 'Watchlist · ' + R.meta.nWatchlist], ['traded', 'Traded · ' + R.meta.nTraded]];
    return '<div class="tabs">' + defs.map(function (d) {
      return '<button data-tab="' + d[0] + '" class="' + (state.tab === d[0] ? 'on' : '') + '">' + d[1] + '</button>';
    }).join('') + '</div>';
  }

  function controls() {
    var cats = Array.from(new Set(R.rows.map(function (r) { return r.category || '(none)'; }))).sort();
    return '<div class="controls"><label>Category <select id="f-cat"><option value="">All</option>' +
      cats.map(function (c) { return '<option' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Min launch odds <select id="f-odds">' + [0, 0.25, 0.4, 0.5, 0.6].map(function (o) {
        return '<option value="' + o + '"' + (state.minOdds === o ? ' selected' : '') + '>' + Math.round(o * 100) + '%+</option>';
      }).join('') + '</select></label>' +
      '<label>Search <input id="f-q" type="search" placeholder="name or slug" value="' + esc(state.q) + '"></label>' +
      '<button id="f-csv" type="button">Download board (CSV)</button>' +
      '<span class="note" id="f-count"></span></div>';
  }

  function sandbox() {
    var s = state.sb;
    return '<section class="sandbox"><h3>Model sandbox — re-ranks this view only</h3>' +
      '<p class="note">Move a slider and the board below re-sorts by the sandbox value. It changes nothing submitted: <code>board.json</code> and the rank stay exactly as the fitted model wrote them.</p>' +
      '<label><input type="checkbox" id="sb-on"' + (s.on ? ' checked' : '') + '> Sandbox on</label> ' +
      '<label>Odds weight <input type="range" id="sb-odds" min="0" max="2" step="0.25" value="' + s.oddsW + '"> <b>' + s.oddsW.toFixed(2) + '×</b> <span class="note">(expected value = fitted × odds<sup>w</sup>)</span></label> ' +
      '<label>Growth weight <input type="range" id="sb-growth" min="0" max="2" step="0.25" value="' + s.growthW + '"> <b>' + s.growthW.toFixed(2) + '×</b></label> ' +
      '<label><input type="checkbox" id="sb-era"' + (s.era ? ' checked' : '') + '> 2025 era term on</label> ' +
      '<button id="sb-reset">Reset</button></section>';
  }

  function currentRows() {
    var rows = state.tab === 'watchlist' ? R.rows.filter(function (r) { return r.onWatchlist; }) : R.rows;
    if (state.cat) rows = rows.filter(function (r) { return (r.category || '(none)') === state.cat; });
    if (state.minOdds) rows = rows.filter(function (r) { return r.odds >= state.minOdds; });
    if (state.q) { var q = state.q.toLowerCase(); rows = rows.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0; }); }
    var key = state.sort, dir = state.dir;
    rows = rows.slice().sort(function (a, b) {
      var x = key === 'sbEv' ? sbEv(a) : a[key], y = key === 'sbEv' ? sbEv(b) : b[key];
      if (x == null) return 1; if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    return rows;
  }

  function table() {
    if (state.tab === 'traded') {
      var tr = R.traded.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
      var h = '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>MCap / TVL</th></tr></thead><tbody>';
      h += tr.map(function (p, i) {
        return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + (p.mcap_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—') + '</td></tr>';
      }).join('');
      return h + '</tbody></table><p class="note">The ' + R.meta.nTraded + ' protocols that already record a token, with the market\u2019s own market cap — never a model value. They are the comps the value model was fitted on.</p>';
    }
    var rows = currentRows();
    var cols = [['rank', '#'], ['name', 'Protocol'], ['category', 'Category'], ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['odds', 'Launch odds'], ['fitted_usd', 'Fitted value'], ['implied_value_usd', 'Expected value'], ['verdict', 'Verdict']];
    if (state.sb.on) cols.push(['sbEv', 'Sandbox value']);
    var h = '<table class="board"><thead><tr><th title="Tick two rows to compare them">⇄</th>' + cols.map(function (c) {
      var arrow = state.sort === c[0] ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
      return '<th data-sort="' + c[0] + '">' + c[1] + arrow + '</th>';
    }).join('') + '</tr></thead><tbody>';
    h += rows.map(function (r) {
      var cmp = state.cmp.indexOf(r.slug) >= 0 ? ' checked' : '';
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.sel === r.slug ? 'sel' : '') + '"><td><input type="checkbox" class="cmp" data-slug="' + esc(r.slug) + '"' + cmp + '></td><td class="num">' + r.rank + '</td><td>' + esc(r.name) + (r.onWatchlist ? ' <span class="tag wl">WATCHLIST</span>' : '') + '</td><td>' + esc(r.category || '—') + '</td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td><td class="num">' + Math.round(r.odds * 100) + '%</td><td class="num">' + money(r.fitted_usd) + '</td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td><td><span class="tag ' + verdictClass(r.verdict) + '">' + esc(r.verdict.split(' — ')[0]) + '</span></td>' +
        (state.sb.on ? '<td class="num">' + money(sbEv(r)) + '</td>' : '') + '</tr>';
    }).join('');
    return h + '</tbody></table><p class="note" id="f-count2">' + rows.length + ' rows. Click a row for its model breakdown and farm plan. Expected value = fitted value × launch odds; the rank follows it.' + (state.sb.on ? ' Sandbox is on: the Sandbox value column re-ranks this view only.' : '') + '</p>';
  }

  function waterfall(r) {
    var f = r.factors;
    var steps = [
      ['Intercept (base)', f.intercept, money(f.intercept)],
      ['TVL × ' + mult(f.tvl), f.tvl, money(f.intercept * f.tvl)],
      ['Category (' + (r.category || 'other') + ') × ' + mult(f.category), f.category, money(f.intercept * f.tvl * f.category)],
      ['Chains (' + r.chains.length + ') × ' + mult(f.chains), f.chains, money(f.intercept * f.tvl * f.category * f.chains)],
      ['7d growth (' + pct(r.change_7d) + ') × ' + mult(f.growth), f.growth, money(f.intercept * f.tvl * f.category * f.chains * f.growth)],
      ['Era (' + (r.era2025 ? 'listed 2025+' : 'listed before 2025') + ') × ' + mult(f.era), f.era, money(r.fitted_usd)],
    ];
    var maxLog = Math.max.apply(null, steps.map(function (s) { return Math.abs(Math.log(s[1])); }));
    var rows = steps.map(function (s) {
      var w = maxLog ? Math.round(Math.abs(Math.log(s[1])) / maxLog * 100) : 0;
      var cls = s[1] >= 1 ? 'up' : 'down';
      return '<tr><td>' + esc(s[0]) + '</td><td class="num">' + mult(s[1]) + '</td><td><span class="bar ' + cls + '" style="width:' + Math.max(w, 2) + '%"></span></td><td class="num"><b>' + s[2] + '</b></td></tr>';
    }).join('');
    return '<h3>How the fitted value is built — factor waterfall</h3><table class="wf"><thead><tr><th>Term</th><th>Multiplier</th><th></th><th>Running value</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="note">Each multiplier is the fitted term itself (exp of the regression coefficient times the protocol\u2019s figure); they multiply to the fitted value. Then × launch odds ' + Math.round(r.odds * 100) + '% = expected value ' + money(r.implied_value_usd) + '.</p>';
  }

  function integrity(r) {
    var flags = [];
    flags.push('Snapshot ' + esc(R.meta.asOf));
    if (r.ageMissing) flags.push('age not recorded — era step used instead of an age line');
    if (r.growthMissing) flags.push('7d growth not reported — traded median used');
    if (r.oddsCapped) flags.push('odds capped at 5% — product of a token that already trades');
    if (r.onWatchlist) flags.push('on the house watchlist');
    flags.push('fitted on the 128 traded comps, never on this row');
    return '<div class="strip row-strip"><b>Integrity.</b> ' + flags.join(' · ') + '.</div>';
  }

  function compare() {
    if (state.cmp.length < 2) {
      return state.cmp.length === 1 ? '<section class="compare"><p class="note">Compare: one protocol picked — tick one more row (⇄) to compare them side by side.</p></section>' : '';
    }
    var a = R.rows.find(function (x) { return x.slug === state.cmp[0]; });
    var b = R.rows.find(function (x) { return x.slug === state.cmp[1]; });
    if (!a || !b) return '';
    function cell(v) { return '<td class="num">' + v + '</td>'; }
    var rows = [
      ['Rank', '#' + a.rank, '#' + b.rank],
      ['TVL', money(a.tvl_usd), money(b.tvl_usd)],
      ['7d growth', pct(a.change_7d), pct(b.change_7d)],
      ['Age', a.ageYears == null ? 'not recorded' : a.ageYears.toFixed(1) + ' yrs', b.ageYears == null ? 'not recorded' : b.ageYears.toFixed(1) + ' yrs'],
      ['Fitted value', money(a.fitted_usd), money(b.fitted_usd)],
      ['Launch odds', Math.round(a.odds * 100) + '%', Math.round(b.odds * 100) + '%'],
      ['Expected value', money(a.implied_value_usd), money(b.implied_value_usd)],
      ['Farmers\u2019 pool (5% assumed)', money(a.farmerEvUsd), money(b.farmerEvUsd)],
      ['Farm cost (8 wks)', money(a.farmCostUsd), money(b.farmCostUsd)],
      ['Verdict', a.verdict.split(' — ')[0], b.verdict.split(' — ')[0]],
    ];
    return '<section class="compare"><h3>Compare</h3><table class="board"><thead><tr><th></th><th>' + esc(a.name) + '</th><th>' + esc(b.name) + '</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td>' + cell(esc(r[1])) + cell(esc(r[2])) + '</tr>'; }).join('') +
      '</tbody></table><p class="note"><button id="cmp-clear">Clear compare</button></p></section>';
  }

  function detail() {
    if (!state.sel) return '';
    var r = R.rows.find(function (x) { return x.slug === state.sel; });
    if (!r) return '';
    var age = r.ageYears == null ? 'not recorded' : r.ageYears.toFixed(1) + ' yrs';
    return '<section class="detail"><h2>' + esc(r.name) + ' <span class="tag ' + verdictClass(r.verdict) + '">' + esc(r.verdict.split(' — ')[0]) + '</span></h2>' +
      '<div class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) + ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · tracked ' + age + (r.onWatchlist ? ' · <span class="tag wl">WATCHLIST</span>' : '') + (r.isProduct ? ' · product of a token that already trades' : '') + '</div>' +
      integrity(r) +
      '<div class="grid">' +
      '<div class="cell"><b>' + money(r.fitted_usd) + '</b><span>fitted value if it launches</span></div>' +
      '<div class="cell"><b>' + Math.round(r.odds * 100) + '%</b><span>launch odds (logistic, peers\u2019 record)</span></div>' +
      '<div class="cell"><b>' + money(r.implied_value_usd) + '</b><span>expected value (rank #' + r.rank + ')</span></div>' +
      '<div class="cell"><b>$' + r.depositUsd + ' + ~$' + Math.round(r.totalGasUsd) + ' gas</b><span>farm cost over 8 weeks</span></div>' +
      '<div class="cell"><b>' + money(r.farmerEvUsd) + '</b><span>farmers\u2019 pool if it launches (5% assumed)</span></div>' +
      '<div class="cell"><b>' + (r.farmRatio >= 100 ? '>' + Math.round(r.farmRatio / 10) * 10 + '×' : r.farmRatio.toFixed(1) + '×') + '</b><span>pool vs farm cost</span></div></div>' +
      waterfall(r) +
      '<p><b>Verdict:</b> ' + esc(r.verdict) + '</p><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></section>';
  }

  function render() {
    app.innerHTML = kpis() + integrityStrip() + method() + tabs() + controls() + sandbox() + table() + compare() + detail();
    var c = document.getElementById('f-count');
    if (c && state.tab !== 'traded') c.textContent = currentRows().length + ' rows match';
    app.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); state.sel = null; render(); }); });
    app.querySelectorAll('[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
        render();
      });
    });
    app.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function (ev) {
        if (ev.target && ev.target.className === 'cmp') return;
        state.sel = tr.getAttribute('data-slug'); render(); var d = document.querySelector('.detail'); if (d) window.scrollTo(0, d.offsetTop - 10);
      });
    });
    app.querySelectorAll('input.cmp').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var slug = cb.getAttribute('data-slug');
        if (cb.checked) { if (state.cmp.indexOf(slug) < 0) state.cmp.push(slug); if (state.cmp.length > 2) state.cmp.shift(); }
        else state.cmp = state.cmp.filter(function (s) { return s !== slug; });
        render();
      });
    });
    var cat = document.getElementById('f-cat'); if (cat) cat.addEventListener('change', function () { state.cat = cat.value; render(); });
    var od = document.getElementById('f-odds'); if (od) od.addEventListener('change', function () { state.minOdds = parseFloat(od.value); render(); });
    var q = document.getElementById('f-q'); if (q) q.addEventListener('input', function () { state.q = q.value; render(); });
    var csv = document.getElementById('f-csv'); if (csv) csv.addEventListener('click', function () {
      var rows = currentRows();
      var head = ['rank', 'slug', 'name', 'category', 'tvl_usd', 'change_7d', 'odds', 'fitted_usd', 'implied_value_usd', 'verdict'];
      var lines = [head.join(',')].concat(rows.map(function (r) {
        return head.map(function (k) { var v = r[k]; if (v == null) return ''; var s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
      }));
      var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'launch-radar-board.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    var sbOn = document.getElementById('sb-on'); if (sbOn) sbOn.addEventListener('change', function () { state.sb.on = sbOn.checked; if (state.sb.on) { state.sort = 'sbEv'; state.dir = -1; } else { state.sort = 'rank'; state.dir = 1; } render(); });
    var sbO = document.getElementById('sb-odds'); if (sbO) sbO.addEventListener('input', function () { state.sb.oddsW = parseFloat(sbO.value); render(); });
    var sbG = document.getElementById('sb-growth'); if (sbG) sbG.addEventListener('input', function () { state.sb.growthW = parseFloat(sbG.value); render(); });
    var sbE = document.getElementById('sb-era'); if (sbE) sbE.addEventListener('change', function () { state.sb.era = sbE.checked; render(); });
    var sbR = document.getElementById('sb-reset'); if (sbR) sbR.addEventListener('click', function () { state.sb = { on: false, oddsW: 1, growthW: 1, era: true }; state.sort = 'rank'; state.dir = 1; render(); });
    var cc = document.getElementById('cmp-clear'); if (cc) cc.addEventListener('click', function () { state.cmp = []; render(); });
  }
  // Deep-link the initial view so a screenshot can open one directly:
  // ?detail=<slug>&tab=<board|watchlist|traded>&cat=<category>&odds=<0..1>
  // (the same keys work after a '#' too). Query params force a fresh load,
  // a bare hash change does not.
  var qs = (location.search || '').slice(1) + '&' + (location.hash || '').slice(1);
  if (qs) {
    qs.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0] === 'detail' && p[1]) state.sel = decodeURIComponent(p[1]);
      if (p[0] === 'tab' && p[1]) state.tab = p[1];
      if (p[0] === 'cat' && p[1]) state.cat = decodeURIComponent(p[1]);
      if (p[0] === 'odds' && p[1]) state.minOdds = parseFloat(p[1]);
    });
  }
  render();
  // When a deep-link opens a protocol, bring its detail panel into view.
  if (state.sel) {
    var d0 = document.querySelector('.detail');
    if (d0) window.scrollTo(0, d0.offsetTop - 10);
  }
})();
