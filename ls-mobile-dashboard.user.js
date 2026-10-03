// ==UserScript==
// @name         L&S Mobile Dashboard
// @namespace    ls-mobile-dashboard
// @version      1.1.0
// @description  Mobile Kursübersicht mit L&S-Daten (Tagesveränderung, Auto-Refresh) + VIX-Fremdquelle
// @author       Tobias Melcher
// @homepage     https://github.com/tobiasmelcher/ls-mobile-dashboard
// @supportURL   https://github.com/tobiasmelcher/ls-mobile-dashboard/issues
// @downloadURL  https://raw.githubusercontent.com/tobiasmelcher/ls-mobile-dashboard/main/ls-mobile-dashboard.user.js
// @updateURL    https://raw.githubusercontent.com/tobiasmelcher/ls-mobile-dashboard/main/ls-mobile-dashboard.user.js
// @license      MIT
// @match        https://www.ls-tc.de/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  var API = 'https://www.ls-tc.de';
  var REFRESH_MS = 20000;
  var MAX_BACKOFF_MS = 300000;

  // VIX als einzige Fremdquelle (CORS-frei): Yahoo/CNN senden kein
  // Access-Control-Allow-Origin und sind per plain fetch() von ls-tc.de aus
  // blockiert. feargreedchart.com sendet `ACAO: *` und liefert
  // market['^VIX'] = { price, chg, pct, closes[~65 Tageswerte] }.
  var VIX_URL = 'https://feargreedchart.com/api/?action=all';
  var VIX_TTL_MS = 300000; // 5 min Cache: 1 schwere Antwort (~1 MB Historie) pro Runde vermeiden
  var vixCache = { at: 0, data: null };
  var VIX_ENTRY = { id: 'VIX', name: 'VIX Volatilitätsindex', isin: '^VIX', currency: 'Pkte', source: 'feargreedchart.com' };

  function isVixId(id) { return String(id).toUpperCase() === 'VIX'; }

  // Benannte Konstanten für wiederkehrende Werte
  var TRADING_DAYS_PER_YEAR = 252;  // ~252 Börsentage für rollierende Fenster
  var MIN_STD_DEV = 0.2;            // Mindeststreuung, damit z-Score bei ruhigen Werten nicht explodiert
  var HIGH_WINDOW_DAYS = 260;       // ~1 Jahr Kalendertage für 52-Wochen-Hoch
  var CROSS_WINDOW_DAYS = 65;       // ~3 Monate Fenster für Golden/Death Cross Erkennung

  // Z-Index-Hierarchie des Overlay-Systems
  var Z_PANEL = 999998;
  var Z_TOGGLE = 999999;
  var Z_CHART_OVERLAY = 10000001;
  var Z_TOAST = 10000002;

  // Standard-Watchlist: gängige Indizes, Rohstoffe und Krypto.
  // Instrument-IDs stammen aus der L&S-Datenbank (ls-tc.de).
  var DEFAULT_WATCHLIST = [
    { id: '44039', name: 'MSCI World (ETF)', isin: 'IE00B4L5Y983', currency: 'EUR' },
    { id: '42380', name: 'Nasdaq-100 (ETF)', isin: 'DE000A0F5UF5', currency: 'EUR' },
    { id: '54395', name: 'Nikkei 225 (ETF)', isin: 'IE00B52MJD48', currency: 'EUR' },
    { id: '49598', name: 'MSCI Emerging Markets IMI', isin: 'IE00BKM4GZ66', currency: 'EUR' },
    { id: '70586', name: 'Gold (Spot)', isin: 'LS000IGOLD01', currency: 'USD' },
    { id: '70577', name: 'Brent Öl (Spot)', isin: 'LS000IOIL003', currency: 'USD' },
    { id: '3477757', name: 'Bitcoin (BTC)', isin: 'LS000LSOBTC1', currency: 'USD' },
    { id: 'VIX', name: 'VIX Volatilitätsindex', isin: '^VIX', currency: 'Pkte', source: 'feargreedchart.com' }
  ];

  var state = {
    watchlist: loadWatchlist(),
    ranges: loadRanges(),
    quotes: {},
    history: {},
    timer: null,
    backoffMs: REFRESH_MS,
    busy: false,
    panelOpen: true
  };

  function loadWatchlist() {
    try {
      var raw = localStorage.getItem('lsdb.watchlist.v1');
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          // Kuratierte Namen aus DEFAULT_WATCHLIST auf gespeicherte Einträge anwenden,
          // falls der Nutzer ein Default-Instrument per Suche (mit API-Rohname) hinzugefügt hat.
          var nameMap = {};
          DEFAULT_WATCHLIST.forEach(function (d) { nameMap[d.id] = d.name; });
          arr.forEach(function (w) {
            if (w && nameMap[String(w.id)]) w.name = nameMap[String(w.id)];
          });
          // Einmal-Migration (v1.1.0): VIX an Bestandslisten anhängen.
          // Flag verhindert Re-Add nach bewusstem Entfernen.
          var migrated = false;
          try { migrated = localStorage.getItem('lsdb.vix-migrated.v1') === '1'; } catch (e2) {}
          if (!migrated && !arr.some(function (w) { return w && isVixId(w.id); })) {
            arr.push({ id: VIX_ENTRY.id, name: VIX_ENTRY.name, isin: VIX_ENTRY.isin, currency: VIX_ENTRY.currency, source: VIX_ENTRY.source });
          }
          try {
            localStorage.setItem('lsdb.vix-migrated.v1', '1');
            localStorage.setItem('lsdb.watchlist.v1', JSON.stringify(arr));
          } catch (e3) { /* Speicher blockiert: nur in-memory weiter */ }
          return arr;
        }
      }
    } catch (e) { /* Fallback auf Defaults */ }
    try { localStorage.setItem('lsdb.vix-migrated.v1', '1'); } catch (e4) {}
    return DEFAULT_WATCHLIST.slice();
  }

  function saveWatchlist() {
    try {
      localStorage.setItem('lsdb.watchlist.v1', JSON.stringify(state.watchlist));
    } catch (e) { /* Speicher voll/blockiert: ignorieren */ }
  }

  var RANGES_SM = [['1M', 30], ['3M', 90], ['6M', 180], ['1J', 365]];

  function loadRanges() {
    try {
      var raw = localStorage.getItem('lsdb.ranges.v1');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') return o;
      }
    } catch (e) { /* ignorieren */ }
    return {};
  }

  function saveRanges() {
    try {
      localStorage.setItem('lsdb.ranges.v1', JSON.stringify(state.ranges));
    } catch (e) { /* ignorieren */ }
  }

  function rangeOf(id) {
    var d = state.ranges[id];
    return d ? d : 90; // Default Mini-Chart: 3 Monate
  }

  function fetchJSON(url, timeoutMs) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, timeoutMs || 10000);
    return fetch(url, { signal: ctrl.signal, credentials: 'same-origin' })
      .then(function (res) {
        clearTimeout(t);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        clearTimeout(t);
        throw err;
      });
  }

  // Suche: ISIN/WKN/Name -> Instrument-ID
  function getInstrument(query) {
    var url = API + '/_rpc/json/.lstc/instrument/search/main?q=' +
      encodeURIComponent(query) + '&localeId=de';
    return fetchJSON(url).then(function (arr) { return Array.isArray(arr) ? arr : []; });
  }

  // Chart-Endpunkt liefert Intraday-Punkte + Vortag (Plotline).
  // Letzter Intraday-Punkt + Vortag = Tagesveränderung (MVP-Basis für getQuote).
  function getHistory(instrumentId) {
    var url = API + '/_rpc/json/instrument/chart/dataForInstrument' +
      '?container=lsdb_chart&instrumentId=' + encodeURIComponent(instrumentId) +
      '&marketId=1&quotetype=mid&series=intraday,history&type=&localeId=de';
    return fetchJSON(url);
  }

  // VIX-Fremdquelle (einzige Ausnahme zur L&S-only-Regel, CORS-frei mit ACAO:*).
  // Antwort enthält u. a. market['^VIX'] = { price, pct, closes[] }.
  function fetchVixMarket() {
    var now = Date.now();
    if (vixCache.data && (now - vixCache.at) < VIX_TTL_MS) {
      return Promise.resolve(vixCache.data);
    }
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 10000);
    return fetch(VIX_URL, { signal: ctrl.signal, credentials: 'omit', mode: 'cors' })
      .then(function (res) {
        clearTimeout(t);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        clearTimeout(t);
        vixCache = { at: Date.now(), data: json };
        return json;
      })
      .catch(function (err) {
        clearTimeout(t);
        throw err;
      });
  }

  // Baut aus den Tages-Schlüssen eine [ms, preis]-Reihe (Kalendertage,
  // heute = letzter Wert), damit refChange/signals/SMA/Charts unverändert laufen.
  function vixHistoryFromCloses(closes) {
    var clean = (closes || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
    var n = clean.length;
    var today = new Date();
    today.setHours(12, 0, 0, 0);
    var base = today.getTime();
    return clean.map(function (v, i) { return [base - (n - 1 - i) * 86400000, v]; });
  }

  function deriveVixQuote(entry, fgJson) {
    var m = fgJson && fgJson.market && fgJson.market['^VIX'];
    if (!m || typeof m.price !== 'number') throw new Error('keine VIX-Daten');
    var closes = Array.isArray(m.closes) && m.closes.length ? m.closes : [m.price];
    var hist = vixHistoryFromCloses(closes);
    var price = m.price;
    var prevClose = closes.length > 1 ? closes[closes.length - 2] : null;
    var chgPct = (typeof m.pct === 'number') ? m.pct
      : (prevClose ? (price / prevClose - 1) * 100 : null);
    var lastTime = hist.length ? hist[hist.length - 1][0] : Date.now();
    var perf = {
      m1: refChange(hist, price, lastTime, 30),
      m3: refChange(hist, price, lastTime, 90),
      m6: refChange(hist, price, lastTime, 180),
      y1: refChange(hist, price, lastTime, 365)
    };
    return {
      id: entry.id, name: entry.name, currency: entry.currency, price: price,
      time: new Date(), prevClose: prevClose, chgPct: chgPct, perf: perf,
      signals: signals(hist),
      smas: { sma50: gapStats(hist, price, 50), sma200: gapStats(hist, price, 200) },
      cross: detectCross(hist), closed: false, external: true, error: null
    };
  }

  // Änderung gegenüber einem früheren Zeitpunkt aus der History-Reihe.
  // Nimmt den letzten Schlusskurs vor (letzter Intraday-Punkt minus Tage).
  function refChange(hist, price, lastTime, days) {
    if (!hist || hist.length < 2 || !price) return null;
    var target = lastTime - days * 86400000;
    var ref = null;
    for (var i = hist.length - 1; i >= 0; i--) {
      if (hist[i][0] <= target) { ref = hist[i][1]; break; }
    }
    if (!ref) return null;
    return (price / ref - 1) * 100;
  }

  // Abstand des aktuellen Kurses zum SMA(n) im historischen Vergleich:
  // gap = (Kurs/SMA-1)*100, Referenz = Mittelwert ± Streuung der Lücke
  // über ~12 Monate. verdict: normal (|z|<1), auffällig (<2), extrem (>=2).
  function gapStats(hist, price, n) {
    var closes = (hist || []).map(function (p) { return p[1]; });
    if (!closes.length || !price) return null;
    var sma = smaSeries(closes, n);
    var gaps = [];
    var i;
    for (i = 0; i < closes.length; i++) {
      if (sma[i] !== null) gaps.push((closes[i] / sma[i] - 1) * 100);
    }
    if (!gaps.length) return null;
    var win = gaps.slice(-TRADING_DAYS_PER_YEAR);
    var mean = 0;
    for (i = 0; i < win.length; i++) mean += win[i];
    mean /= win.length;
    var vari = 0;
    for (i = 0; i < win.length; i++) vari += (win[i] - mean) * (win[i] - mean);
    var std = Math.sqrt(vari / win.length);
    if (std < MIN_STD_DEV) std = MIN_STD_DEV;
    var gap = (price / sma[sma.length - 1] - 1) * 100;
    var z = std > 0 ? (gap - mean) / std : 0;
    var verdict = win.length < 60 ? '–' :
      (Math.abs(z) < 1 ? 'normal' : (Math.abs(z) < 2 ? 'auffällig' : 'extrem'));
    return { sma: sma[sma.length - 1], gap: gap, mean: mean, std: std, z: z, verdict: verdict };
  }

  // SMA-Reihe in Schlusskurs-Länge (null, wo noch undefiniert)
  function smaSeries(closes, n) {
    var out = new Array(closes.length);
    var i, s = 0;
    for (i = 0; i < closes.length; i++) out[i] = null;
    if (closes.length < n || n < 1) return out;
    for (i = 0; i < n; i++) s += closes[i];
    out[n - 1] = s / n;
    for (i = n; i < closes.length; i++) { s += closes[i] - closes[i - n]; out[i] = s / n; }
    return out;
  }

  // Golden Cross (SMA50 steigt über SMA200, bullisch) bzw. Death Cross
  // (fällt darunter, bärisch) im jüngsten Fenster. Reine Anzeige-Info,
  // fließt bewusst NICHT in den Timing-Score ein.
  function detectCross(hist, windowDays) {
    windowDays = windowDays || CROSS_WINDOW_DAYS;
    var closes = (hist || []).map(function (p) { return p[1]; });
    if (closes.length < 201) return { available: false };
    var s50 = smaSeries(closes, 50), s200 = smaSeries(closes, 200);
    var start = Math.max(200, closes.length - windowDays);
    var prevSign = 0, cross = null, i, d, sign;
    if (start > 200 && s50[start - 1] !== null && s200[start - 1] !== null) {
      var prevDiff = s50[start - 1] - s200[start - 1];
      prevSign = prevDiff > 0 ? 1 : (prevDiff < 0 ? -1 : 0);
    }
    for (i = start; i < closes.length; i++) {
      if (s50[i] === null || s200[i] === null) continue;
      d = s50[i] - s200[i];
      sign = d > 0 ? 1 : (d < 0 ? -1 : 0);
      if (sign !== 0) {
        if (prevSign !== 0 && sign !== prevSign) cross = { index: i, up: sign > 0 };
        prevSign = sign;
      }
    }
    var last50 = s50[closes.length - 1], last200 = s200[closes.length - 1];
    var rel = last50 >= last200 ? 'above' : 'below';
    var distPct = (last50 / last200 - 1) * 100;
    if (!cross) return { available: true, type: null, rel: rel, distPct: distPct };
    return {
      available: true, type: cross.up ? 'golden' : 'death',
      dateMs: hist[cross.index][0], rel: rel, distPct: distPct
    };
  }

  // Einfacher gleitender Durchschnitt der Schlusskurse
  function smaVals(closes, n) {
    if (!closes || closes.length < n || n < 1) return null;
    var s = 0;
    for (var i = closes.length - n; i < closes.length; i++) s += closes[i];
    return s / n;
  }

  // RSI(14) mit einfacher Mittelung (kein Wilder-Smoothing)
  function rsiSimple(closes, period) {
    period = period || 14;
    if (!closes || closes.length < period + 1) return null;
    var gain = 0, loss = 0;
    for (var i = closes.length - period; i < closes.length; i++) {
      var d = closes[i] - closes[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    if (gain === 0 && loss === 0) return 50;
    if (loss === 0) return 100;
    return 100 - 100 / (1 + gain / loss);
  }

  // Technische Signale aus Tages-Schlusskursen (FAKTEN, keine Bewertung):
  // RSI, Abstand zum 52W-Hoch, Lage zum langen SMA, Bodenbildung.
  // Bewusst KEIN zusammengesetzter Score: Mean-Reversion- und Trendfolge-
  // Signale widersprechen sich häufig, ein Mix daraus verwässert statt zu klären.
  function signals(hist) {
    var closes = (hist || []).map(function (p) { return p[1]; });
    if (closes.length < 30) return null;
    var last = closes[closes.length - 1];
    var rsi = rsiSimple(closes, 14);
    var rsiPrev = rsiSimple(closes.slice(0, -5), 14);
    var win = closes.slice(-HIGH_WINDOW_DAYS);
    var high = Math.max.apply(null, win);
    var distPct = (last / high - 1) * 100;
    var longN = closes.length >= 200 ? 200 : (closes.length >= 50 ? 50 : null);
    var smaLong = longN ? smaVals(closes, longN) : null;
    var above = smaLong === null ? null : last >= smaLong;
    var tail20 = closes.slice(-20);
    var min20 = Math.min.apply(null, tail20);
    var base = last > min20 * 1.01 && rsi !== null && rsiPrev !== null && rsi > rsiPrev;
    return { rsi: rsi, distHigh: distPct, aboveLong: above, longN: longN, base: base };
  }

  function deriveQuote(entry, chart) {
    var intra = (chart.series && chart.series.intraday && chart.series.intraday.data) || [];
    var plots = (chart.info && chart.info.plotlines) || [];
    var prevClose = plots.length && typeof plots[0].value === 'number' ? plots[0].value : null;
    if (!intra.length) {
      return { id: entry.id, name: entry.name, currency: entry.currency, price: null, time: null, prevClose: prevClose, chgPct: null, perf: { m1: null, m3: null, m6: null, y1: null }, signals: null, cross: null, error: 'keine Intraday-Daten' };
    }
    var last = intra[intra.length - 1];
    var price = last[1];
    var time = new Date(last[0]);
    var chgPct = prevClose ? (price / prevClose - 1) * 100 : null;
    var hist = (chart.series && chart.series.history && chart.series.history.data) || [];
    var perf = {
      m1: refChange(hist, price, last[0], 30),
      m3: refChange(hist, price, last[0], 90),
      m6: refChange(hist, price, last[0], 180),
      y1: refChange(hist, price, last[0], 365)
    };
    // Am Wochenende wiederholt L&S den letzten Kurs mit frischem Zeitstempel
    // (flache Linie). Das ist kein Live-Handel -> als geschlossen markieren.
    var tail = intra.slice(-20);
    var closed = tail.length > 1 && tail.every(function (p) { return p[1] === tail[0][1]; });
    return { id: entry.id, name: entry.name, currency: entry.currency, price: price, time: time, prevClose: prevClose, chgPct: chgPct, perf: perf, signals: signals(hist), smas: { sma50: gapStats(hist, price, 50), sma200: gapStats(hist, price, 200) }, cross: detectCross(hist), closed: closed, error: null };
  }

  function refreshAll(manual) {
    if (state.busy || document.visibilityState !== 'visible') return;
    state.busy = true;
    var jobs = state.watchlist.map(function (entry) {
      if (isVixId(entry.id)) {
        return fetchVixMarket()
          .then(function (fg) {
            state.quotes[entry.id] = deriveVixQuote(entry, fg);
            state.history[entry.id] = vixHistoryFromCloses(
              (fg.market['^VIX'] || {}).closes || []);
            return true;
          })
          .catch(function (err) {
            state.quotes[entry.id] = { id: entry.id, name: entry.name, currency: entry.currency, price: null, time: null, prevClose: null, chgPct: null, perf: { m1: null, m3: null, m6: null, y1: null }, signals: null, cross: null, external: true, error: String(err && err.message || err) };
            return false;
          });
      }
      return getHistory(entry.id)
        .then(function (chart) {
          state.quotes[entry.id] = deriveQuote(entry, chart);
          state.history[entry.id] = (chart.series && chart.series.history && chart.series.history.data) || [];
          return true;
        })
        .catch(function (err) {
          state.quotes[entry.id] = { id: entry.id, name: entry.name, currency: entry.currency, price: null, time: null, prevClose: null, chgPct: null, error: String(err && err.message || err) };
          return false;
        });
    });
    Promise.all(jobs).then(function (results) {
      state.busy = false;
      var hasSuccess = results.some(function (r) { return r; });
      if (hasSuccess || state.watchlist.length === 0) {
        state.backoffMs = REFRESH_MS; // Erfolg: Backoff zurücksetzen
        setStatus('Aktualisiert ' + new Date().toLocaleTimeString('de-DE'));
      } else {
        state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
        setStatus('Fehler — nächster Versuch in ' + Math.round(state.backoffMs / 1000) + ' s');
      }
      renderCards();
      scheduleNextRefresh();
    }).catch(function () {
      state.busy = false;
      state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
      scheduleNextRefresh();
      setStatus('Fehler — nächster Versuch in ' + Math.round(state.backoffMs / 1000) + ' s');
    });
  }

  function scheduleNextRefresh() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(function () { refreshAll(false); }, state.backoffMs);
  }

  // ---------- UI (Overlay-Panel, host-seitig per Inline-Styles isoliert) ----------

  var el = {};

  function css() {
    return 'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
  }

  function mount() {
    var btn = document.createElement('button');
    btn.id = 'lsdb-toggle';
    btn.textContent = 'L&S Dashboard';
    btn.setAttribute('style', css() + 'position:fixed;bottom:max(16px,env(safe-area-inset-bottom,16px));right:16px;z-index:' + Z_TOGGLE + ';display:none;padding:12px 16px;font-size:15px;font-weight:700;background:#0a0030;color:#fff;border:0;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer;');
    btn.addEventListener('click', function () {
      state.panelOpen = true;
      el.panel.style.display = 'flex';
      btn.style.display = 'none';
      try { document.body.style.overflow = 'hidden'; } catch (e) {}
    });
    document.body.appendChild(btn);
    el.toggle = btn;

    var panel = document.createElement('div');
    panel.id = 'lsdb-panel';
    panel.setAttribute('style', css() + 'position:fixed;inset:0;z-index:' + Z_PANEL + ';background:#f4f4f6;color:#111;display:flex;flex-direction:column;');
    panel.innerHTML =
      '<div style="background:#0a0030;color:#fff;padding:12px;padding-top:max(12px,env(safe-area-inset-top,12px));">' +
      '<div style="max-width:640px;margin:0 auto;width:100%;">' +
      '<div style="display:flex;gap:8px;align-items:center;">' +
      '<strong style="font-size:18px;flex:1;">L&amp;S Dashboard</strong>' +
      '<button id="lsdb-refresh" aria-label="Aktualisieren" style="flex:0 0 auto;min-width:44px;min-height:44px;font-size:18px;border-radius:10px;border:0;cursor:pointer;">&#8635;</button>' +
      '<button id="lsdb-close" aria-label="Schließen" style="flex:0 0 auto;min-width:44px;min-height:44px;font-size:18px;border-radius:10px;border:0;background:rgba(255,255,255,.2);color:#fff;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div id="lsdb-status" style="font-size:13px;opacity:.85;margin-top:2px;min-height:18px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;">' +
      '<input id="lsdb-search" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ISIN / WKN / Name" style="flex:1;min-height:44px;padding:10px 12px;font-size:16px;border:1px solid #bbb;border-radius:10px;min-width:0;background:#fff;color:#111;" />' +
      '<button id="lsdb-go" style="min-height:44px;padding:10px 16px;font-size:16px;border-radius:10px;border:0;background:#fff;cursor:pointer;">Suchen</button>' +
      '</div>' +
      '</div></div>' +
      '<div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px;padding-bottom:max(16px,env(safe-area-inset-bottom,16px));">' +
      '<div style="max-width:640px;margin:0 auto;width:100%;">' +
      '<div id="lsdb-hits" style="font-size:15px;margin-bottom:8px;"></div>' +
      '<div id="lsdb-cards"></div>' +
      '<div style="font-size:11px;color:#888;margin:10px 0 16px;">Signale: technische Kennzahlen aus Kursdaten, keine Anlageberatung.</div>' +
      '</div></div>';
    document.body.appendChild(panel);
    try { document.body.style.overflow = 'hidden'; } catch (e) {}

    // Fullscreen-Chart-Overlay (eine Ebene über dem Dashboard)
    var ov = document.createElement('div');
    ov.setAttribute('style', css() + 'position:fixed;inset:0;z-index:' + Z_CHART_OVERLAY + ';background:#fff;display:none;flex-direction:column;');
    ov.innerHTML =
      '<div style="background:#0a0030;color:#fff;padding:12px;padding-top:max(12px,env(safe-area-inset-top,12px));">' +
      '<div style="max-width:640px;margin:0 auto;width:100%;display:flex;gap:8px;align-items:center;">' +
      '<strong id="lsdb-chartname" style="font-size:17px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Chart</strong>' +
      '<button id="lsdb-chartclose" aria-label="Schließen" style="min-width:48px;min-height:44px;font-size:18px;border-radius:10px;border:0;background:#fff;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div id="lsdb-ranges" style="max-width:640px;margin:10px auto 0;width:100%;display:flex;gap:8px;"></div>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:12px;padding-bottom:max(16px,env(safe-area-inset-bottom,16px));"><div style="max-width:640px;margin:0 auto;" id="lsdb-chartbody"></div></div>';
    document.body.appendChild(ov);
    el.chart = ov;
    el.chartName = ov.querySelector('#lsdb-chartname');
    el.chartRanges = ov.querySelector('#lsdb-ranges');
    el.chartBody = ov.querySelector('#lsdb-chartbody');
    ov.querySelector('#lsdb-chartclose').addEventListener('click', closeChart);

    // Toast-Bestätigung (z. B. nach Hinzufügen), blendet sich selbst aus
    var toastEl = document.createElement('div');
    toastEl.setAttribute('style', css() + 'position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom,24px));transform:translateX(-50%);z-index:' + Z_TOAST + ';background:#0a0030;color:#fff;padding:12px 18px;font-size:15px;font-weight:700;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.4);display:none;max-width:90vw;pointer-events:none;text-align:center;');
    document.body.appendChild(toastEl);
    el.toast = toastEl;

    el.panel = panel;
    el.cards = panel.querySelector('#lsdb-cards');
    el.status = panel.querySelector('#lsdb-status');
    el.hits = panel.querySelector('#lsdb-hits');

    panel.querySelector('#lsdb-refresh').addEventListener('click', function () {
      state.backoffMs = REFRESH_MS;
      refreshAll(true);
    });
    var closeBtn = panel.querySelector('#lsdb-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        state.panelOpen = false;
        el.panel.style.display = 'none';
        if (el.toggle) el.toggle.style.display = 'block';
        try { document.body.style.overflow = ''; } catch (e) {}
      });
    }
    panel.querySelector('#lsdb-go').addEventListener('click', onSearch);
    var searchInput = panel.querySelector('#lsdb-search');
    searchInput.addEventListener('keydown', function (ev) {
      if (ev && (ev.key === 'Enter' || ev.keyCode === 13)) {
        if (ev.preventDefault) ev.preventDefault();
        onSearch();
      }
    });
    // L&S-eigene Handler (u. a. Bootstrap-Fokusfalle des Disclaimer-Modals)
    // dürfen unsere UI nicht stören: Events am Panel deckeln.
    ['click', 'keydown', 'keyup', 'keypress', 'focusin', 'pointerdown'].forEach(function (t) {
      panel.addEventListener(t, function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); }, false);
    });
  }

  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.style.display = 'block';
    if (toast._t) clearTimeout(toast._t);
    toast._t = setTimeout(function () { if (el.toast) el.toast.style.display = 'none'; }, 2500);
  }

  function ageInfo(q) {
    if (!q || !q.time) return { dot: '⚪', label: q && q.error ? q.error : 'keine Daten' };
    if (q.closed) return { dot: '⚪', label: 'Markt geschlossen' };
    var ageS = Math.round((Date.now() - q.time.getTime()) / 1000);
    if (ageS < 0) ageS = 0; // L&S-Zeitstempel können leicht in der Zukunft liegen
    var label = ageS < 5 ? 'live' : (ageS < 90 ? 'vor ' + ageS + ' s' : 'vor ' + Math.round(ageS / 60) + ' min');
    if (ageS < 120) return { dot: '🟢', label: label };
    if (ageS < 600) return { dot: '🟡', label: label };
    return { dot: '🔴', label: label };
  }

  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function perfCell(label, v) {
    var val = (v === null || v === undefined || isNaN(v))
      ? '<span style="color:#888;">–</span>'
      : '<span style="font-weight:700;color:' + (v >= 0 ? '#005D42' : '#BE2D36') + ';">' +
        (v >= 0 ? '+' : '') + fmt(v, 1) + ' %</span>';
    return '<span style="flex:1;"><span style="color:#777;">' + label + '</span> ' + val + '</span>';
  }

  // SMA-Zeile: Wert + aktueller Abstand mit historischer Einordnung
  function smaCell(label, g) {
    if (!g || g.sma === null || g.sma === undefined) {
      return '<span style="flex:1;"><span style="color:#777;">' + label + '</span> <span style="color:#888;">–</span></span>';
    }
    var col = g.verdict === 'extrem' ? '#BE2D36' : (g.verdict === 'auffällig' ? '#8a6d00' : '#555');
    return '<span style="flex:1;"><span style="color:#777;">' + label + ' ' + fmt(g.sma, 2) + '</span> ' +
      '<span style="font-weight:700;color:' + col + ';">' + (g.gap >= 0 ? '+' : '') + fmt(g.gap, 1) + ' %</span> ' +
      '<span style="color:#888;">(' + g.verdict + ')</span></span>';
  }

  // Kompakte Signal-Zeile: nur Fakten, keine Bewertung
  function signalsRow(t, cross) {
    if (!t) return '';
    var trend = t.longN && t.aboveLong !== null
      ? (t.aboveLong ? '▲ SMA' : '▼ SMA') + t.longN
      : '';
    var parts = [];
    parts.push('RSI ' + (t.rsi === null ? '–' : Math.round(t.rsi)));
    parts.push(fmt(t.distHigh, 1) + ' % v. Hoch');
    if (trend) parts.push(trend);
    if (t.base) parts.push('Boden');
    var detail = parts.join(' · ');
    if (cross && cross.available && cross.type) {
      var cc = cross.type === 'golden' ? '#005D42' : '#BE2D36';
      var cn = cross.type === 'golden' ? '✚ Golden Cross' : '✖ Death Cross';
      detail += ' · <span style="font-weight:700;color:' + cc + ';">' + cn + ' (' + fmtDateShort(cross.dateMs) + ')</span>';
    }
    return '<div title="Technische Kennzahlen aus Kursdaten — keine Anlageberatung" ' +
      'style="margin-top:6px;font-size:13px;color:#555;">' + detail + '</div>';
  }

  // SVG-Linienchart aus [ms, preis]-Punkten (keine Bibliothek, kein CDN nötig)
  function linePath(data, w, h, pad, padB) {
    if (!data || data.length < 2) return '';
    var vs = data.map(function (p) { return p[1]; });
    var min = Math.min.apply(null, vs), max = Math.max.apply(null, vs);
    if (max === min) max = min + 1;
    var n = data.length;
    var pb = (padB === undefined ? pad : padB);
    function X(i) { return pad + (n === 1 ? 0 : i * (w - 2 * pad) / (n - 1)); }
    function Y(v) { return h - pb - (v - min) / (max - min) * (h - pad - pb); }
    return data.map(function (p, i) {
      return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[1]).toFixed(1);
    }).join(' ');
  }

  function trendColor(data) {
    if (!data || data.length < 2) return '#888';
    return data[data.length - 1][1] >= data[0][1] ? '#005D42' : '#BE2D36';
  }

  var MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  // Mini-Chart als Canvas: Monatsraster, pixelgenau ohne SVG-Verzerrung
  function drawSpark(cv, data, days) {
    if (!cv || !cv.getContext) return;
    var d = rangePoints(data || [], days || 0).slice(-365);
    if (d.length < 2) return;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var W = cv.clientWidth || 300, H = cv.clientHeight || 96;
    cv.width = W * dpr;
    cv.height = H * dpr;
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var padL = 2, padR = 2, padT = 6, padB = 16;
    var fullCloses = (data || []).map(function (p) { return p[1]; });
    var s50 = smaSeries(fullCloses, 50), s200 = smaSeries(fullCloses, 200);
    var startIdx = (data || []).indexOf(d[0]);
    if (startIdx < 0) startIdx = Math.max(0, fullCloses.length - d.length);
    var vs = d.map(function (p) { return p[1]; });
    var jj, jv;
    for (jj = 0; jj < d.length; jj++) {
      jv = s50[startIdx + jj];
      if (jv !== null && jv !== undefined) vs.push(jv);
      jv = s200[startIdx + jj];
      if (jv !== null && jv !== undefined) vs.push(jv);
    }
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    if (hi === lo) hi = lo + 1;
    var spanPad = (hi - lo) * 0.08; // etwas Luft oben/unten
    lo -= spanPad;
    hi += spanPad;
    var n = d.length;
    function X(i) { return padL + i * (W - padL - padR) / (n - 1); }
    function Y(v) { return H - padB - (v - lo) / (hi - lo) * (H - padT - padB); }
    var i, k;
    // faint horizontale Hilfslinien (min/mitte/max)
    ctx.strokeStyle = '#e9e9e9';
    ctx.lineWidth = 1;
    [lo + spanPad, (lo + hi) / 2, hi - spanPad].forEach(function (v) {
      ctx.beginPath();
      ctx.moveTo(padL, Y(v));
      ctx.lineTo(W - padR, Y(v));
      ctx.stroke();
    });
    // Monatsgrenzen suchen
    var months = [], lastKey = '';
    for (i = 0; i < n; i++) {
      var dt = new Date(d[i][0]);
      k = dt.getFullYear() + '-' + dt.getMonth();
      if (k !== lastKey) { lastKey = k; months.push({ i: i, label: MONTHS_SHORT[dt.getMonth()] }); }
    }
    ctx.strokeStyle = '#f1f1f1';
    months.forEach(function (m) {
      ctx.beginPath();
      ctx.moveTo(X(m.i), padT);
      ctx.lineTo(X(m.i), H - padB);
      ctx.stroke();
    });
    // Monatslabels mit Kollisionsprüfung (kein Übereinanderdruck am Rand)
    ctx.fillStyle = '#999';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    var minGap = 30, placed = [];
    months.forEach(function (m, idx) {
      var x = Math.min(Math.max(X(m.i), 14), W - 14);
      var isLast = idx === months.length - 1;
      if (isLast && placed.length && x - placed[placed.length - 1].x < minGap) placed.pop();
      if (!placed.length || x - placed[placed.length - 1].x >= minGap) placed.push({ x: x, label: m.label });
    });
    placed.forEach(function (p) { ctx.fillText(p.label, p.x, H - 4); });
    // SMA50/SMA200 dünn dahinter (Farben wie im Fullscreen-Chart)
    function smaLine(vals, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var pen = false, j, v;
      for (j = 0; j < n; j++) {
        v = vals[startIdx + j];
        if (v === null || v === undefined) { pen = false; continue; }
        if (pen) ctx.lineTo(X(j), Y(v));
        else ctx.moveTo(X(j), Y(v));
        pen = true;
      }
      ctx.stroke();
    }
    smaLine(s50, '#B26A00');
    smaLine(s200, '#1F6FEB');
    // Linie
    ctx.strokeStyle = trendColor(d);
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      if (i) ctx.lineTo(X(i), Y(d[i][1]));
      else ctx.moveTo(X(i), Y(d[i][1]));
    }
    ctx.stroke();
  }

  function rangePoints(hist, days) {
    if (!days || !hist || hist.length < 2) return hist || [];
    var cut = hist[hist.length - 1][0] - days * 86400000;
    var pts = hist.filter(function (p) { return p[0] >= cut; });
    return pts.length > 1 ? pts : hist;
  }

  function fmtDate(ms) {
    return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateShort(ms) {
    return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  var RANGES = [['1M', 30], ['3M', 90], ['6M', 180], ['1J', 365], ['Max', 0]];
  var chartState = { id: null, days: 180 };

  function openChart(id) {
    chartState.id = id;
    chartState.days = rangeOf(id); // Fullscreen startet mit Mini-Chart-Bereich
    drawChart();
    if (el.chart) el.chart.style.display = 'flex';
  }

  function closeChart() {
    if (el.chart) el.chart.style.display = 'none';
  }

  function drawChart() {
    var id = chartState.id;
    var entry = null;
    state.watchlist.forEach(function (w) { if (String(w.id) === String(id)) entry = w; });
    if (!entry || !el.chartBody) return;
    var q = state.quotes[id] || {};
    var hist = state.history[id] || [];
    var pts = rangePoints(hist, chartState.days);
    el.chartName.textContent = entry.name + ' (' + (entry.isin || '') + ')';
    el.chartRanges.innerHTML = '';
    RANGES.forEach(function (r) {
      var b = document.createElement('button');
      b.textContent = r[0];
      b.setAttribute('style', 'flex:1;min-height:44px;font-size:15px;border-radius:10px;border:1px solid #bbb;' +
        (chartState.days === r[1] ? 'background:#0a0030;color:#fff;' : 'background:#fff;'));
      b.addEventListener('click', function () { chartState.days = r[1]; drawChart(); });
      el.chartRanges.appendChild(b);
    });
    if (pts.length < 2) {
      el.chartBody.innerHTML = '<p style="font-size:15px;color:#555;">Noch keine Chartdaten.</p>';
      return;
    }
    var c = trendColor(pts);
    var FW = 640, FH = 320, FP = 12, FPB = 46;
    var n = pts.length;
    function FX(j) { return FP + j * (FW - 2 * FP) / (n - 1); }
    // Gemeinsame Skala für Kurs + SMA-Linien, damit Schnittpunkte stimmen
    var closesH = hist.map(function (p) { return p[1]; });
    var s50f = smaSeries(closesH, 50), s200f = smaSeries(closesH, 200);
    var startIdx = hist.indexOf(pts[0]);
    if (startIdx < 0) startIdx = Math.max(0, hist.length - n);
    var allV = pts.map(function (p) { return p[1]; });
    var k, vv;
    for (k = 0; k < n; k++) {
      vv = s50f[startIdx + k];
      if (vv !== null && vv !== undefined) allV.push(vv);
      vv = s200f[startIdx + k];
      if (vv !== null && vv !== undefined) allV.push(vv);
    }
    var hi = Math.max.apply(null, allV), lo = Math.min.apply(null, allV);
    if (hi === lo) hi = lo + 1;
    function FY(v) { return FH - FPB - (v - lo) / (hi - lo) * (FH - FP - FPB); }
    function mainPath() {
      var d = '';
      for (var j = 0; j < n; j++) d += (j ? 'L' : 'M') + FX(j).toFixed(1) + ' ' + FY(pts[j][1]).toFixed(1);
      return d;
    }
    function smaPath(vals, color, width) {
      var d = '', pen = false, j, v;
      for (j = 0; j < n; j++) {
        v = vals[startIdx + j];
        if (v === null || v === undefined) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + FX(j).toFixed(1) + ' ' + FY(v).toFixed(1);
        pen = true;
      }
      if (!d) return { svg: '', drawn: false };
      return { svg: '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + width + '"/>', drawn: true };
    }
    var sma50 = smaPath(s50f, '#B26A00', 1.6), sma200 = smaPath(s200f, '#1F6FEB', 1.6);
    var legend = '<div style="display:flex;gap:12px;font-size:13px;color:#555;margin-top:6px;">' +
      (sma50.drawn ? '<span><span style="color:#B26A00;">—</span> SMA50</span>' : '') +
      (sma200.drawn ? '<span><span style="color:#1F6FEB;">—</span> SMA200</span>' : '') + '</div>';
    var pct = (pts[pts.length - 1][1] / pts[0][1] - 1) * 100;
    var tickIdx = [0, 0.2, 0.4, 0.6, 0.8, 1].map(function (f) { return Math.round(f * (n - 1)); })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    var ticks = tickIdx.map(function (i) {
      var anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      var x = i === 0 ? FP : (i === n - 1 ? FW - FP : FX(i));
      return '<text x="' + x.toFixed(0) + '" y="' + (FH - 14) + '" font-size="18" fill="#888" text-anchor="' + anchor + '">' + fmtDateShort(pts[i][0]) + '</text>';
    }).join('');
    el.chartBody.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:15px;margin-bottom:6px;align-items:baseline;">' +
      '<span>Aktuell <strong>' + fmt(q.price, 2) + ' ' + escapeHtml(entry.currency || '') + '</strong></span>' +
      '<span style="color:' + c + ';font-weight:700;">' + (pct >= 0 ? '+' : '') + fmt(pct, 2) + ' %</span></div>' +
      '<svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;background:#f8f8fa;border:1px solid #ddd;border-radius:12px;">' +
      '<path d="' + mainPath() + '" fill="none" stroke="' + c + '" stroke-width="2.5"/>' +
      sma50.svg + sma200.svg +
      '<text x="16" y="34" font-size="20" fill="#888">' + fmt(hi, 2) + '</text>' +
      '<text x="16" y="' + (FH - FPB) + '" font-size="20" fill="#888">' + fmt(lo, 2) + '</text>' +
      ticks + '</svg>' + legend +
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#555;margin-top:6px;">' +
      '<span>Hoch ' + fmt(hi, 2) + '</span>' +
      '<span>Tief ' + fmt(lo, 2) + '</span></div>';
  }

  function renderCards() {
    el.cards.innerHTML = '';
    state.watchlist.forEach(function (entry) {
      var q = state.quotes[entry.id] || { name: entry.name, currency: entry.currency };
      var age = ageInfo(q);
      var chg = (q.chgPct === null || q.chgPct === undefined)
        ? '<span>–</span>'
        : '<span style="font-weight:700;color:' + (q.chgPct >= 0 ? '#005D42' : '#BE2D36') + ';">' +
          (q.chgPct >= 0 ? '▲ +' : '▼ ') + fmt(q.chgPct, 2) + ' %</span>';
      var card = document.createElement('div');
      card.setAttribute('style', 'background:#fff;border:1px solid #ddd;border-radius:12px;padding:14px;margin-bottom:10px;');
      var curRg = rangeOf(entry.id);
      var rgBtns = RANGES_SM.map(function (r) {
        var active = curRg === r[1];
        return '<button data-rg="' + escapeHtml(entry.id) + ':' + r[1] + '"' +
          ' style="flex:1;min-height:36px;font-size:13px;border-radius:8px;border:1px solid #bbb;' +
          (active ? 'background:#0a0030;color:#fff;font-weight:700;' : 'background:#fff;') + '">' + r[0] + '</button>';
      }).join('');
      var curDays = rangeOf(entry.id);
      var chipLabels = { 30: '1M', 90: '3M', 180: '6M', 365: '1J' };
      var chipKeys = { 30: 'm1', 90: 'm3', 180: 'm6', 365: 'y1' };
      var chipVal = q.perf && q.perf[chipKeys[curDays]];
      var chipTxt = (chipVal === null || chipVal === undefined || isNaN(chipVal))
        ? chipLabels[curDays] + ' –'
        : chipLabels[curDays] + ' ' + (chipVal >= 0 ? '+' : '') + fmt(chipVal, 1) + ' %';
      var chipCol = (chipVal === null || chipVal === undefined || isNaN(chipVal))
        ? '#888' : (chipVal >= 0 ? '#005D42' : '#BE2D36');
      var y1Chip = '<span class="lsdb-range" style="position:absolute;top:4px;left:6px;font-size:12px;font-weight:700;color:' + chipCol + ';background:rgba(255,255,255,.9);padding:2px 6px;border-radius:6px;">' + chipTxt + '</span>';
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">' +
        '<strong style="font-size:17px;">' + escapeHtml(q.name || entry.name) + '</strong>' +
        '<span style="font-size:18px;">' + age.dot + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;align-items:baseline;">' +
        '<span style="font-size:20px;font-weight:700;">' + fmt(q.price, 2) + ' ' + escapeHtml(q.currency || entry.currency || '') + '</span>' +
        '<span style="font-size:17px;">' + chg + '</span></div>' +
        '<div style="display:flex;gap:8px;margin-top:6px;font-size:14px;">' +
        perfCell('1M', q.perf && q.perf.m1) + perfCell('3M', q.perf && q.perf.m3) + perfCell('6M', q.perf && q.perf.m6) + perfCell('1J', q.perf && q.perf.y1) + '</div>' +
        signalsRow(q.signals, q.cross) +
        '<div title="Abstand zum Durchschnitt vs. 12-Monats-Verteilung — keine Anlageberatung" style="display:flex;gap:8px;margin-top:6px;font-size:13px;">' +
        smaCell('SMA50', q.smas && q.smas.sma50) + smaCell('SMA200', q.smas && q.smas.sma200) + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px;">' + rgBtns + '</div>' +
        '<div data-spark="' + escapeHtml(entry.id) + '" role="button" aria-label="Chart öffnen" style="margin-top:6px;position:relative;">' +
        '<canvas data-cv="' + escapeHtml(entry.id) + '" style="display:block;width:100%;height:96px;"></canvas>' +
        y1Chip +
        '<span style="position:absolute;top:4px;right:6px;font-size:14px;color:#777;">⛶</span></div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px;font-size:13px;color:#555;">' +
        '<span>' + escapeHtml(entry.isin || '') + (q.prevClose ? ' · Vortag ' + fmt(q.prevClose, 2) : '') +
        ((isVixId(entry.id) || q.external) ? ' · Fremdquelle: feargreedchart.com' : '') + '</span>' +
        '<span>' + escapeHtml(age.label) + '</span></div>';
      var rm = document.createElement('button');
      rm.textContent = 'Entfernen';
      rm.setAttribute('style', 'margin-top:10px;min-height:44px;width:100%;padding:10px 16px;font-size:15px;border-radius:10px;border:1px solid #bbb;background:#fff;cursor:pointer;');
      rm.addEventListener('click', function () {
        state.watchlist = state.watchlist.filter(function (w) { return String(w.id) !== String(entry.id); });
        saveWatchlist();
        renderCards();
        refreshAll(true);
      });
      card.appendChild(rm);
      el.cards.appendChild(card);
    });
    var sparks = el.cards.querySelectorAll ? el.cards.querySelectorAll('[data-spark]') : [];
    for (var si = 0; si < sparks.length; si++) {
      (function (sp) {
        sp.addEventListener('click', function () { openChart(sp.getAttribute('data-spark')); });
      })(sparks[si]);
    }
    var cvs = el.cards.querySelectorAll ? el.cards.querySelectorAll('canvas[data-cv]') : [];
    for (var ci = 0; ci < cvs.length; ci++) {
      (function (cv) {
        drawSpark(cv, state.history[cv.getAttribute('data-cv')], rangeOf(cv.getAttribute('data-cv')));
      })(cvs[ci]);
    }
    var rgbs = el.cards.querySelectorAll ? el.cards.querySelectorAll('[data-rg]') : [];
    for (var ri = 0; ri < rgbs.length; ri++) {
      (function (rb) {
        rb.addEventListener('click', function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          var parts = (rb.getAttribute('data-rg') || '').split(':');
          state.ranges[parts[0]] = parseInt(parts[1], 10) || 90;
          saveRanges();
          renderCards();
        });
      })(rgbs[ri]);
    }
  }

  function onSearch() {
    var input = el.panel.querySelector('#lsdb-search');
    var query = input.value.trim();
    if (!query) return;
    el.hits.textContent = 'Suche …';
    getInstrument(query).then(function (hits) {
      el.hits.innerHTML = '';
      // VIX gibt es bei L&S nicht (Suche liefert []): als Fremdquelle anbieten.
      if (/vix/i.test(query) && !state.watchlist.some(function (w) { return isVixId(w.id); })) {
        var vrow = document.createElement('div');
        vrow.setAttribute('style', 'display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #eee;');
        vrow.innerHTML = '<span style="flex:1;min-width:0;">VIX Volatilitätsindex <small>(^VIX / Fremdquelle: feargreedchart.com)</small></span>';
        var vadd = document.createElement('button');
        vadd.textContent = '+ Hinzufügen';
        vadd.setAttribute('style', 'min-height:44px;padding:10px 12px;font-size:15px;flex:0 0 auto;border-radius:10px;cursor:pointer;');
        vadd.addEventListener('click', function () {
          state.watchlist.push({ id: VIX_ENTRY.id, name: VIX_ENTRY.name, isin: VIX_ENTRY.isin, currency: VIX_ENTRY.currency, source: VIX_ENTRY.source });
          saveWatchlist();
          el.hits.innerHTML = '';
          toast('Hinzugefügt: VIX Volatilitätsindex');
          refreshAll(true);
        });
        vrow.appendChild(vadd);
        el.hits.appendChild(vrow);
      }
      if (!hits.length) {
        if (!el.hits.children || !el.hits.children.length) {
          el.hits.textContent = 'Nichts gefunden für „' + query + '“.';
        }
        return;
      }
      hits.slice(0, 5).forEach(function (h) {
        var row = document.createElement('div');
        row.setAttribute('style', 'display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #eee;');
        row.innerHTML = '<span style="flex:1;min-width:0;">' + escapeHtml(h.displayname) +
          ' <small>(' + escapeHtml(h.isin || '') + ' / ' + escapeHtml(String(h.wkn || '')) + ')</small></span>';
        var add = document.createElement('button');
        add.textContent = '+ Hinzufügen';
        add.setAttribute('style', 'min-height:44px;padding:10px 12px;font-size:15px;flex:0 0 auto;border-radius:10px;cursor:pointer;');
        add.addEventListener('click', function () {
          if (state.watchlist.some(function (w) { return String(w.id) === String(h.id); })) {
            toast('Bereits in der Liste: ' + h.displayname);
            return;
          }
          var cur = h.currency || (h.isin && h.isin.indexOf('LS000') === 0 ? 'USD' : 'EUR');
          state.watchlist.push({ id: String(h.id), name: h.displayname, isin: h.isin, currency: cur });
          saveWatchlist();
          el.hits.innerHTML = '';
          toast('Hinzugefügt: ' + h.displayname);
          refreshAll(true);
        });
        row.appendChild(add);
        el.hits.appendChild(row);
      });
    }).catch(function (err) {
      el.hits.textContent = 'Suchfehler: ' + (err && err.message || err);
    });
  }

  function setStatus(msg) {
    if (el.status) el.status.textContent = msg;
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshAll(false);
  });

  if (typeof window !== 'undefined' && window.addEventListener) {
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.panelOpen) renderCards();
        if (chartState.id && el.chart && el.chart.style.display !== 'none') drawChart();
      }, 200);
    });
  }

  mount();
  renderCards();
  setStatus('Lade …');
  refreshAll(false);

  // Test-Hook (nur unter Node aktiv, nie im Browser als Userscript)
  try {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports.__lsdb = {
        signals: signals, rsiSimple: rsiSimple, smaVals: smaVals,
        smaSeries: smaSeries, detectCross: detectCross, refChange: refChange,
        gapStats: gapStats, rangePoints: rangePoints,
        vixHistoryFromCloses: vixHistoryFromCloses, deriveVixQuote: deriveVixQuote,
        isVixId: isVixId, VIX_ENTRY: VIX_ENTRY
      };
    }
  } catch (e) { /* kein module-System: ignorieren */ }
})();
