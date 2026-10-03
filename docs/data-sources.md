# L&S-Datenquellen (verifiziert 03.10.2026)

Basis: `https://www.ls-tc.de`. Alle Angaben per Direktabruf verifiziert; Desktop-Browser war in dieser Session nicht verbunden, daher sind POST-Details zu `pushtable`/`statistik` noch per DevTools (F12 → Netzwerk) nachzuholen.

## 1. Instrumentensuche (ISIN/WKN/Name → ID)

```text
GET /_rpc/json/.lstc/instrument/search/main?q={query}&localeId=de
```

Antwort: JSON-Array, je Eintrag u. a. `id` (= `instrumentId`), `displayname`, `isin`, `wkn`, `categoryId`, `categorySymbol`/`categoryName`, `link`.

Verifizierte Beispiele:

| Query | Treffer (Auswahl) |
|---|---|
| `IE00BK5BQT80` | `1045625`, VANG.FTSE A.W. DLA, ETF, `/de/etf/1045625` |
| `bitcoin` | `3477757` Bitcoin (BTC), CUR/Währung, `LS000LSOBTC1`, `/de/waehrung/3477757`; dazu BTC-ETNs/ETPs (z. B. `982480`) |
| `Brent` | `70577` BRENT OIL, RES/Rohstoff, `LS000IOIL003`, `/de/rohstoff/70577` |
| `MSCI World` | div. ETFs (z. B. `51797` DBX1MW, `791770` A1C9KK) |
| `EURO STOXX 50` | `46331` ETFL02 (ETF), `53594`, `1107236` |
| `Nasdaq` | `42380` A0F5UF (iShares Nasdaq-100-ETF), weitere |
| `Nikkei` | `54395` A0YEDQ, `60359` DBX0NJ |

Leere Antwort `[]` bei: `Nasdaq 100` (mit „100“), `EURUSD`, `Euro Dollar`. Rohstoff-Spots wie Gold findet die Suche nicht per Name — Direktseiten nutzen:

| Seite | Item | ISIN / WKN |
|---|---|---|
| `/de/rohstoff/goldpreis` | `70586@1` | `LS000IGOLD01` / `965515` |
| `/de/rohstoff/silberpreis` | `70580@1` | (analog prüfen) |
| `/de/rohstoff/oelpreis` | `70577@1` | `LS000IOIL003` |
| `/de/waehrung/bitcoin-btc` | `3477757@1` | `LS000LSOBTC1` |
| `/de/index/lus-indikation` | `70595@1` | L&S Indikation |

Item-Format für Push-Tabellen: `{instrumentId}@1` (`@1` = marketId 1).

## 2. Chart / Historie (Intraday + Verlauf + Vortag)

Seiten-Code (`showInstrumentInChart`): Initialaufruf mit `("1045625", 1, "mid", "intraday,history,flags", "")`.

```text
GET /_rpc/json/instrument/chart/dataForInstrument
  ?container=chart1&instrumentId=1045625&marketId=1&quotetype=mid
  &series=intraday,history,flags&type=&localeId=de
```

Antwort (gekürzt, für `1045625` und `3477757` verifiziert):

```json
{
  "info": { "isin": "IE00BK5BQT80",
    "plotlines": [{ "label": "Vortag 171,290", "value": 171.29, "id": "previousDay" }] },
  "container": "chart1",
  "series": {
    "intraday": { "id": "1045625midi", "timeline": "intraday",
      "data": [[1791021600000, 171.29], [1791022140000, 171.29]] },
    "history": { "id": "1045625midh", "timeline": "history",
      "data": [[1582070400000, 81.93], [1582156800000, 81.43]] }
  }
}
```

Verwendung im Adapter: letzter `intraday`-Punkt = aktueller Mid; `plotlines[0].value` = Vortagesschluss (Basis Tagesveränderung); `history` = Langfristreihe. BTC-Antwort enthält ~500 Intraday-Punkte (Minutenraster) und ~450 Tagespunkte ab Dez 2024.

## 3. Live-Push via Lightstreamer (optional, nicht MVP)

- Host: `push.ls-tc.de`, Port `443` (Seiten-Variablen `domain`/`port`), Adapter `WALLSTREETONLINE`
- Client-Lib: `/assets/_shared/js/lightstreamer/lightstreamer.js`, Logik: `/assets/_shared/js/lightstreamer/push.js`
- Subscription: `MERGE` auf Items `{instrumentId}@1`, Datenadapter `QUOTE`, Felder u. a. `bid/ask/mid`, `bidSize/askSize`, `bidTime/askTime/midTime`, `*Perf1d`, `*Perf1dRel` (Varianten `WithCurrencySymbol`/`WithPercentSign` werden clientseitig abgeleitet)
- Warnung: direkter Session-Aufbau außerhalb des Browsers (`/lightstreamer/create_session.js` + Websocket-Bind) schlug in einem Fremdprojekt fehl (`setPhase…;retry();`). MVP nutzt daher `_rpc`-Polling alle 15–30 s; Push nur als spätere Optimierung innerhalb des Userscripts.

## 4. Noch per DevTools zu dokumentieren

- `POST /_rpc/json/instrument/base/statistik` mit `{ inst_id, catId }` (wird beim Seitenaufruf abgesetzt)
- `data-rpc="/_rpc/json/instrument/pushtable/result"` (Trades-/Quotes-Tabellen, mit `data-configid`, `data-type`, `data-limit`)
- `GET /_rpc/json/.lstc/instrument/search/footer` (Unterschied zu `search/main`)
- `GET /_rpc/html/.lstc/instrument/list/base` (Listenseiten)
- Cache-Header, Ratelimits, Verhalten außerhalb der Handelszeiten und bei unbekannten IDs

## 5. Nutzungskonvention für den Adapter

- `getInstrument(query)` → Suche oben; bei `[]` verständlicher Fehler „nicht bei L&S gefunden“
- `getQuote(id)` (MVP) → Chart-Endpunkt, `series=intraday`, letzter Punkt + Vortags-Plotline; Zeit = Punkt-Zeitstempel, nicht Abrufzeit
- `getHistory(id, range)` → Chart-Endpunkt, `series=intraday,history(,flags)`; Lücken nicht interpolieren
- Spots (Gold/Brent/BTC) direkt über ihre IDs; keine Fremdquellen beimischen
