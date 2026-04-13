Kurz: DevControl Repo Arbeitsregeln für Codex

- Was DevControl ist
  - Lokale Browser-App zur Paket-/Projektsteuerung (Node/Express + statische UI).
  - Wichtige Ordner: `app/`, `public/`, `config/`, `data/`.

- Startbefehl
  - `npm start` (im Repo-Root).

- Arbeitsregeln für Codex
  - Arbeite ausschließlich im Repo `C:\01_Projekte\DevControl`.
  - Erst lesen, dann ändern; immer Kontext prüfen.
  - Nur eine Baustelle pro Auftrag bearbeiten.
  - Keine Blind-Patches; kleine, nachvollziehbare Änderungen.
  - Keine neuen Fix-Skripte als Dauerlösung einführen.
  - Keine fachfremden Änderungen an Funktionen, die nicht ausdrücklich angefragt wurden.
  - Am Ende eines Tasks immer einen kurzen Bericht liefern mit:
    - gelesene Dateien
    - geänderte Dateien
    - durchgeführte Prüfungen (z. B. `node --check`, API-Calls)
    - offene Risiken und Empfehlungen

- Definition von „fertig"
  - Mindestens eine passende Prüfung (z. B. `node --check` für geänderte JS-Dateien) wurde ausgeführt.
  - Keine Erfolgsmeldung ohne echten Prüfungsnachweis.
  - Offene Risiken klar benannt.
