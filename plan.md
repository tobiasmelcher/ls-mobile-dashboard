### Erweiterung (Status v0.5.0, 03.10.2026)

1. ✅ Intraday-Chart für ein ausgewähltes Instrument (Fullscreen-Linienchart, Canvas, eigene Daten)
2. ✅ Umschaltbare Zeiträume (1M / 3M / 6M / 1J / Max aus L&S-History)
3. ⬜ Vergleich mehrerer Instrumente in einem Chart — offen
4. ⬜ Normalisierter Vergleich ab gemeinsamer Basis `0 %` beziehungsweise `100` — offen
5. ⬜ Sortierung nach Name, Veränderung, Spread oder Datenalter — offen
6. ✅ Suche nach ISIN, WKN oder Namen
7. ⬜ Helles und dunkles Farbschema — offen
8. ❌ Export und Import der lokalen Beobachtungsliste als JSON — umgesetzt, auf Nutzerwunsch wieder entfernt; Anforderung gestrichen

Darüber hinaus umgesetzt (nicht ursprünglich geplant): 1M/3M/6M/1J-Performance pro Karte, Mini-Chart (12 Monate, Canvas, Monatsraster, 1J-Chip), technische Signale (§13), Flatterkennung „Markt geschlossen“ (⚪), ISIN-Anzeige, verständliche Fondsnamen, Watchlist-Migration im `localStorage`, `node:test`-Smoke-Test (`test/dashboard.test.js`).

## 2. Standard-Überblick beim Start

Beim ersten Start (keine gespeicherte Watchlist) zeigt die App eine kuratierte Default-Watchlist mit live Tagesveränderungen. Fokus: breite Marktabdeckung mit wenigen Zeilen, passend zu kleinem Display und gedrosselter Abrufrate. DAX wird auf Wunsch des Nutzers nicht aufgenommen, kann aber manuell hinzugefügt werden.

Vorgeschlagene Default-Liste (10–12 Einträge, in dieser Reihenfolge):

| # | Kategorie | Instrument | Warum | L&S-Proxy im MVP |
|---|-----------|------------|-------|------------------|
| 1 | USA Large Cap | S&P 500 | US-Leitindex, Pflicht | ETF auf S&P 500 |
| 2 | USA Tech | Nasdaq 100 | Tech-Stimmung, Kontrast zu S&P 500 | ETF auf Nasdaq 100 |
| 3 | Welt | MSCI World | globaler Aktienanker (Nutzer-Wunsch) | ETF auf MSCI World |
| 4 | Europa ohne DAX | Euro Stoxx 50 | Europa-Ersatz für DAX | ETF auf Euro Stoxx 50 |
| 5 | Asien | Nikkei 225 | Asien-Session, Diversifikation | ETF/ETC auf Nikkei 225 |
| 6 | Volatilität/Stimmung | VIX bzw. Volatilitäts-ETP | Angstbarometer, Kontrast zu Indizes | falls bei L&S handelbar, sonst Sektion ausblenden |
| 7 | Edelmetall | Gold | Krisen-/Inflationsindikator | ETC auf Gold (physisch besichert) |
| 8 | Energie | Brent-Öl | Nutzer-Wunsch Öl, Makro-Treiber | ETC auf Brent |
| 9 | Krypto | Bitcoin | Nutzer-Wunsch, 24/7-Markt | ETN/ETC auf Bitcoin |
| 10 | Krypto | Ethereum | zweitwichtigster Krypto-Wert | ETN/ETC auf Ethereum |
| 11 | Währung | EUR/USD | Dollar-Stärke erklärt viele Bewegungen | FX- bzw. Währungs-ETC, falls verfügbar |
| 12 | Zins | US-10Y-Rendite bzw. T-Bond-Proxy | Zinsanker für Aktien/Krypto | Renten-ETF als Proxy, falls verfügbar |

Nicht in Default, aber als nächste Kandidaten per Suche hinzufügbar: Dow Jones, Russell 2000, MSCI Emerging Markets / FTSE All-World, Stoxx 600, Hang Seng, Silber, Kupfer, US-Dollar-Index, Bund-Rendite.

### Tatsächliche Startliste (v0.5.0, nutzerdefiniert)

Vom Vorschlag abweichend, per Suche verifiziert und mit Migration für bestehende Installationen umgesetzt (IDs in Klammern): MSCI World ETF (`44039`, IE00B4L5Y983), Nasdaq-100 ETF (`42380`), Nikkei-225 ETF (`54395`), Gold-Spot (`70586`), Brent-Spot (`70577`), Bitcoin (`3477757`), SAP (`34313`, Aktie), BIT Global Internet Leaders Fonds (`1426704`), BNP Equity Premium Income (`4883494`), MSCI Emerging Markets IMI (`49598`), KRC Cat Bond (`4237216`), VanEck Dividenden Welt (`806442`). Entfernt: Euro Stoxx 50, FTSE All-World. Verworfen: VIX (bei L&S nicht verfügbar, keine Fremdquelle), EUR/USD und US-10Y (kein passender L&S-Proxy gefunden), Ethereum (noch nicht aufgenommen).

### Darstellungsregeln für den Überblick

- Pro Zeile: Name, aktueller Kurs (Bid/Ask bzw. Last je nach L&S-Angebot), Tagesveränderung in % (primär) + absolut, Währung, Datenalter/Statuspunkt.
- Basis der Tagesveränderung: Vortagesschluss laut L&S; bei 24/7-Märkten (Bitcoin, Ethereum) 24-h-Rollierung kennzeichnen.
- Unterschiedliche Handelszeiten sichtbar machen (z. B. Nikkei geschlossen, während USA offen): neutraler Status statt veralteter %‑Wert.
- Keine Währungsbereinigung im MVP; Vergleichswährung je Zeile anzeigen.
- Max. 10–12 Auto-Refresh-Instrumente in Default, damit 15–30-s-Takt und Request-Bündelung eingehalten werden.

### Technische Festlegungen

- Defaults als Konstante `DEFAULT_WATCHLIST` mit `{ id, name, isin, wkn, type, currency, proxyNote }`; beim ersten Start in `localStorage` übernehmen, danach nutzereditierbar (hinzufügen, entfernen, umsortieren, Export/Import).
- Reine Preisindizes ohne eigenes L&S-Instrument werden nicht stillschweigend durch Fremdquellen ersetzt. Es wird immer ein bei L&S handelbarer ETF/ETC/ETN-Proxy verwendet und als solcher gekennzeichnet (z. B. „S&P 500 (ETF-Proxy)“).
- Voruntersuchung aus Abschnitt 4 muss für jeden Default-Eintrag klären: L&S-Instrument-ID, ISIN/WKN des Proxys, Handelszeiten, Verhalten außerhalb der Handelszeiten, Verzögerung/Cache. Nicht bei L&S verfügbare Kandidaten (z. B. VIX, US-10Y direkt) werden aus Default entfernt oder durch den nächstbesten Proxy ersetzt und dokumentiert.

## 3. Technische Architektur

Das Projekt wird möglichst managerunabhängig aufgebaut und vermeidet Tampermonkey-spezifische `GM_*`-APIs.

```text
L&S-Webseite / interne JSON-Endpunkte
                │
                ▼
          L&S-Datenadapter
                │
                ▼
      Einheitliches Kursdatenmodell
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
   Watchlist  Scheduler  Historie
        └───────┼────────┘
                ▼
       Mobile UI und Charts
```

Vorgesehene Module innerhalb des Userscripts:

- `instrumentCatalog`: Zuordnung von Name, ISIN/WKN und L&S-Instrument-ID
- `lsDataAdapter`: Abruf und Normalisierung der L&S-Antworten
- `refreshScheduler`: Aktualisierungsintervalle, Pausierung und Fehler-Backoff
- `quoteStore`: aktueller Zustand aller beobachteten Instrumente
- `historyStore`: begrenzte lokale Historie für Charts
- `comparisonEngine`: Prozentnormalisierung und Vergleichsreihen
- `storage`: Einstellungen und Watchlist über `localStorage`
- `ui`: mobile Karten, Detailansicht, Suche und Statusanzeigen
- `chart`: Darstellung der Zeitreihen

## 4. Datenzugriff und Voruntersuchung (Stand: 03.10.2026, verifiziert)

Verifizierte Endpunkte auf `https://www.ls-tc.de` (Details und Beispiele in `docs/data-sources.md`):

| Zweck | Methode / URL | Parameter | Ergebnis |
|---|---|---|---|
| ISIN/WKN/Name → Instrument-ID | `GET /_rpc/json/.lstc/instrument/search/main` | `q`, `localeId=de` | JSON-Array mit `id`/`instrumentId`, `isin`, `wkn`, `displayname`, `categoryId`, `link` |
| Intraday + Historie + Vortag | `GET /_rpc/json/instrument/chart/dataForInstrument` | `container`, `instrumentId`, `marketId=1`, `quotetype=mid`, `series=intraday,history,flags`, `type`, `localeId` | `{ info: { isin, plotlines: [{ Vortag… }] }, series: { intraday: { data: [[ms, preis]] }, history: {…} } }` |
| Live-Push (optional, später) | Lightstreamer `push.ls-tc.de:443`, Adapter `WALLSTREETONLINE` | Items `{instrumentId}@1`, Felder `bid/ask/mid`, `*Size`, `*Time`, `*Perf1d(Rel)` | Push-Updates für `quotes`/`pushtable`-Tabellen |

Verifiziert: `IE00BK5BQT80` → `1045625` (Vanguard FTSE All-World); Bitcoin-Spot `3477757` (`LS000LSOBTC1`, Kategorie Währung); Brent-Spot `70577` (`LS000IOIL003`); Gold-Spot `70586` (`LS000IGOLD01`, Seite `/de/rohstoff/goldpreis`); Nasdaq-ETF `42380` (`DE000A0F5UF5`); Nikkei-ETF `54395`; Euro-Stoxx-50-ETF `46331`. Unbekannte Queries liefern `[]`. Detailseiten: `/de/etf/{id}` bzw. Alias-URLs (`/de/rohstoff/goldpreis`, `/de/waehrung/bitcoin-btc`, …).

Offen (per Browser-DevTools auf Windows nachzuholen, vgl. 12.3): dedizierter Einzel-Quote-JSON-Endpunkt (falls vorhanden), exakte POST-Parameter von `/_rpc/json/instrument/pushtable/result` und `/_rpc/json/instrument/base/statistik`, Cache-/Ratelimit-Verhalten. Hinweis: Ein externes Nachbauprojekt (`ls-tc-receiver`) scheiterte am direkten Lightstreamer-Sessionaufbau außerhalb des Browsers — für den MVP wird daher das `_rpc`-Polling (Chart-Endpunkt) als `getQuote`/`getHistory`-Basis verwendet, Lightstreamer/DOM nur als Rückfalllösung.

Der Datenadapter bekommt eine klar begrenzte Schnittstelle:

```js
getInstrument(query)
getQuote(instrumentId)
getHistory(instrumentId, range)
```

Falls sich die internen Antworten ändern, muss dadurch nur der Adapter angepasst werden, nicht die gesamte Oberfläche. DOM-Auslesen dient nur als Rückfalllösung; strukturierte JSON-Daten sind vorzuziehen.

## 5. Automatische Aktualisierung

Das Intervall soll konfigurierbar sein. Als vorsichtiger Ausgangswert sind 15 bis 30 Sekunden vorgesehen; das endgültige Minimum richtet sich nach dem tatsächlichen Cache-Verhalten und einer vertretbaren Abrufrate.

- Aktualisieren nur, solange die Seite sichtbar ist (`document.visibilityState === "visible"`)
- Nach Rückkehr in den Vordergrund sofort aktualisieren
- Gleichzeitige Anfragen begrenzen oder bündeln
- Keine neue Runde starten, solange die vorherige noch läuft
- Bei Fehlern exponentiell langsamer werden
- Nach manueller Aktualisierung den normalen Takt fortsetzen
- Zeitüberschreitung pro Anfrage vorsehen
- Kursalter unabhängig vom Abrufzeitpunkt berechnen

Statusdarstellung:

- Grün: aktueller Datensatz
- Gelb: älter als der definierte Grenzwert
- Rot: Abruf fehlgeschlagen oder deutlich veraltet
- Neutral: Markt geschlossen

iOS und Android können Browser-Tabs im Hintergrund pausieren. Eine zuverlässige Hintergrundaktualisierung oder Benachrichtigung ist deshalb nicht Bestandteil des ersten Umfangs.

Status v0.5.0: umgesetzt — 20 s Takt, nur bei sichtbarem Tab, keine überlappenden Runden, Backoff bis 5 min, manueller Refresh setzt Takt zurück, 10 s Timeout pro Anfrage, Kursalter aus Datenzeitpunkt (Zukunftstoleranz: negativ → „live“).

## 6. Mobile Oberfläche

### Übersichtsseite

```text
┌─────────────────────────────┐
│ L&S Dashboard       ↻  ⚙︎   │
├─────────────────────────────┤
│ BMW                       ●  │
│ 82,10 / 82,18 €     +1,24 % │
│ Spread 0,10 %       vor 8 s │
├─────────────────────────────┤
│ MSCI World ETF            ●  │
│ 104,32 / 104,40 €   -0,18 % │
│ Spread 0,08 %      vor 12 s │
└─────────────────────────────┘
```

Gestaltungsregeln:

- große, gut berührbare Bedienelemente
- wichtigste Werte ohne horizontales Scrollen
- Bid und Ask klar voneinander unterscheiden
- Gewinne und Verluste nicht ausschließlich über Farben vermitteln
- keine unnötigen Animationen bei jeder Aktualisierung
- sichtbarer Zeitstempel und Verbindungsstatus
- Detailansicht durch Antippen einer Karte

## 7. Charting und Vergleiche

### Einzelchart (teilweise umgesetzt in v0.3–v0.5, Mini-Bereiche v0.10.0)

- ✅ Linienchart (Canvas, eigene Implementierung, kein CDN); Candlestick offen
- ✅ Umschaltbare Zeiträume Fullscreen (1M/3M/6M/1J/Max) und Mini-Chart (1M/3M/6M/1J, Default 3M, pro Wert gespeichert)

- ✅ Linienchart (Canvas, eigene Implementierung, kein CDN); Candlestick offen
- ⬜ optional Bid/Ask-Linien und Spread (Chart-Endpunkt liefert nur Mid)
- ⬜ Tooltip mit Kurs und tatsächlichem Datenzeitpunkt (stattdessen statische Kopfzeile: aktuell, Zeitraum-%, Hoch/Tief, Datumsbereich)
- ⬜ Zoom und horizontales Verschieben, soweit mobil gut bedienbar

### Vergleichschart

Instrumente mit unterschiedlichen Preisen werden auf einen gemeinsamen Startwert normalisiert:

```text
relative Entwicklung = (aktueller Wert / Startwert - 1) × 100
```

Regeln für einen fairen Vergleich:

- gemeinsamer Startzeitpunkt
- fehlende Werte transparent markieren und nicht blind interpolieren
- unterschiedliche Handelszeiten sichtbar machen
- Vergleichswährung anzeigen; keine automatische Währungsbereinigung im MVP
- maximal vier bis sechs Linien gleichzeitig auf kleinen Displays

Für die Chart-Bibliothek wird zunächst geprüft, ob eine kleine gebündelte Bibliothek wie Lightweight Charts mit beiden Userscript-Managern funktioniert. Ein externes CDN soll vermieden werden. Falls Bibliotheks- oder Lizenzbedingungen nicht passen, wird ein einfacher SVG- oder Canvas-Linienchart implementiert.

## 8. Instrumentauswahl

Die App soll Instrumente nicht nur nach frei eingegebenem Namen verwalten. Intern wird möglichst mit stabilen Kennungen gearbeitet:

```js
{
  id: "L&S-INSTRUMENT-ID",
  name: "Beispielinstrument",
  isin: "...",
  wkn: "...",
  type: "stock | etf | index | fund",
  currency: "EUR"
}
```

Zu prüfen ist, welche Indizes und Fonds tatsächlich über L&S verfügbar sind. Nicht handelbare Vergleichsindizes dürfen nicht stillschweigend durch Yahoo- oder andere Kurse ersetzt werden, da Handelsplätze und Verzögerungen sonst nicht vergleichbar wären. Eine spätere zweite Datenquelle müsste deutlich gekennzeichnet werden.

Status v0.5.0: umgesetzt — Auflösung ISIN/WKN/Name → ID via `search/main`, verifizierte IDs in `DEFAULT_WATCHLIST`, Migration gespeicherter Listen, keine Fremdquellen (VIX deshalb verworfen).

## 9. Sicherheit, Robustheit und Grenzen

- `@match` ausschließlich auf die benötigten L&S-HTTPS-Seiten begrenzen
- keine Passwörter, Cookies oder persönlichen Daten erfassen
- keine Drittanbieter-Tracker oder Analysewerkzeuge einbauen
- keine dynamische Ausführung fremden Codes
- HTML aus Kursdaten niemals ungeprüft einsetzen
- gespeicherte Daten auf ein dokumentiertes Schema begrenzen
- Endpunktänderungen als verständlichen Fehler anzeigen
- Nutzungsbedingungen und zulässige Abrufrate vor Veröffentlichung prüfen
- deutlich kennzeichnen: Informationsanzeige, keine Anlageberatung und keine Orderausführung

## 10. GitHub-Struktur

```text
ls-mobile-dashboard/
├── ls-mobile-dashboard.user.js   # gebautes, autarkes Userscript (Release-Artefakt)
├── src/                          # Entwicklungsquellen (nur für Build/Tests)
│   ├── adapter.js
│   ├── scheduler.js
│   ├── store.js
│   ├── comparison.js
│   └── ui.js
├── README.md
├── package.json                  # nur Dev-Tooling (Testrunner, Build), kein Runtime-Dep
├── docs/
│   ├── installation-ios.md
│   ├── installation-android.md
│   └── data-sources.md
├── test/
│   ├── fixtures/
│   │   ├── quote.json
│   │   └── history.json
│   ├── adapter.test.js
│   ├── comparison.test.js
│   └── manual-harness.html
├── LICENSE
└── CHANGELOG.md
```

Die veröffentlichte `.user.js`-Datei bleibt möglichst autark. Build-Werkzeuge dürfen für die Entwicklung eingesetzt werden, aber Anwender sollen nur eine fertige Datei installieren müssen. Unter Windows wird mit Node.js + Tampermonkey (Chrome/Edge) entwickelt und getestet, siehe Abschnitt 11 und 12.

Status v0.5.0: abweichend — kein `src/`-Split und keine `package.json` (reines `node --check` + `node --test`, keine Deps); Tests als `test/dashboard.test.js` (Smoke-Test mit Stub-DOM statt Fixture-Dateien); `docs/data-sources.md` vorhanden, `installation-*.md`/`README`/`LICENSE`/`CHANGELOG` noch offen.

## 13. Technische Signale (v0.6.0, Score in v0.8.0 wieder entfernt)

**Ehrliche Vorbemerkung:** Eine echte „Wahrscheinlichkeit auf positive Rendite“ lässt sich aus reinen Kursdaten nicht seriös berechnen. v0.6.0 enthielt daher einen transparenten Timing-Score 0–100 (30 % RSI, 25 % Drawdown, 25 % Trend, 20 % Momentum, ±7 Bodenbildung). **In v0.8.0 auf Nutzerwunsch und nach ehrlicher Bewertung wieder entfernt:** Die Gewichte waren unbelegt (kein Backtest), und Mean-Reversion- (RSI, Drawdown) und Trendfolge-Komponenten (SMA, Momentum) widersprechen sich häufig — der Mix verwässert, statt zu klären. Eine Zahl 0–100 suggeriert zudem eine nicht vorhandene Kalibrierung.

**Geblieben sind die Fakten** als kompakte Kartenzeile (`signals(hist)`, mind. 30 Tage Historie nötig):

| Signal | Berechnung |
|---|---|
| RSI(14) | einfache Mittelung (kein Wilder-Smoothing) |
| Abstand zum Hoch | `(Kurs / 52W-Hoch − 1) × 100` |
| Trend | Kurs über/unter langem SMA (200, Fallback 50) |
| Bodenbildung | Tief der letzten 20 Tage hinter sich + RSI steigend |

**Darstellung:** eine zusätzliche Kartenzeile `RSI 38 · −12,4 % v. Hoch · ▲ SMA200 · Boden`, Tooltip und Panel-Fußzeile („keine Anlageberatung“, §9). Kein nennenswerter Platzverbrauch, keine zusätzlichen Requests.

**SMA50/SMA200-Cross (v0.7.0):** `detectCross(hist)` erkennt Golden Cross (SMA50 steigt über SMA200, bullisch) und Death Cross im 65-Tage-Fenster (braucht ≥ 201 Tagesschlüsse, sonst keine Aussage). Reine Anzeige-Info, floss nie in den Score ein. Signal-Zeile zeigt `✚ Golden Cross (12.08.)` bzw. `✖ Death Cross (…)`; der Fullscreen-Chart zeichnet beide SMA-Linien mit gemeinsamer Skala plus Legende, sodass der Schnittpunkt sichtbar ist.

**SMA-Abstand mit historischer Einordnung (v0.9.0):** `gapStats(hist, price, n)` zeigt je Karte `SMA50 Wert (+Lücke %, Urteil)` und `SMA200 …`. Die Lücke `(Kurs/SMA−1)×100` wird gegen ihre eigene ~12-Monats-Verteilung gelegt (Z-Score): |z|<1 `normal`, <2 `auffällig`, ≥2 `extrem`, unter 60 Lücken kein Urteil (`–`). Mindeststreuung 0,2 Prozentpunkte verhindert absurde z-Werte in phasenruhigen Lücken. Rot/ocker nur bei auffällig/extrem — sonst bewusst grau, damit Normalität nicht nach Warnung aussieht.

**Tests:** Unit-Tests mit synthetischen Reihen (RSI-/Drawdown-Ordnung Rebound vs. Parabel, Bodenbildungs-Fixture, Golden/Death/kein Cross, kurze Historie ⇒ `null`).

**Offen:** Validierung am echten Verlauf (Backtest), Sentiment-Quellen (derzeit bewusst keine, L&S-only-Regel).

## 11. Entwicklung unter Windows

Ziel: ohne macOS/Linux-Abhängigkeiten arbeiten. Es werden nur Node.js (LTS), Git und Chrome oder Edge mit Tampermonkey benötigt. Kein WSL erforderlich.

### 11.1 Voraussetzungen

1. Node.js LTS installieren (inkl. npm), z. B. von nodejs.org. Danach in PowerShell prüfen:

   ```powershell
   node --version
   npm --version
   ```

2. Git installieren und prüfen:

   ```powershell
   git --version
   ```

3. Chrome oder Edge + Erweiterung Tampermonkey (stable, kein Beta) installieren.
4. Optional: VS Code mit Erweiterungen ESLint + Prettier.

### 11.2 Einmaliges Projekt-Setup

```powershell
git clone <repo-url> ls-mobile-dashboard
cd ls-mobile-dashboard
npm install
```

`package.json` enthält bewusst nur Dev-Abhängigkeiten. Vorgeschlagener Minimalinhalt:

```json
{
  "name": "ls-mobile-dashboard",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test test/",
    "lint": "node --check src/*.js && node --check ls-mobile-dashboard.user.js",
    "build": "node scripts/build.js"
  }
}
```

Kein Bundler-Zwang. `scripts/build.js` konkateniert bei Bedarf `src/*.js` in die eine Release-Datei `ls-mobile-dashboard.user.js` (Header mit `@match`, Version, kein CDN, keine `GM_*`-APIs). Solange es kein Build-Skript gibt, ist `ls-mobile-dashboard.user.js` direkt die Quelle.

### 11.3 Arbeitsablauf

1. Logik in `src/` ändern (kleine, reine Funktionen: Adapter-Normalisierung, Vergleichsrechnung, Scheduler-Backoff).
2. `npm test` laufen lassen.
3. Bei Bedarf `npm run build` ausführen.
4. In Tampermonkey neues Skript anlegen, Inhalt der lokalen `ls-mobile-dashboard.user.js` einfügen, speichern (`Strg+S`), L&S-Seite neu laden.
5. Debuggen mit F12-DevTools (Konsole, Netzwerk-Tab).

Es wird kein lokaler Webserver benötigt, außer für den manuellen Harness (Abschnitt 12.3).

### 11.4 Debugging-Tipps (Windows)

- Tampermonkey-Dashboard → Skript auf `Aktiviert` prüfen, `@match`-URL mit tatsächlich geöffneter L&S-URL abgleichen.
- F12 → Konsole: nach `[LS-Dashboard]`-Logs filtern.
- F12 → Netzwerk: L&S-JSON-Endpunkte auf Status, Cache-Header und Antwortformat prüfen, Ergebnis in `docs/data-sources.md` und als Fixture unter `test/fixtures/` ablegen.
- Sichtbarkeitslogik testen via DevTools → Rendering → Visibility oder Tab in Hintergrund schieben.

## 12. Testen unter Windows

Drei Stufen: (A) automatisierte Unit-Tests ohne Browser, (B) Adapter-Liveprüfung, (C) manueller UI-Test im Browser.

### 12.1 A: Unit-Tests (ohne Browser, ohne Tampermonkey)

Läuft rein mit Node-Bordmitteln (`node:test` + `node:assert`), keine zusätzlichen Downloads nötig.

```powershell
npm test
# gezielt:
node --test test/adapter.test.js
node --test test/comparison.test.js
```

Abgedeckt werden müssen mindestens:

- `test/adapter.test.js`: Normalisierung von `getQuote`/`getHistory` anhand `test/fixtures/*.json`; Felder Bid, Ask, Last, Zeit; unbekannte ISIN; geändertes Antwortformat → verständlicher Fehler.
- `test/comparison.test.js`: Formel `(wert / startwert - 1) * 100`; gemeinsamer Startzeitpunkt; fehlende Werte werden als Lücke markiert, nicht interpoliert; max. 6 Linien.
- `test/store.test.js` (optional): Scheduler-Backoff, Kursalter-Berechnung, Watchlist-Import/Export-Schema.

Fixtures sind anonymisierte, gespeicherte L&S-Antworten (keine Live-Abrufe in Tests). Neue Endpunkt-Variante → als neue Fixture ablegen, Test muss fehlschlagen, dann Adapter fixen.

Erfolgskriterium: `npm test` grün, keine Netzwerkzugriffe während der Tests.

### 12.2 B: Adapter-Liveprüfung (einmalig, gedrosselt)

Nicht in `npm test` einbauen, um L&S nicht zu belasten. Manuell in PowerShell:

```powershell
# Beispiel: einen einzelnen Quote-Abruf prüfen (URL aus docs/data-sources.md)
node scripts/probe-endpoint.js --isin DE0005190003 --verbose
```

Das Skript soll URL, Statuscode, Cache-Header, gemessene Latenz und normalisiertes Ergebnis ausgeben. Maximal 1 Anfrage pro 15–30 s, außerhalb der Handelszeiten Wiederholung zur Prüfung des „Markt geschlossen"-Verhaltens.

### 12.3 C: Manueller UI-Test mit Tampermonkey (Windows)

1. Tampermonkey → Dashboard → `+` neues Skript → Inhalt von lokaler `ls-mobile-dashboard.user.js` einfügen → speichern.
2. L&S-Seite öffnen (die in `@match` steht), Seite neu laden.
3. Prüfliste abarbeiten:
   - [ ] Watchlist-Karten rendern mobil (DevTools → Gerätesymbolleiste, z. B. 390×844), kein horizontales Scrollen, Touch-Targets ≥ 44 px.
   - [ ] Bid/Ask, Veränderung, Spread, Datenalter und Statusfarbe + Symbol (nicht nur Farbe) korrekt.
   - [ ] Manuelles Aktualisieren (↻) setzt Takt fort, kein Doppel-Request (Netzwerk-Tab).
   - [ ] Tab in Hintergrund → keine Requests; zurück in Vordergrund → sofort 1 Refresh.
   - [ ] Flugmodus/Offline → roter Fehlerstatus, danach automatische Erholung mit Backoff.
   - [ ] Suche nach ISIN, WKN, Name findet Treffer; unbekannte ISIN → verständliche Meldung.
   - [ ] Einzelchart + Vergleichschart (2–4 Instrumente) mit Basis `0 %`/`100`, Tooltip mit Kurs + Datenzeitpunkt, Lücken bei fehlenden Werten.
   - [ ] Sortierung (Name, Veränderung, Spread, Datenalter), Hell/Dunkel-Umschalter, Export/Import der Watchlist als JSON (Datei speichern/laden, fehlerhaftes JSON → Fehlermeldung).
4. Fehler in Konsole als Screenshot + L&S-Antwort (anonymisiert) in Issue übernehmen.

Alternative ohne L&S-Seite: `test/manual-harness.html` per Doppelklick im Browser öffnen. Die Seite bindet die `src/`-Module mit Mock-Daten ein und zeigt Karten + Charts. Geeignet für UI-Schnelltests ohne Tampermonkey und ohne Netzwerk.

### 12.4 Abnahmekriterien für MVP

- `npm test` läuft unter Windows fehlerfrei durch.
- Manuelle Prüfliste aus 12.3 vollständig bestanden in Chrome und Edge (jeweils aktuelle Version).
- Keine `GM_*`-APIs, kein externes CDN, `@match` nur auf L&S-HTTPS-Seiten.
- Abrufrate 15–30 s eingehalten, keine parallelen Scheduler-Runden, Timeout und Backoff wirksam.
