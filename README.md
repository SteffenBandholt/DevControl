# DevControl

DevControl ist ein kleines lokales Leitstand-Tool fuer kontrollierte Entwicklungs-, Refactoring-, Bugfix- und Cleanup-Pakete.

## Was diese ZIP schon kann

- lokales Web-UI unter `http://localhost:3210`
- Aufgabenpakete anlegen
- aktives Projekt auf Pfad und Agents.md prüfen
- Regeln aus `Agents.md` und Projektprofil laden
- Planner-Ausgabe erzeugen
- Paketlauf starten
- mehrere interne Mini-Schritte in einer Schleife abarbeiten
- Reviews protokollieren
- Abschlussbericht schreiben
- JSON-Dateien lokal speichern

## Was du lokal noch brauchst

- **Node.js 18+**
- optional **Codex CLI**, wenn DevControl wirklich Codex ausfuehren soll
- optional **OPENAI_API_KEY**, wenn Planner und Reviewer ueber die OpenAI Responses API laufen sollen

Ohne API-Key arbeitet DevControl mit einem eingebauten Fallback-Planer/Reviewer.
Ohne Codex CLI bleibt die Ausfuehrung bewusst blockiert, statt still irgendwas vorzutäuschen.

## Schnellstart

1. ZIP nach `C:\01_Projekte\DevControl` entpacken
2. Im Ordner `C:\01_Projekte\DevControl` Terminal oeffnen
3. Abhaengigkeiten installieren:
   ```powershell
   npm install
   ```
4. Projekte direkt in der Oberfläche anlegen oder `config\projects.json` nutzen
5. optional `.env` anlegen:
   ```text
   OPENAI_API_KEY=dein_key
   PORT=3210
   ```
6. Starten:
   ```powershell
   npm start
   ```

Dann im Browser oeffnen:
```text
http://localhost:3210
```

## Codex CLI

OpenAI beschreibt `codex exec` offiziell als non-interactive Modus fuer Skripte und CI. Das ist genau die Basis, die DevControl im MVP verwendet. citeturn218357search1turn218357search4

## Responses API / Structured Outputs

Planner und Reviewer sind auf die Responses API und schemaartige JSON-Ausgaben ausgelegt. Die Responses API ist die empfohlene aktuelle Schnittstelle fuer neue Projekte; Structured Outputs sorgen dafuer, dass das Modell nicht frei labert, sondern strukturiert antwortet. citeturn218357search0

## Wichtige Dateien

- `app/server.js` - Webserver
- `app/packageLoop.js` - Paket-Schleife
- `app/planner.js` - Planner
- `app/reviewer.js` - Reviewer
- `app/executor.js` - Codex-Ausfuehrung
- `config/project.profile.json` - Pfad zu deinem echten Projekt
- `config/appsettings.json` - Grundeinstellungen
- `config/review-rules.md` - Review-Massstab

## Ehrlich dazu

Das ist ein **brauchbarer MVP**, kein perfektes Endsystem.

Es nimmt dir schon viel Botendienst ab:
- Paket schneiden
- Regeln einsammeln
- Schritte ableiten
- Reviews schreiben
- Abschlussbericht erzeugen

Aber:
- du musst dein Projektprofil einmal korrekt eintragen
- fuer echte Modellaufrufe brauchst du einen API-Key
- fuer echte Codex-Laeufe brauchst du die Codex CLI lokal

## Lizenz / Nutzung

Frei fuer deinen eigenen internen Gebrauch.


## Neu in dieser Version

- Planner-Vorschau: Erst **Paket vorschlagen**, dann **Vorschlag übernehmen**.
- Pakete werden nicht sofort blind gespeichert.
- Der Planner zeigt Ziel, Scope, Nicht-Anfassen, Regeln, Erfolgskriterien und den ersten internen Schritt vor dem Speichern an.
