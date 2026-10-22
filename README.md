# Handball BW

Web-App (PWA) für die Frauen- und Männerligen im Baden-Württembergischen Handball-Verband:
Tabellen, Spielpläne, Live-Spielstände, Spielberichte, Ticker und Statistiken für Teams und Spieler.

Die Saison 2026/27 umfasst **30 Ligen**: jeweils eine Regionalliga, zwei Oberligen, vier Verbandsligen
und acht Landesligen für Frauen und Männer. Die Auswahl wird aus dem aktuellen h4a-Katalog übernommen.
Spielberichte und Spielerstatistiken ergänzen sich schrittweise, sobald geprüfte Berichte vorliegen.

Die Seite ist komplett statisch und läuft kostenlos auf **GitHub Pages**. Ein GitHub-Actions-Workflow holt
regelmäßig die Daten, wertet die Spielberichte aus und veröffentlicht die Seite neu.
Der Build erzeugt für bekannte Ligen, Teams, Spiele und Spieler eigene HTML-Einstiegspunkte,
damit direkte Links und Neuladen auf GitHub Pages regulär mit HTTP 200 funktionieren.

## Aufbau

```
pipeline/   Node-Skripte: Daten von h4a holen, PDF-Spielberichte parsen, Statistiken & Logos, JSON exportieren
shared/     Typen und h4a-Hilfen, die Pipeline und Web-App gemeinsam nutzen
web/        React-App (Vite, Tailwind, PWA)
```

| Was | Woher |
| --- | --- |
| Ligen, Tabellen, Spielpläne | h4a-JSON-Service (`spo.handball4all.de`), dieselbe Quelle wie bwhv.org |
| Aufstellungen, Tore, 7m, Strafen, Spielverlauf | PDF-Spielberichte, von der Pipeline geparst |
| Spielberichte als Text | h4a „Robotext“ |
| Vereinslogos | Vereinsverzeichnis von handball.net |
| Live-Spielstände | die App fragt während laufender Spiele direkt bei h4a nach (ab 20 s, bei vielen gleichzeitig aktiven Ligen seltener) |
| Live-Ticker | h4a-Ticker-Service, mit dem Token (`gToken`), das h4a während eines getickerten Spiels in den Ligadaten mitliefert |

Der BWHV ist auf der neuen handball.net-Plattform nicht mit Spielbetrieb vertreten, deshalb kommen die
Spieldaten von h4a und nur die Logos von handball.net.

### Rücksicht auf h4a

h4a erlaubt keinen massenhaften automatisierten Zugriff ohne Lizenz („may not be mass-accessed by a robot
without a license“). Die Pipeline ist deshalb bewusst sparsam:

- eine Anfrage für den aktuellen Saison- und Ligakatalog; jede Liga wird rund um ihre Spiele aktualisiert,
  außerhalb des Spieltags höchstens alle sechs Stunden,
- neue Ligen benötigen zunächst je eine Anfrage für Tabelle und vollständigen Spielplan; die Zuordnung
  von Mannschaftskürzeln nutzt eindeutige Ergebnisdaten und bekannte Namen, zusätzliche Abfragen sind begrenzt,
- höchstens 120 Detailabfragen, 20 zusätzliche Mannschaftsabfragen und sechs Logo-Suchen pro regulärem Lauf;
  fehlende Berichte und Logos folgen in späteren Läufen,
- mindestens 1,5 s Abstand zwischen Anfragen,
- bei „Too many requests“ enden die h4a-Abfragen sofort; vorhandene Daten bleiben erhalten,
- Vorsaisons werden standardmäßig nicht nachgeladen (`PAST_SEASONS=0`),
- der Workflow läuft am Wochenende alle 30 Minuten von 06–22 UTC, werktags stündlich von 06–22 UTC und zusätzlich einmal morgens.

Tabellen und Ergebnisse aller fälligen Ligen werden **vor** den Detailberichten aktualisiert und fallen
nicht unter das Detailbudget. PDF-Berichte für Spielerstatistiken haben Vorrang vor geschriebenen
Zusammenfassungen; letztere erhalten höchstens 20 der verbleibenden Anfragen. Neue Berichte werden
ligaübergreifend vor älteren Spielen abgearbeitet.

Für eine einmalige Aufholaktion lässt sich der Workflow manuell mit `mode=backfill` starten:
maximal 600 Detailanfragen und 24 Minuten, ausschließlich PDF-Berichte. Danach gelten automatisch
wieder die normalen Grenzen. Anfrageabstände und Abbruch bei Ratenbegrenzung bleiben erhalten.

Nicht abrufbare PDF-Berichte werden frühestens nach sechs Stunden erneut versucht. Berichte, deren
Spieler- oder Verlaufstore nicht zum Ergebnis passen, fließen nicht in Statistiken ein. Der Export
veröffentlicht nur vorhandene Ligen, behält bei einem Fehler den bisherigen API-Stand und zeigt als
Datenstand den tatsächlichen Abrufzeitpunkt an. Ein reiner Export macht alte Daten nicht künstlich aktuell.

Die Live-Funktionen (Spielstand, Ticker, Live-Konferenz) fragen nur aus dem Browser des Nutzers und nur für Spiele,
die gerade angezeigt werden. Ligaanfragen werden mit mindestens 1,5 s Abstand begonnen. Die Konferenz liest die Ticker nacheinander und umso seltener, je mehr Spiele laufen
(höchstens etwa eine Nachrichtenabfrage alle 4 Sekunden); ausgefallene Ticker behalten ihren letzten Stand, eine Ratenbegrenzung beendet den Abrufdurchgang.

Ein explizites Spielende im Ticker bleibt bis zum offiziellen Ergebnis erhalten. Spielzeit wird aus den
gemeldeten Einträgen angezeigt: 60:00 bleibt in der 60. Minute; tatsächliche Verlängerungen bleiben sichtbar.
Die App zeigt verfügbare Endstände auch in der Konferenz und lädt den später veröffentlichten Spielbericht nach.

Die installierte App hält besuchte Daten offline bereit. Neue App-Versionen werden mit einem Update-Hinweis
angeboten, damit keine laufende Ansicht ungefragt neu lädt. Auf iOS erklärt der Installationshinweis den
Weg über Safari und „Zum Home-Bildschirm“.

## Einrichtung auf GitHub

1. Repository (öffentlich) auf GitHub anlegen und diesen Code nach `main` pushen.
2. **Settings → Pages → Build and deployment → Source: „GitHub Actions“** auswählen.
3. **Actions → „Daten aktualisieren und veröffentlichen“ → Run workflow** einmal von Hand starten.
   Der erste Lauf lädt Tabellen und Spielpläne. Berichte werden innerhalb des Zeit- und Anfragebudgets
   schrittweise ergänzt; jeder weitere Lauf setzt die Ergänzung fort.

Die Seite ist dann unter `https://<benutzer>.github.io/<repo>/` erreichbar und lässt sich auf dem Handy über
„Zum Home-Bildschirm“ als App installieren.

Hinweis: GitHub pausiert zeitgesteuerte Workflows in Repos ohne Aktivität für 60 Tage (z. B. in der
Sommerpause). Dann unter **Actions** einfach wieder aktivieren.

## Lokal entwickeln

```sh
npm install
npm run data       # Daten holen und nach web/public/api exportieren
npm run dev        # App auf http://localhost:5173
npm run typecheck
npm test           # Parser (PDF-Spielbericht, Live-Ticker) und Auswertungen gegen gespeicherte Beispiele
npx playwright install chromium
BASE_PATH=/handball-vl/ npm run build
npm run test:e2e    # Desktop, 390-px-Handy, 320-px-Dark-Mode; Live-Ende, Navigation, Offline, Barrierefreiheit
```

Die Browser-Tests nutzen den exportierten Datenstand und simulierte Ticker, ohne die Live-Datenquelle
abzufragen. Vor Veröffentlichungen per Push oder manuellem Workflow laufen zusätzlich Desktop-Browserprüfungen.

`npm run data:export` erzeugt die JSON-Dateien aus dem vorhandenen Datenstand in `data/` vollständig offline neu.

### Konfiguration (Umgebungsvariablen der Pipeline)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `LEAGUE_PATTERN` | `^[MF]-(RL\|OL\|VL\|LL)(-\|$)` | Welche Spielklassen (h4a-Kurzname) verfolgt werden |
| `PAST_SEASONS` | `0` | Vorsaisons, die zusätzlich geladen werden (viele Anfragen, siehe oben) |
| `BUDGET_MINUTES` | `8` | Zeitbudget pro Lauf; nach Ablauf werden keine weiteren Berichte abgerufen |
| `DETAIL_REQUEST_LIMIT` | `120` | Maximale Anzahl von PDF- und Textbericht-Abfragen pro regulärem Lauf |
| `SUMMARY_REQUEST_LIMIT` | `20` | Maximaler Anteil für Textberichte, nachdem PDF-Berichte verarbeitet wurden |
| `TEAM_LOOKUP_LIMIT` | `20` | Maximale Anzahl zusätzlicher Abfragen für unbekannte Mannschaftskürzel |
| `LOGO_LOOKUP_LIMIT` | `6` | Maximale Anzahl von Vereinslogo-Suchen pro Lauf |
| `LEAGUE_REFRESH_MINUTES` | `360` | Aktualisierungsabstand außerhalb des Zeitfensters von 30 Minuten vor bis drei Stunden nach Spielbeginn |
| `DATA_DIR` | `./data` | Datenstand (im Workflow: Branch `data`) |
| `OUT_DIR` | `./web/public/api` | Zielverzeichnis des atomaren JSON-Exports |

### Logos korrigieren

Logos werden per Namensähnlichkeit zugeordnet. Falsche oder fehlende Logos lassen sich in
`data/logo-overrides.json` (im Branch `data`) festlegen – Schlüssel ist der Teamname ohne Mannschaftsnummer:

```json
{ "TVS 1907 Baden-Baden": "https://example.org/logo.png", "Irgendein Team": null }
```

Das App-Icon entsteht aus `web/public/icon.svg` mit `npm run icons`.
