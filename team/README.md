# Interne Mannschaftsstatistik (`/intern/`)

Passwortgeschützte Statistikseite für die Spvgg Mössingen. Grundlage sind die drei Exporte der
Statistik-App pro Spiel: `score.html` (jede Aktion mit Zeit und Spielstand), `game.html` (Teamwerte,
Endstand) und `players.html` (Spielertabelle).

Alle Werte werden aus dem Aktionsprotokoll berechnet. Die Spielertabelle dient zur Kontrolle: Weichen
Tore, Würfe, Paraden oder Zeitstrafen ab, erscheint beim Upload und am Spiel ein Hinweis. Deshalb
lassen sich Spieler, Team und Spiele für jede Spielauswahl und auch nur für eine Halbzeit auswerten.

## Ablauf

```
Upload-Seite (Browser)                    GitHub Actions „Interne Statistik“        Branch team-data
──────────────────────                    ──────────────────────────────────        ────────────────
3 Dateien → prüfen, Spiel im h4a-          entschlüsselt mit TEAM_UPLOAD_PASSWORD,  games/<id>.enc
Spielplan finden → mit Upload-Passwort  →  prüft, speichert mit TEAM_STORAGE_KEY,   aliases.enc
verschlüsseln → workflow_dispatch           baut bundle.enc mit TEAM_PASSWORD     →  bundle.enc
                                                                                         │
/intern/ lädt bundle.enc von raw.githubusercontent.com und entschlüsselt im Browser ←────┘
```

- Das Repository ist öffentlich, deshalb ist alles in `team-data` verschlüsselt (AES-256-GCM,
  Schlüssel aus dem Passwort per PBKDF2 mit 600 000 Runden). Ohne Mannschafts-Passwort sieht man nichts.
- Die Seite selbst enthält keine Daten. Neue Spiele sind ohne neuen Pages-Build sichtbar, etwa eine
  Minute nach dem Upload.
- Der Upload braucht kein GitHub-Konto. Die Seite enthält einen GitHub-Token, der nur Workflows
  starten darf (fine-grained, nur dieses Repo, „Actions: Read and write“). Er ist mit dem
  Upload-Passwort verschlüsselt in `team/config.json` gespeichert.
- Der Workflow schreibt keine Namen ins Log, denn auch die Logs sind öffentlich.

## Zwei Passwörter

| Passwort | Wer | Wofür |
| --- | --- | --- |
| Mannschafts-Passwort | ganze Mannschaft | Statistiken ansehen |
| Upload-Passwort | Statistiker | Spiele hochladen, löschen, Namen zusammenführen |

## Einrichtung und Pflege

Die Passwörter liegen lokal in `.team-secrets.json`, nicht im Repo.

```sh
npm run intern -- setup                      # einmalig: Passwörter erzeugen (oder --view … --upload … angeben)
npm run intern -- show                       # Passwörter anzeigen
npm run intern -- secrets                    # Passwörter als Actions-Secrets zu GitHub kopieren (gh CLI)
npm run intern -- token                      # GitHub-Token für den Upload hinterlegen, danach committen
npm run intern -- import <ordner> [--api URL] # Spiel lokal importieren (nach .team-data)
npm run intern:dev                           # Seite lokal mit .team-data ansehen
```

Den Token erstellt man unter GitHub → Settings → Developer settings → Fine-grained tokens:

- Repository access: nur `handball-vl`
- Permissions: **Actions: Read and write**, sonst nichts
- Ablaufdatum möglichst lang. Ist er abgelaufen, meldet die Upload-Seite das; dann einen neuen erstellen.

**Passwort ändern:** Mit `npm run intern -- setup --view <neu>` oder `--upload <neu>` ändern, danach
`npm run intern -- secrets` ausführen. Beim Upload-Passwort wird der Token neu verschlüsselt, also
`team/config.json` committen. Anschließend den Workflow „Interne Statistik“ ohne Eingabe starten,
damit `bundle.enc` mit dem neuen Mannschafts-Passwort entsteht. Wer angemeldet war, muss sich neu anmelden.

Gespeicherte Spiele bleiben bei Passwortwechseln lesbar, weil sie mit dem festen `TEAM_STORAGE_KEY`
verschlüsselt sind. Diesen Schlüssel nicht verlieren: Er steht in `.team-secrets.json` und als
Actions-Secret.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `lib/parse.ts` | Parser für die drei Exporte (ohne DOM, läuft im Browser und in Node) |
| `lib/stats.ts` | Auswertung: Team, Spieler, Halbzeiten, Spielphasen, Läufe |
| `lib/match.ts` | Zuordnung zum h4a-Spiel über Endstand und Gegner |
| `lib/crypto.ts` | Verschlüsselung (WebCrypto) |
| `store.ts`, `ingest.ts` | Speichern und Bundle bauen (Workflow) |
| `cli.ts` | lokales Werkzeug |
| `web/` | die Seite (React) |
