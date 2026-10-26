# Analyse mit KI (MCP-Server)

Ein lokaler MCP-Server gibt Claude Code und Codex Lesezugriff auf alle Ergebnisse, Tabellen und Spielberichte
als SQLite-Datenbank. Fragen lassen sich in normaler Sprache stellen, z. B.:

- „Welche Teams der Männer-Verbandsliga 4 haben viele Zeitstrafen, aber eine positive Unterzahl-Bilanz?“
- „Liste alle Unterzahl-Phasen des TSV Bönnigheim (Männer), in denen sie mehr Tore als der Gegner erzielt haben.“
- „Rechne diese Zeitpunkte in Videozeit um: Anpfiff im Video bei 2:30, zweite Halbzeit bei 51:10.“

Der Server fragt **nie** handball4all an. Er liest den Datenstand aus dem Branch `data` dieses Repositorys,
den der GitHub-Workflow ohnehin pflegt.

## Einrichtung

```sh
npm install
npm run analyse:update   # Datenstand holen und analysis/handball.db bauen
```

- **Claude Code**: `.mcp.json` im Projekt meldet den Server an. Beim ersten Start von `claude` hier einmal freigeben.
- **Codex**: einmalig global anmelden (absolute Pfade):
  ```sh
  codex mcp add handball-bw -- "$(which node)" --disable-warning=ExperimentalWarning "$PWD/analysis/server.ts"
  ```

## Werkzeuge

| Werkzeug | Zweck |
| --- | --- |
| `schema` | Tabellen, Spalten, Codes, Grenzen der Daten und Beispiele (siehe `SCHEMA.md`) |
| `query` | lesende SQL-Abfrage (SELECT/WITH), höchstens 5000 Zeilen |
| `video_timestamps` | Spielzeit → Videozeit je Halbzeit, mit Vorlauf und Clip-Ende |
| `update_data` | neuesten Datenstand holen und Datenbank neu bauen |

Die Datenbank wird beim ersten Aufruf gebaut und frischt sich auf, wenn sie älter als drei Stunden ist.
Über- und Unterzahl werden aus den Strafen berechnet (`shared/strength.ts`, dieselbe Logik wie in der App).
