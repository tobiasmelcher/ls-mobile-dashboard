// Smoke-Test für ls-mobile-dashboard.user.js (node:test, ohne Browser)
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function fakeEl() {
  return {
    children: [], style: {}, _html: '',
    set innerHTML(v) { this._html = String(v); this.children = []; },
    get innerHTML() { return this._html; },
    setAttribute() {}, addEventListener() {}, remove() {}, click() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return fakeEl(); },
    querySelectorAll() { return global.__queryAllHook ? global.__queryAllHook() : []; },
    getAttribute() { return null; },
    value: '', files: [],
  };
}

function serialize(el) {
  let s = el._html || '';
  for (const c of el.children) s += '<button>' + (c.textContent || '') + '</button>';
  return s;
}

function chartFixture(id, flat) {
  const base = 1791021600000;
  const data = [];
  for (let i = 0; i < 25; i++) data.push([base + i * 60000, flat ? 100 : 100 + (i % 3)]);
  const hist = [];
  for (let d = 200; d >= 0; d--) hist.push([base - d * 86400000, flat ? 100 : 50 + (200 - d) * 0.5]);
  return { info: { isin: 'X', plotlines: [{ label: 'Vortag 100', value: 100 }] }, series: { intraday: { data }, history: { data: hist } } };
}

const OLD_LIST = [
  { id: '1045625', name: 'FTSE All-World (ETF)', isin: 'IE00BK5BQT80', currency: 'EUR' },
  { id: '42380', name: 'Nasdaq-100 (ETF)', isin: 'DE000A0F5UF5', currency: 'EUR' },
  { id: '46331', name: 'Euro Stoxx 50 (ETF)', isin: 'DE000ETFL029', currency: 'EUR' },
  { id: '54395', name: 'Nikkei 225 (ETF)', isin: 'IE00B52MJD48', currency: 'EUR' },
  { id: '70586', name: 'Gold (Spot)', isin: 'LS000IGOLD01', currency: 'USD' },
  { id: '70577', name: 'Brent Öl (Spot)', isin: 'LS000IOIL003', currency: 'USD' },
  { id: '3477757', name: 'Bitcoin (BTC)', isin: 'LS000LSOBTC1', currency: 'USD' },
  { id: '4883494', name: 'B.E.-EQ.PRE.IN. U.ETFEOA', isin: 'LU3307219520', currency: 'EUR' },
  { id: '49598', name: 'IS C.MSCI EMIMI U.ETF DLA', isin: 'IE00BKM4GZ66', currency: 'EUR' },
];

test('Gespeicherte Liste bleibt erhalten, Default-Namen werden kuratiert', async () => {
  // Scheduler-Timer (20 s) entrefen, damit der Runner danach sauber beendet;
  // kurze Timer (z. B. die 500-ms-Wartezeit) bleiben referenziert.
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => {
    const t = realSetTimeout(fn, ms, ...a);
    if (ms > 2000 && t && typeof t.unref === 'function') t.unref();
    return t;
  };
  const fetchedIds = [];
  const panelFakes = {};
  const panel = fakeEl();
  panel.querySelector = (sel) => (panelFakes[sel] = panelFakes[sel] || fakeEl());

  global.localStorage = {
    _store: { 'lsdb.watchlist.v1': JSON.stringify(OLD_LIST) },
    getItem(k) { return this._store[k] != null ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
  };
  global.document = {
    body: { appendChild() {}, style: {} },
    createElement: (tag) => (tag === 'div' && !global.__panelUsed ? (global.__panelUsed = true, panel) : fakeEl()),
    addEventListener() {}, visibilityState: 'visible',
  };
  global.fetch = (url) => {
    if (String(url).indexOf('feargreedchart.com') !== -1) {
      const closes = [];
      for (let i = 0; i < 65; i++) closes.push(15 + (i % 5) * 0.2);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ market: { '^VIX': { price: 15.31, pct: -1.2, closes } } }) });
    }
    const m = /instrumentId=(\d+)/.exec(url);
    if (m) fetchedIds.push(m[1]);
    const flat = m && m[1] === '70577';
    return Promise.resolve({ ok: true, json: () => Promise.resolve(chartFixture(m && m[1], flat)) });
  };

  // Canvas-Stub: zeichnet drawSpark auf und protokolliert Monatslabels je Durchgang
  const sparkRec = { frames: [] };
  function makeCanvas(id) {
    return {
      clientWidth: 300, clientHeight: 96, width: 0, height: 0,
      getAttribute(n) { return n === 'data-cv' ? id : null; },
      addEventListener() {},
      getContext() {
        const frame = { labels: [], strokes: [] };
        sparkRec.frames.push(frame);
        const ctxStub = {
          setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {},
          lineTo() {}, stroke() { frame.strokes.push(ctxStub.strokeStyle); },
          fillText(t, x) { frame.labels.push({ t: String(t), x }); },
        };
        return ctxStub;
      },
    };
  }
  global.__queryAllHook = () => [makeCanvas('42380')];

  const src = fs.readFileSync(path.join(__dirname, '..', 'ls-mobile-dashboard.user.js'), 'utf8');
  eval(src); // eslint-disable-line
  await new Promise((r) => setTimeout(r, 500));

  // Gespeicherte Liste (9 Einträge) bekommt VIX-Migration -> 10 Karten
  assert.strictEqual(new Set(fetchedIds).size, 9, 'erwartet 9 L&S-IDs, gesehen: ' + [...new Set(fetchedIds)]);
  assert.ok(fetchedIds.includes('1045625'), 'gespeicherte FTSE-ID bleibt erhalten');
  assert.ok(fetchedIds.includes('46331'), 'gespeicherte Euro-Stoxx-ID bleibt erhalten');

  const cardsHtml = panelFakes['#lsdb-cards'].children.map(serialize).join('\n');
  assert.strictEqual(panelFakes['#lsdb-cards'].children.length, 10, 'erwartet 9 + VIX-Migration = 10 Karten');
  assert.ok(cardsHtml.includes('VIX'), 'VIX-Karte fehlt nach Migration');
  assert.ok(cardsHtml.includes('Fremdquelle'), 'VIX muss als Fremdquelle gekennzeichnet sein');
  // Default-ID mit Rohname wird kuratiert ...
  assert.ok(cardsHtml.includes('MSCI Emerging Markets IMI'), 'kuratierter Default-Name fehlt');
  assert.ok(!cardsHtml.includes('EMIMI U.ETF'), 'API-Rohname muss ersetzt sein');
  // ... alles andere bleibt, wie gespeichert (BNP per FRIENDLY_NAMES kuratiert)
  for (const n of ['FTSE All-World (ETF)', 'Euro Stoxx', 'BNP Equity Premium Income', 'Nasdaq-100 (ETF)']) {
    assert.ok(cardsHtml.includes(n), 'gespeicherter Name fehlt: ' + n);
  }
  assert.ok(!cardsHtml.includes('B.E.-EQ.PRE.IN. U.ETFEOA'), 'BNP-Rohname muss kuratiert sein');
  assert.strictEqual(module.exports.__lsdb.friendlyName({ id: 4883494, isin: 'LU3307219520', displayname: 'B.E.-EQ.PRE.IN. U.ETFEOA' }), 'BNP Equity Premium Income (ETF)', 'friendlyName per ID');
  assert.strictEqual(module.exports.__lsdb.friendlyName({ id: 999, isin: 'LU3307219520', displayname: 'x' }), 'BNP Equity Premium Income (ETF)', 'friendlyName per ISIN');
  assert.strictEqual(module.exports.__lsdb.friendlyName({ id: 1045625, isin: 'IE00BK5BQT80', displayname: 'VANG.FTSE A.W. DLA' }), 'FTSE All-World (ETF)', 'friendlyName FTSE');
  assert.strictEqual(module.exports.__lsdb.friendlyName({ id: 46331, isin: 'DE000ETFL029', displayname: 'DK EURO STOXX 50' }), 'Euro Stoxx 50 (ETF)', 'friendlyName Euro Stoxx');
  assert.ok(cardsHtml.includes('DE000A0F5UF5'), 'ISIN fehlt');
  assert.ok(cardsHtml.includes('<canvas'), 'Mini-Chart fehlt');
  assert.ok(cardsHtml.includes('lsdb-range'), 'Bereichs-Chip fehlt');
  assert.ok(/3M [+-]/.test(cardsHtml), 'Chip muss Default-Bereich 3M zeigen');
  assert.ok(cardsHtml.includes('RSI'), 'Signal-Zeile fehlt');
  assert.ok(cardsHtml.includes('Markt geschlossen'), 'flache Brent-Reihe muss als geschlossen gelten');
  for (const label of ['1M', '3M', '6M', '1J']) {
    assert.ok(cardsHtml.includes(label), 'Zeitraum fehlt: ' + label);
  }
  assert.ok(/1M<\/span> <span[^>]*>\+/.test(cardsHtml), 'steigende History muss positive 1M-Performance zeigen');
  // Monatslabels eines Mini-Charts: keine Überlappung, letztes Label = aktueller Monat
  assert.ok(sparkRec.frames.length >= 1, 'drawSpark muss Canvas gezeichnet haben');
  for (const f of sparkRec.frames) {
    assert.ok(f.labels.length >= 2, 'mindestens 2 Monatslabels erwartet');
    for (let li = 1; li < f.labels.length; li++) {
      assert.ok(f.labels[li].x - f.labels[li - 1].x >= 29,
        'Labels überlappen: ' + f.labels[li - 1].t + '/' + f.labels[li].t);
    }
    assert.ok(f.labels[f.labels.length - 1].x >= 285, 'letztes Label muss am rechten Rand stehen');
  }
  const allStrokes = sparkRec.frames.flatMap((f) => f.strokes);
  assert.ok(allStrokes.includes('#B26A00'), 'SMA50-Linie fehlt im Mini-Chart');
  assert.ok(allStrokes.includes('#1F6FEB'), 'SMA200-Linie fehlt im Mini-Chart');
  global.setTimeout = realSetTimeout; // Stubs bewusst stehen lassen: unrefter 20-s-Timer beendet den Prozess sauber
  delete global.__queryAllHook; delete global.__panelUsed;
});

test('Signale: Rebound zeigt tiefere RSI und größeren Drawdown als Parabel', async () => {
  const realSetTimeout2 = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => {
    const t = realSetTimeout2(fn, ms, ...a);
    if (ms > 2000 && t && typeof t.unref === 'function') t.unref();
    return t;
  };
  global.localStorage = {
    getItem() { return null; },
    setItem() {},
  };
  const panel2 = fakeEl();
  const fakes2 = {};
  panel2.querySelector = (sel) => (fakes2[sel] = fakes2[sel] || fakeEl());
  global.document = {
    body: { appendChild() {}, style: {} },
    createElement: (tag) => (tag === 'div' && !global.__panelUsed ? (global.__panelUsed = true, panel2) : fakeEl()),
    addEventListener() {}, visibilityState: 'visible',
  };
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ info: {}, series: { intraday: { data: [] }, history: { data: [] } } }) });

  const src = fs.readFileSync(path.join(__dirname, '..', 'ls-mobile-dashboard.user.js'), 'utf8');
  eval(src); // eslint-disable-line
  const lib = module.exports.__lsdb;
  assert.ok(lib && lib.signals, 'Test-Hook fehlt');

  const day = 86400000, base = 1791021600000;
  const mk = (closes) => closes.map((c, i) => [base - (closes.length - 1 - i) * day, c]);

  // Rebound: 100 Tage 150 -> 90, dann 20 Tage Bodenbildung 90 -> ~93,5
  const down = [];
  for (let i = 0; i < 100; i++) down.push(150 - i * 0.6);
  const bottom = [];
  for (let i = 0; i < 20; i++) bottom.push(90 + (i % 5) * 0.4 + i * 0.1);
  const rebound = lib.signals(mk(down.concat(bottom)));

  // Parabel: 120 Tage je +0,6 % (stark überkauft)
  const parab = [];
  let p = 100;
  for (let i = 0; i < 120; i++) { parab.push(p); p *= 1.006; }
  const hot = lib.signals(mk(parab));

  assert.ok(rebound && hot, 'Signale erwartet');
  assert.ok(rebound.rsi < hot.rsi, 'Rebound-RSI muss unter Parabel-RSI liegen');
  assert.ok(rebound.distHigh < hot.distHigh, 'Rebound-Drawdown muss größer sein');
  assert.strictEqual(rebound.aboveLong, false, 'Rebound liegt unter langem SMA');
  assert.strictEqual(hot.aboveLong, true, 'Parabel liegt über langem SMA');
  assert.ok(rebound.rsi >= 0 && rebound.rsi <= 100, 'RSI in [0,100]');
  // Bodenbildung: 30 Tage fallend, dann 6 Tage steigend -> Tief hinter sich, RSI steigend
  const slide = [];
  for (let i = 0; i < 30; i++) slide.push(120 - i * 0.678);
  for (let i = 1; i <= 6; i++) slide.push(slide[slide.length - 1] + 1.0);
  assert.strictEqual(lib.signals(mk(slide)).base, true, 'Bodenbildung erkannt');
  const rsiHot = lib.rsiSimple(parab, 14);
  assert.ok(rsiHot > 70 && rsiHot <= 100, 'Parabel-RSI muss überkauft zeigen, war ' + rsiHot);
  assert.strictEqual(lib.signals(mk([1, 2, 3])), null, 'zu kurze Historie -> null');

  // Warten, damit refreshAll/schedule mit aktivem (entrefendem) Wrapper laufen
  await new Promise((r) => setTimeout(r, 100));
  global.setTimeout = realSetTimeout2;
  delete global.__panelUsed;
});

test('SMA-Cross: Golden und Death Cross werden erkannt', async () => {
  const realSetTimeout3 = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => {
    const t = realSetTimeout3(fn, ms, ...a);
    if (ms > 2000 && t && typeof t.unref === 'function') t.unref();
    return t;
  };
  global.localStorage = { getItem() { return null; }, setItem() {} };
  const panel3 = fakeEl();
  const fakes3 = {};
  panel3.querySelector = (sel) => (fakes3[sel] = fakes3[sel] || fakeEl());
  global.document = {
    body: { appendChild() {}, style: {} },
    createElement: (tag) => (tag === 'div' && !global.__panelUsed ? (global.__panelUsed = true, panel3) : fakeEl()),
    addEventListener() {}, visibilityState: 'visible',
  };
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ info: {}, series: { intraday: { data: [] }, history: { data: [] } } }) });

  const src = fs.readFileSync(path.join(__dirname, '..', 'ls-mobile-dashboard.user.js'), 'utf8');
  eval(src); // eslint-disable-line
  const lib = module.exports.__lsdb;
  assert.ok(lib && lib.detectCross, 'Test-Hook fehlt');

  const day = 86400000, base = 1791021600000;
  const mk = (closes) => closes.map((c, i) => [base - (closes.length - 1 - i) * day, c]);

  // Golden Cross: 200 Tage leicht fallend, dann 60 Tage +1/Tag
  const pre = [];
  for (let i = 0; i < 200; i++) pre.push(120 - i * 0.1);
  const up = [];
  for (let i = 0; i < 60; i++) up.push(100 + i * 1.0);
  const golden = lib.detectCross(mk(pre.concat(up)));
  assert.strictEqual(golden.available, true);
  assert.strictEqual(golden.type, 'golden', 'Golden Cross erwartet, war ' + golden.type);
  assert.strictEqual(golden.rel, 'above');

  // Death Cross: 200 Tage leicht steigend, dann 60 Tage -1/Tag
  const pre2 = [];
  for (let i = 0; i < 200; i++) pre2.push(80 + i * 0.1);
  const dn = [];
  for (let i = 0; i < 60; i++) dn.push(100 - i * 1.0);
  const death = lib.detectCross(mk(pre2.concat(dn)));
  assert.strictEqual(death.available, true);
  assert.strictEqual(death.type, 'death', 'Death Cross erwartet, war ' + death.type);
  assert.strictEqual(death.rel, 'below');

  // Kein Cross: stetiger Anstieg (SMA50 dauerhaft über SMA200)
  const steady = [];
  let v = 100;
  for (let i = 0; i < 260; i++) { steady.push(v); v *= 1.003; }
  const none = lib.detectCross(mk(steady));
  assert.strictEqual(none.available, true);
  assert.strictEqual(none.type, null, 'kein Cross erwartet');
  assert.strictEqual(none.rel, 'above');

  // Zu kurz für SMA200
  const short = lib.detectCross(mk([100, 101, 102]));
  assert.strictEqual(short.available, false);

  await new Promise((r) => setTimeout(r, 100));
  global.setTimeout = realSetTimeout3;
  delete global.__panelUsed;
});

test('SMA-Abstand: Spike ist extrem, ruhiger Lauf ist normal', async () => {
  const realSetTimeout4 = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => {
    const t = realSetTimeout4(fn, ms, ...a);
    if (ms > 2000 && t && typeof t.unref === 'function') t.unref();
    return t;
  };
  global.localStorage = { getItem() { return null; }, setItem() {} };
  const panel4 = fakeEl();
  const fakes4 = {};
  panel4.querySelector = (sel) => (fakes4[sel] = fakes4[sel] || fakeEl());
  global.document = {
    body: { appendChild() {}, style: {} },
    createElement: (tag) => (tag === 'div' && !global.__panelUsed ? (global.__panelUsed = true, panel4) : fakeEl()),
    addEventListener() {}, visibilityState: 'visible',
  };
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ info: {}, series: { intraday: { data: [] }, history: { data: [] } } }) });

  const src = fs.readFileSync(path.join(__dirname, '..', 'ls-mobile-dashboard.user.js'), 'utf8');
  eval(src); // eslint-disable-line
  const lib = module.exports.__lsdb;
  assert.ok(lib && lib.gapStats, 'Test-Hook fehlt');

  const day = 86400000, base = 1791021600000;
  const mk = (closes) => closes.map((c, i) => [base - (closes.length - 1 - i) * day, c]);

  // Ruhig: 300 Tage je +0,1 % -> Lücke klein, im Normalbereich
  const calm = [];
  let v = 100;
  for (let i = 0; i < 300; i++) { calm.push(v); v *= 1.001; }
  const gCalm = lib.gapStats(mk(calm), calm[calm.length - 1], 50);
  assert.ok(gCalm, 'Gap erwartet');
  assert.ok(gCalm.gap > 0 && gCalm.gap < 5, 'kleine positive Lücke, war ' + gCalm.gap);
  assert.strictEqual(gCalm.verdict, 'normal', 'ruhiger Lauf muss normal sein');

  // Spike: gleiche Reihe, letzter Schluss +15 % darüber
  const spiked = calm.slice();
  spiked.push(calm[calm.length - 1] * 1.15);
  const gSpike = lib.gapStats(mk(spiked), spiked[spiked.length - 1], 50);
  assert.ok(gSpike.gap > 10, 'große Lücke erwartet, war ' + gSpike.gap);
  assert.strictEqual(gSpike.verdict, 'extrem', 'Spike muss extrem sein');

  // Zu kurz: keine sinnvolle Verteilung (70 Punkte -> 21 Lücken < 60)
  const few = [];
  for (let i = 0; i < 70; i++) few.push(100 + i * 0.1);
  assert.strictEqual(lib.gapStats(mk(few), 107, 50).verdict, '–', 'kurze Historie -> kein Urteil');

  await new Promise((r) => setTimeout(r, 100));
  global.setTimeout = realSetTimeout4;
  delete global.__panelUsed;
});

test('Mini-Chart: Bereich filtert History, Buttons gerendert', async () => {
  const realSetTimeout5 = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => {
    const t = realSetTimeout5(fn, ms, ...a);
    if (ms > 2000 && t && typeof t.unref === 'function') t.unref();
    return t;
  };
  global.localStorage = {
    _s: JSON.stringify([{ id: '44039', name: 'MSCI World (ETF)', isin: 'IE00B4L5Y983', currency: 'EUR' }]),
    getItem(k) { return (k === 'lsdb.watchlist.v1' || k === 'lsdb.ranges.v1') ? (k === 'lsdb.watchlist.v1' ? this._s : null) : null; },
    setItem() {},
  };
  const panel5 = fakeEl();
  const fakes5 = {};
  panel5.querySelector = (sel) => (fakes5[sel] = fakes5[sel] || fakeEl());
  global.document = {
    body: { appendChild() {}, style: {} },
    createElement: (tag) => (tag === 'div' && !global.__panelUsed ? (global.__panelUsed = true, panel5) : fakeEl()),
    addEventListener() {}, visibilityState: 'visible',
  };
  const day = 86400000, base = 1791021600000;
  const hist = [];
  for (let d = 400; d >= 0; d--) hist.push([base - d * day, 100 + (400 - d) * 0.1]);
  const intra = [[base, 140.1]];
  global.fetch = (url) => {
    if (url.indexOf('search/main') !== -1) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ info: { plotlines: [{ value: 140 }] }, series: { intraday: { data: intra }, history: { data: hist } } }) });
  };

  const src = fs.readFileSync(path.join(__dirname, '..', 'ls-mobile-dashboard.user.js'), 'utf8');
  eval(src); // eslint-disable-line
  const lib = module.exports.__lsdb;

  const p30 = lib.rangePoints(hist, 30);
  assert.ok(p30.length >= 25 && p30.length <= 35, '1M filtert auf ~30 Punkte, waren ' + p30.length);
  assert.ok(p30[0][0] >= base - 31 * day, 'keine älteren Punkte im 1M-Fenster');
  assert.strictEqual(lib.rangePoints(hist, 0).length, 401, '0 = alles');
  assert.strictEqual(lib.rangePoints([], 30).length, 0, 'leer bleibt leer');

  await new Promise((r) => setTimeout(r, 300));
  const html = fakes5['#lsdb-cards'].children.map(serialize).join('\n');
  assert.ok(/^Aktualisiert /.test(fakes5['#lsdb-status'].textContent || ''), 'Status muss Ladeende zeigen, war: ' + fakes5['#lsdb-status'].textContent);
  for (const label of ['1M', '3M', '6M', '1J']) {
    assert.ok(html.includes('>' + label + '<'), 'Bereichs-Button fehlt: ' + label);
  }

  global.setTimeout = realSetTimeout5;
  delete global.__panelUsed;
});

test('Indikatoren-Randfälle: RSI neutral bei unverändertem Kurs, keine Scheinsignale bei kurzer Historie', async () => {
  const lib = module.exports.__lsdb;
  assert.ok(lib, 'Test-Hook fehlt');

  // 14 Tage unveränderter Kurs -> RSI muss 50 sein (neutral, nicht überkauft 100)
  const flat = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
  assert.strictEqual(lib.rsiSimple(flat, 14), 50, 'flacher Kurs muss RSI 50 liefern');

  // Kurze Historie (35 Tage, also zwischen 30 und 50): SMA50 kann nicht berechnet werden
  const day = 86400000, base = 1791021600000;
  const short35 = [];
  for (let i = 0; i < 35; i++) short35.push([base - (34 - i) * day, 100 + i * 0.2]);
  const sig35 = lib.signals(short35);
  assert.ok(sig35, 'Signale müssen vorhanden sein');
  assert.strictEqual(sig35.longN, null, 'longN muss bei < 50 Tagen null sein');
  assert.strictEqual(sig35.aboveLong, null, 'aboveLong darf kein Scheinsignal liefern');
});

test('Netzwerkfehler: Backoff wird bei Totalausfall aktiviert und Status meldet Fehler', async () => {
  const realSetTimeout6 = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => {
    const t = realSetTimeout6(fn, ms, ...a);
    if (ms > 2000 && t && typeof t.unref === 'function') t.unref();
    return t;
  };
  global.localStorage = {
    _store: { 'lsdb.watchlist.v1': JSON.stringify([{ id: '44039', name: 'MSCI World', currency: 'EUR' }]) },
    getItem(k) { return this._store[k] || null; },
    setItem(k, v) { this._store[k] = String(v); },
  };
  const panel6 = fakeEl();
  const fakes6 = {};
  panel6.querySelector = (sel) => (fakes6[sel] = fakes6[sel] || fakeEl());
  global.document = {
    body: { appendChild() {}, style: {} },
    createElement: (tag) => (tag === 'div' && !global.__panelUsed ? (global.__panelUsed = true, panel6) : fakeEl()),
    addEventListener() {}, visibilityState: 'visible',
  };
  // Alle Fetch-Aufrufe schlagen fehl
  global.fetch = () => Promise.reject(new Error('Network Offline'));

  const src = fs.readFileSync(path.join(__dirname, '..', 'ls-mobile-dashboard.user.js'), 'utf8');
  eval(src); // eslint-disable-line

  await new Promise((r) => setTimeout(r, 200));
  const status = fakes6['#lsdb-status'].textContent || '';
  assert.ok(/^Fehler — nächster Versuch in /.test(status), 'Status muss Backoff-Fehler melden, war: ' + status);

  global.setTimeout = realSetTimeout6;
  delete global.__panelUsed;
});

