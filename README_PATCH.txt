DevControl timeout/reset patch

Nur den INHALT dieser ZIP nach C:_Projekte\DevControl kopieren.
config/ und data/ nicht ersetzen.

Ziel des Patches:
- wartende Aktionen laufen nicht endlos sichtbar weiter
- Fetch-Aufrufe haben Zeitlimits
- bei Zeitüberschreitung wird der UI-Zustand sauber beendet
- sichtbare Fehlermeldung statt ewiges "Bitte warten"
