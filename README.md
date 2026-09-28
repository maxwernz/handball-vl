# Handball VL

Web-App (PWA) für die Männer-Verbandsligen im Baden-Württembergischen Handball-Verband:
Tabellen, Spielpläne, Live-Spielstände, Spielberichte, Ticker und Statistiken für Teams und Spieler.

Die Seite ist komplett statisch und läuft kostenlos auf **GitHub Pages**. Ein GitHub-Actions-Workflow holt
regelmäßig die Daten, wertet die Spielberichte aus und veröffentlicht die Seite neu.

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
| Live-Spielstände | die App fragt während laufender Spiele direkt bei h4a nach (alle 20 s) |

Der BWHV ist auf der neuen handball.net-Plattform nicht mit Spielbetrieb vertreten, deshalb kommen die
Spieldaten von h4a und nur die Logos von handball.net.

### Rücksicht auf h4a

h4a erlaubt keinen massenhaften automatisierten Zugriff ohne Lizenz („may not be mass-accessed by a robot
without a license“). Die Pipeline ist deshalb bewusst sparsam:

- ein Lauf fragt nur Saisonübersicht und Ligen ab (≈ 6 Anfragen) plus Berichte neu beendeter Spiele,
- mindestens 1,5 s Abstand zwischen Anfragen,
- bei „Too many requests“ bricht der Lauf sofort ab und veröffentlicht den bisherigen Stand,
- Vorsaisons werden standardmäßig nicht nachgeladen (`PAST_SEASONS=0`),
- der Workflow läuft an Spieltagen alle 30 Minuten, sonst selten.

## Einrichtung auf GitHub

1. Repository (öffentlich) auf GitHub anlegen und diesen Code nach `main` pushen.
2. **Settings → Pages → Build and deployment → Source: „GitHub Actions“** auswählen.
3. **Actions → „Daten aktualisieren und veröffentlichen“ → Run workflow** einmal von Hand starten.
   Der erste Lauf lädt alle Spielberichte der Saison und kann einige Minuten dauern; reicht die Zeit nicht,
   macht der nächste Lauf weiter.

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
```

`npm run data:export` erzeugt die JSON-Dateien neu aus dem vorhandenen Datenstand in `data/`, ohne h4a zu fragen.

### Konfiguration (Umgebungsvariablen der Pipeline)

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `LEAGUE_PATTERN` | `^M-VL` | Welche Spielklassen (h4a-Kurzname) verfolgt werden, z. B. `^M-(VL\|LL)` |
| `PAST_SEASONS` | `0` | Vorsaisons, die zusätzlich geladen werden (viele Anfragen, siehe oben) |
| `BUDGET_MINUTES` | `20` | Zeitbudget pro Lauf für Spielberichte |
| `DATA_DIR` | `./data` | Datenstand (im Workflow: Branch `data`) |

### Logos korrigieren

Logos werden per Namensähnlichkeit zugeordnet. Falsche oder fehlende Logos lassen sich in
`data/logo-overrides.json` (im Branch `data`) festlegen – Schlüssel ist der Teamname ohne Mannschaftsnummer:

```json
{ "TVS 1907 Baden-Baden": "https://example.org/logo.png", "Irgendein Team": null }
```

Das App-Icon entsteht aus `web/public/icon.svg` mit `npm run icons`.
