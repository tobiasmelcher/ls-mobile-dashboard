# L&S Mobile Dashboard

Mobiles Kurs-Dashboard als Userscript (Tampermonkey) für [Lang & Schwarz](https://www.ls-tc.de) — Tagesveränderungen, 1M/3M/6M/1J-Performance, Mini- und Fullscreen-Charts, technische Signale (RSI, SMA-Abstand, Golden/Death Cross), Suche nach ISIN/WKN/Name, Auto-Refresh. Nur L&S-Daten, keine Fremdquellen, keine Tracker.

## Installation (Edge/Chrome)

1. Tampermonkey (stable) aus dem Browser-Add-on-Store installieren, in Edge zusätzlich „Benutzerskripts zulassen“ aktivieren (`edge://extensions/` → Details).
2. Neues Userscript erstellen, Inhalt von `ls-mobile-dashboard.user.js` einfügen, speichern.
3. `https://www.ls-tc.de/de/` öffnen (ggf. L&S-Disclaimer akzeptieren) → Button **L&S Dashboard**.

## Mobilgeräte

- **Android:** [docs/installation-android.md](docs/installation-android.md) (Firefox + Tampermonkey; Chrome Android kann keine Erweiterungen).
- **iOS:** [docs/installation-ios.md](docs/installation-ios.md) (Safari-Erweiterung „Userscripts“, kostenlos).

## Entwicklung & Test (Windows)

```powershell
node --check ls-mobile-dashboard.user.js   # Syntax
node --test test/                          # Tests (node:test, keine Deps)
```

Details: `plan.md`, Datenquellen: `docs/data-sources.md`.

## Hinweis

Informationsanzeige, **keine Anlageberatung**, keine Orderausführung. Kurse können von verbindlichen Handelskursen abweichen. Abrufrate bitte moderat halten (Standard: 20 s).
