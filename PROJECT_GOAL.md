Kurz: Zielbild und Kernflüsse von DevControl

- Was DevControl ist
  - Ein lokales Steuerwerkzeug zur Planung und Ausführung von Code-Paketen.

- Hauptziel für den Nutzer
  - Projekte verwalten, Paketvorschläge erstellen und Pakete sicher ausführen.

- Hauptfunktionen
  - Projektliste laden und wählen
  - Projekt anlegen und speichern
  - Paket vorschlagen, prüfen und speichern
  - Lauf/Run starten und protokollieren
  - App kontrolliert beenden

- Klare Nicht-Ziele
  - Keine CI/CD-Integration, kein Remote-Deployment
  - Keine vollständige Dateisystemverwaltung (nur lokale Helfer)

- Kernflüsse, die stabil laufen müssen
  1. Projektliste laden
  2. Projekt anlegen
  3. Aktives Projekt eindeutig setzen
  4. Projektvalidierung ohne Absturz
  5. Paketvorschau erzeugen
  6. Paket speichern
  7. Paketliste zum aktiven Projekt korrekt anzeigen
  8. Beenden (controlled shutdown)
