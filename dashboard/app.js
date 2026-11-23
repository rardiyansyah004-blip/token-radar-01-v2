// Launch Radar dashboard — renders window.RADAR (written by main.ts) with no
// network. Tabs: Board (342 pre-token, ranked by expected value), Watchlist
// (40), Traded (416, market cap). Click a row for its detail + farm plan.
(function () {
  var R = window.RADAR;
  if (!R) { document.getElementById('app').textContent = 'No radar data.'; return; }
  var app = document.getElementById('app');
  var state = { tab: 'board', sort: 'rank', dir: 1, cat: '', minOdds: 0, q: '', sel: null };

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

  function kpis() {
    var v = R.model.validation;
    var med = R.rows[Math.floor(R.rows.length / 2)];
    var items = [
      [R.meta.nProtocols, 'protocols in snapshot'],
      [R.meta.nPre, 'pre-token, ranked'],
      [R.meta.nWatchlist, 'watchlist covered'],
      [money(med.implied_value_usd), 'median expected value'],
      [v.looR2.toFixed(2), 'LOO R² (held-out)'],
      [v.looSpearman.toFixed(2), 'LOO rank correlation'],
      [R.meta.asOf, 'snapshot date'],
    ];
    return '<div class="kpis">' + items.map(function (k) {
      return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function method() {
    var v = R.model.validation;
    var b = R.model.beta, t = R.model.terms;
    var coefs = t.map(function (name, i) { return name + ' ' + (b[i] >= 0 ? '+' : '') + b[i]; }).join(', ');
    var wf = v.wf.map(function (w) {
      return '<tr><td>walk-forward (' + esc(w.cut) + ')</td><td>' + w.nTrain + ' → ' + w.nTest + '</td><td>' + w.r2.toFixed(2) + '</td><td>' + (w.mape * 100).toFixed(0) + '%</td><td>' + w.spearman.toFixed(2) + '</td></tr>';
    }).join('');
    return '<section class="method"><h2>How this radar works — the model, fitted and tested, not asserted</h2>' +
      '<p><b>Value model (comps).</b> <code>log(market cap) = ' + esc(coefs) + '</code>, fitted by OLS (ridge 1) on the ' + v.nTrain + ' traded protocols that record a market cap. ' +
      'The fitted value is what a token would be worth <i>if</i> it launched. <b>Launch odds</b> are the smoothed share of a protocol\u2019s category peers that already record a token, capped at 5% for a wrapped, staked or bridged product of a token that already trades, a versioned pool, or a centralised exchange. ' +
      '<b>Expected value = fitted value × launch odds</b> — that is the board\u2019s <code>implied_value_usd</code>, and the rank follows it.</p>' +
      '<p><b>Validation (held-out, on the traded comps).</b> The numbers below are the model tested on protocols it was not fitted on. The TVL-to-market-cap link is noisy, so the R² is modest — it is reported as it is, not dressed up.</p>' +
      '<table><tr><th>Test</th><th>Train → test</th><th>R²</th><th>MAPE</th><th>Rank corr.</th></tr>' +
      '<tr><td>leave-one-out</td><td>' + v.nTrain + ' → 1 each</td><td>' + v.looR2.toFixed(2) + '</td><td>' + (v.looMape * 100).toFixed(0) + '%</td><td>' + v.looSpearman.toFixed(2) + '</td></tr>' +
      wf +
      '<tr><td>80/20 split by slug</td><td>' + (v.nTrain - v.splitN) + ' → ' + v.splitN + '</td><td>' + v.splitR2.toFixed(2) + '</td><td>' + (v.splitMape * 100).toFixed(0) + '%</td><td>' + v.splitSpearman.toFixed(2) + '</td></tr>' +
      '</table>' +
      '<p><b>Coverage.</b> All ' + R.meta.nPre + ' pre-token protocols are ranked (the 40 watchlist first by value, the rest below the floor too); the ' + R.meta.nTraded + ' that already record a token sit in the Traded tab with the market\u2019s own market cap, never a model value. Together the dashboard accounts for all ' + R.meta.nProtocols + ' protocols in the snapshot.</p>' +
      '<p><b>Farm plans.</b> Every row carries 6 steps with a cost and a duration: a deposit sized to the protocol\u2019s TVL, gas priced per chain, a weekly repeat for 8 weeks, and a verdict (Farm / Watch / Skip) from expected value against that cost.</p></section>';
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
      '<span class="note" id="f-count"></span></div>';
  }

  function currentRows() {
    var rows = state.tab === 'watchlist' ? R.rows.filter(function (r) { return r.onWatchlist; }) : R.rows;
    if (state.cat) rows = rows.filter(function (r) { return (r.category || '(none)') === state.cat; });
    if (state.minOdds) rows = rows.filter(function (r) { return r.odds >= state.minOdds; });
    if (state.q) { var q = state.q.toLowerCase(); rows = rows.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0; }); }
    var key = state.sort, dir = state.dir;
    rows = rows.slice().sort(function (a, b) {
      var x = a[key], y = b[key];
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
    var h = '<table class="board"><thead><tr>' + cols.map(function (c) {
      var arrow = state.sort === c[0] ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
      return '<th data-sort="' + c[0] + '">' + c[1] + arrow + '</th>';
    }).join('') + '</tr></thead><tbody>';
    h += rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.sel === r.slug ? 'sel' : '') + '"><td class="num">' + r.rank + '</td><td>' + esc(r.name) + (r.onWatchlist ? ' <span class="tag wl">WATCHLIST</span>' : '') + '</td><td>' + esc(r.category || '—') + '</td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td><td class="num">' + Math.round(r.odds * 100) + '%</td><td class="num">' + money(r.fitted_usd) + '</td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td><td><span class="tag ' + verdictClass(r.verdict) + '">' + esc(r.verdict.split(' — ')[0]) + '</span></td></tr>';
    }).join('');
    return h + '</tbody></table><p class="note" id="f-count2">' + rows.length + ' rows. Click a row for its model breakdown and farm plan. Expected value = fitted value × launch odds; the rank follows it.</p>';
  }

  function detail() {
    if (!state.sel) return '';
    var r = R.rows.find(function (x) { return x.slug === state.sel; });
    if (!r) return '';
    var age = r.ageYears == null ? 'not recorded' : r.ageYears.toFixed(1) + ' yrs';
    return '<section class="detail"><h2>' + esc(r.name) + ' <span class="tag ' + verdictClass(r.verdict) + '">' + esc(r.verdict.split(' — ')[0]) + '</span></h2>' +
      '<div class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) + ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · tracked ' + age + (r.onWatchlist ? ' · <span class="tag wl">WATCHLIST</span>' : '') + (r.isProduct ? ' · product of a token that already trades' : '') + '</div>' +
      '<div class="grid">' +
      '<div class="cell"><b>' + money(r.fitted_usd) + '</b><span>fitted value if it launches</span></div>' +
      '<div class="cell"><b>' + Math.round(r.odds * 100) + '%</b><span>launch odds (category peers)</span></div>' +
      '<div class="cell"><b>' + money(r.implied_value_usd) + '</b><span>expected value (rank #' + r.rank + ')</span></div>' +
      '<div class="cell"><b>$' + r.depositUsd + ' + ~$' + Math.round(r.totalGasUsd) + ' gas</b><span>farm cost over 8 weeks</span></div></div>' +
      '<p><b>Verdict:</b> ' + esc(r.verdict) + '</p><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></section>';
  }

  function render() {
    app.innerHTML = kpis() + method() + tabs() + controls() + table() + detail();
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
    app.querySelectorAll('tr[data-slug]').forEach(function (tr) { tr.addEventListener('click', function () { state.sel = tr.getAttribute('data-slug'); render(); var d = document.querySelector('.detail'); if (d) window.scrollTo(0, d.offsetTop - 10); }); });
    var cat = document.getElementById('f-cat'); if (cat) cat.addEventListener('change', function () { state.cat = cat.value; render(); });
    var od = document.getElementById('f-odds'); if (od) od.addEventListener('change', function () { state.minOdds = parseFloat(od.value); render(); });
    var q = document.getElementById('f-q'); if (q) q.addEventListener('input', function () { state.q = q.value; render(); });
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
