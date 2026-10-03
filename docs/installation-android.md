# Installation auf Android

Chrome für Android unterstützt **keine** Erweiterungen — daher Firefox (oder einen Chromium-Fork mit Erweiterungs-Support) verwenden.

## Variante A (empfohlen): Firefox + Tampermonkey

1. **Firefox für Android** aus dem Play Store installieren.
2. Menü (⋮) → **Add-ons** → **Add-ons entdecken** → nach **Tampermonkey** suchen → installieren.
3. Tampermonkey-Symbol → **Dashboard** → **+** (neues Skript).
4. Kompletten Inhalt von `ls-mobile-dashboard.user.js` einfügen → speichern (Disketten-Symbol), aktiviert lassen.
5. `https://www.ls-tc.de/de/` öffnen, ggf. L&S-Disclaimer akzeptieren → Button **L&S Dashboard**.

## Variante B: Kiwi Browser + Tampermonkey

1. **Kiwi Browser** installieren (Chromium mit Erweiterungs-Support).
2. `chrome.google.com/webstore` öffnen → **Tampermonkey** installieren.
3. Weiter wie ab Schritt 3 oben.

## Hinweise

- Das Dashboard ist als Fullscreen-Overlay fürs Smartphone optimiert.
- Android pausiert Browser-Tabs im Hintergrund teils aggressiv (Stromsparmodus) → nach Rückkehr lädt das Skript automatisch einmal neu.
- Abruftakt Standard 20 s; bei vielen Werten mobile Daten beachten.
