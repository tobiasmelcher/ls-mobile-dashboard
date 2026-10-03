# L&S Mobile Dashboard

Mobiles Kurs-Dashboard als Userscript (Tampermonkey) für [Lang & Schwarz](https://www.ls-tc.de) — Tagesveränderungen, 1M/3M/6M/1J-Performance, Mini- und Fullscreen-Charts, technische Signale (RSI, SMA-Abstand, Golden/Death Cross), Suche nach ISIN/WKN/Name, Auto-Refresh. Nur L&S-Daten, keine Fremdquellen, keine Tracker.

## Installation (Edge/Chrome)

1. Tampermonkey (stable) aus dem Browser-Add-on-Store installieren, in Edge zusätzlich „Benutzerskripts zulassen“ aktivieren (`edge://extensions/` → Details).
2. Neues Userscript erstellen, Inhalt von `ls-mobile-dashboard.user.js` einfügen, speichern.
3. `https://www.ls-tc.de/de/` öffnen (ggf. L&S-Disclaimer akzeptieren) → Button **L&S Dashboard**.

## Mobilgeräte

### Android

Chrome für Android unterstützt **keine** Erweiterungen — daher Firefox (oder einen Chromium-Fork mit Erweiterungs-Support) verwenden.

**Variante A (empfohlen): Firefox + Tampermonkey**

1. **Firefox für Android** aus dem Play Store installieren.
2. Menü (⋮) → **Add-ons** → **Add-ons entdecken** → nach **Tampermonkey** suchen → installieren.
3. Tampermonkey-Symbol → **Dashboard** → **+** (neues Skript).
4. Kompletten Inhalt von `ls-mobile-dashboard.user.js` einfügen → speichern (Disketten-Symbol), aktiviert lassen.
5. `https://www.ls-tc.de/de/` öffnen, ggf. L&S-Disclaimer akzeptieren → Button **L&S Dashboard**.

**Variante B: Kiwi Browser + Tampermonkey**

1. **Kiwi Browser** installieren (Chromium mit Erweiterungs-Support).
2. `chrome.google.com/webstore` öffnen → **Tampermonkey** installieren.
3. Weiter wie ab Schritt 3 oben.

**Hinweise Android**

- Das Dashboard ist als Fullscreen-Overlay fürs Smartphone optimiert.
- Android pausiert Browser-Tabs im Hintergrund teils aggressiv (Stromsparmodus) → nach Rückkehr lädt das Skript automatisch einmal neu.
- Abruftakt Standard 20 s; bei vielen Werten mobile Daten beachten.

### iOS (iPhone/iPad)

Safari unterstützt seit iOS 15 Erweiterungen. Empfohlen: die kostenlose Open-Source-App **Userscripts** (Alternative: Tampermonkey für Safari).

1. Aus dem App Store **Userscripts** installieren.
2. **Einstellungen** → Apps → **Safari** → **Erweiterungen** → **Userscripts** aktivieren und Zugriff auf `ls-tc.de` erlauben („Immer erlauben“).
3. Skript per Link installieren (empfohlen): In **Safari** diese URL öffnen:
   `https://raw.githubusercontent.com/tobiasmelcher/ls-mobile-dashboard/main/ls-mobile-dashboard.user.js`
   Danach das **Puzzleteil-Symbol** (Adressleiste) → **Userscripts** antippen → Installationsdialog bestätigen. Fertig — bei Updates den Link einfach erneut öffnen.
4. **Safari** → `https://www.ls-tc.de/de/` öffnen, ggf. L&S-Disclaimer akzeptieren.
5. Puzzleteil-Symbol → **Userscripts** → Skript ist aktiv → Button **L&S Dashboard** erscheint.

**Alternative ohne Link:** Userscripts-App öffnen → **+** → kompletten Inhalt von `ls-mobile-dashboard.user.js` einfügen → speichern, Skript aktiviert lassen.

**Hinweise iOS**

- iOS pausiert Hintergrund-Tabs: **kein** Hintergrund-Refresh möglich. Nach Rückkehr in den Vordergrund lädt das Dashboard automatisch neu.
- Bei Problemen: Einstellungen → Safari → Erweiterungen prüfen, Seite neu laden.
- Tippfehler beim Einfügen vermeiden: Datei am PC öffnen und z. B. per iCloud/Notizen aufs iPhone übertragen.

## Entwicklung & Test (Windows)

```powershell
node --check ls-mobile-dashboard.user.js   # Syntax
node --test test/                          # Tests (node:test, keine Deps)
```

Details: `plan.md`, Datenquellen: `docs/data-sources.md`.

## Hinweis

Informationsanzeige, **keine Anlageberatung**, keine Orderausführung. Kurse können von verbindlichen Handelskursen abweichen. Abrufrate bitte moderat halten (Standard: 20 s).
