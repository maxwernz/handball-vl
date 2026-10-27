# Handball-BW-Analysedatenbank (SQLite)

Daten der Handball-Ligen Baden-Württembergs (Regionalliga bis Landesliga, Männer und Frauen) aus den
offiziellen h4a-Spielberichten. Nur Lesen. Abfragen mit SQLite-SQL über das Werkzeug `query`.

## Grundregeln

- **Zeiten** sind Spielzeit, nicht Uhrzeit: `t` in Sekunden (0–3600, Verlängerung darüber), `clock` als `MM:SS`,
  `minute` = laufende Spielminute (1–60), `half` = 1, 2 oder 3 (Verlängerung). 2. Halbzeit beginnt bei `t = 1800`.
- **Ids** von Teams, Ligen und Spielen gelten nur innerhalb einer Saison. Teams gehören genau einer Liga an;
  dieselbe Vereinsmannschaft hat in jeder Saison eine neue Id.
- **Teamnamen** in `teams.name` sind die vollen Namen (z. B. „TSV Bönnigheim“). Suche immer mit
  `LIKE '%bönnigheim%'` und prüfe, ob mehrere Teams passen (z. B. „TSV Bönnigheim 2“, Männer und Frauen).
- **Ligen**: `leagues.short` z. B. `M-VL-4-BW` = Männer-Verbandsliga Staffel 4. `gender` = 'Männer'/'Frauen',
  `level` = 'RL' (Regionalliga), 'OL' (Oberliga), 'VL' (Verbandsliga), 'LL' (Landesliga), `level_rank` 1–4, `staffel` = Nummer.
- **Ereignisdaten** gibt es nur für Spiele mit Spielbericht (`games.has_report = 1`). Ergebnisse und Tabellen gibt es für alle Spiele.
- Nicht im Spielbericht und daher **nicht auswertbar**: Fehlwürfe aus dem Feld, Paraden, technische Fehler,
  Wurfpositionen, Spielzüge. Bekannt sind Tore, 7m (Tor und Fehlwurf), Verwarnungen, 2 Minuten, Disqualifikationen, Auszeiten.
- **Über-/Unterzahl** ist aus den Strafen berechnet: jede 2-Minuten-Strafe und jede Disqualifikation nimmt einem Team
  für 2 Minuten Spielzeit einen Spieler. Rot nach der dritten Zeitstrafe zählt einmal, 2+2 zählt als 4 Minuten.
  Es ist eine Rekonstruktion; Unschärfen sind bei Strafen kurz vor dem Ende möglich.

## Tabellen

### seasons
`id`, `name` (z. B. '2026/27'), `is_current` (1/0).

### leagues
`id`, `season_id`, `short`, `name`, `gender`, `level`, `level_rank`, `staffel`, `data_updated` (Stand laut h4a).

### teams
`id`, `league_id`, `name`, `short_name` (Kürzel aus dem Spielplan).

### standings — aktuelle Tabelle
`league_id`, `team_id`, `rank`, `played`, `won`, `drawn`, `lost`, `goals_for`, `goals_against`, `goal_diff`, `points`, `points_against`.

### games — ein Spiel pro Zeile
`id`, `league_id`, `season_id`, `round` (Spieltag), `kickoff` ('YYYY-MM-DD HH:MM', Ortszeit), `date`, `weekday` ('Mo'…'So'),
`status` ('scheduled', 'live', 'finished'), `home_id`, `guest_id`, `home`, `guest`, `home_goals`, `guest_goals`,
`home_goals_ht`, `guest_goals_ht` (Halbzeit), `venue`, `town`, `comment`, `has_report`, `spectators`, `referees`,
`duration` (Spielzeit in Sekunden laut Bericht, ≥ 3600), `game_no` (h4a-Spielnummer, z. B. '901216'; dieselbe Nummer
nutzen das Phönix-Videoportal und der Tacticut-MCP).

### team_games — jedes Spiel aus Sicht beider Teams (2 Zeilen pro Spiel)
`game_id`, `league_id`, `team_id`, `team`, `opponent_id`, `opponent`, `is_home`, `kickoff`, `round`, `status`,
`goals_for`, `goals_against`, `ht_for`, `ht_against`, `result` ('S' Sieg, 'U' Unentschieden, 'N' Niederlage, NULL wenn nicht beendet), `has_report`.

### players — Spielerzeilen aus dem Spielbericht (eine pro Spieler und Spiel)
`game_id`, `team_id`, `player_key` (saisonweit eindeutig: Team + Name), `no` (Trikotnummer; Offizielle 'A'–'D'),
`name`, `is_official`, `goals`, `seven_goals`, `seven_attempts`, `field_goals` (= goals − seven_goals),
`warning_clock`, `two_minutes` (Anzahl), `two_minutes_clocks` (z. B. '12:31, 48:02'), `disqualification_clock`.

### events — Spielverlauf, jedes Ereignis des Spielberichts
`game_id`, `seq` (Reihenfolge im Spiel, ab 0), `t`, `clock`, `minute`, `half`,
`type`: 'goal' (Feldtor), 'sevenGoal' (7m-Tor), 'sevenMiss' (7m verworfen), 'twoMinutes', 'warning' (Gelb),
'disqualification' (Rot), 'timeout' (Team-Auszeit), 'other' (z. B. Trikotwechsel, Disqualifikation mit Bericht; siehe `text`),
`side` ('home'/'guest'), `team_id` (Team des Ereignisses), `player`, `player_no`, `player_key`,
`home_score`, `guest_score` (Spielstand **nach** dem Ereignis), `home_lead_before` (Heim minus Gast **vor** dem Ereignis),
`home_down`, `guest_down` (Spieler, die dem Team in diesem Moment wegen Strafen fehlen), `text` (nur bei 'other').

### team_events — Ansicht: jedes Ereignis aus Sicht beider Teams (2 Zeilen pro Ereignis)
`game_id`, `seq`, `team_id` (Blickwinkel), `opponent_id`, `t`, `clock`, `minute`, `half`, `type`,
`by_team` (1 = Ereignis dieses Teams, 0 = des Gegners), `player`, `player_no`, `player_key`,
`score_for`, `score_against` (nach dem Ereignis), `lead_before` (eigene Führung vor dem Ereignis, negativ = Rückstand),
`own_down`, `opp_down`, `strength` ('even', 'powerplay' = Überzahl, 'shorthanded' = Unterzahl).
Eigene Tore: `type IN ('goal','sevenGoal') AND by_team = 1`. Gegentore: `... AND by_team = 0`.

### penalties — Zeitstrafen und Disqualifikationen (eine Zeile pro Unterzahl-Auslöser)
`game_id`, `seq` (Ereignis in `events`), `team_id` (bestraftes Team), `opponent_id`, `player`, `player_no`, `player_key`,
`type` ('twoMinutes' oder 'disqualification'), `start_t`, `end_t`, `start_clock`, `end_clock` (bei 2+2 vier Minuten),
`half`, `score_for`, `score_against` (Spielstand aus Sicht des bestraften Teams beim Strafbeginn).

### strength_phases — durchgehende Phasen ungleicher Spielerzahl (aus Sicht beider Teams)
`game_id`, `team_id`, `opponent_id`, `situation` ('shorthanded' = dieses Team in Unterzahl, 'powerplay' = in Überzahl),
`players_difference` (1 oder 2, höchster Wert in der Phase), `start_t`, `end_t`, `start_clock`, `end_clock`, `duration` (Sekunden),
`half`, `goals_for`, `goals_against` (Tore dieses Teams bzw. des Gegners in der Phase), `score_for_start`, `score_against_start`,
`penalized` (bestrafte Spieler des Teams in Unterzahl mit Strafzeitpunkt, z. B. 'David Müller (22:05); Jaron May (23:10, Rot)').
Phasen, in denen beide Teams gleich viele Spieler auf dem Feld haben, sind nicht enthalten. Überschneiden sich zwei
Strafen desselben Teams, ist das eine Phase.

### meta
`key`, `value`: 'data_updated_at' (Datenstand), 'built_at', 'games', 'reports'.

## Beispiele

Unterzahl-Bilanz und Strafen je Team einer Liga:
```sql
SELECT t.name,
  SUM(p.goals_for) AS uz_tore, SUM(p.goals_against) AS uz_gegentore, SUM(p.goals_for) - SUM(p.goals_against) AS uz_diff,
  (SELECT COUNT(*) FROM penalties x WHERE x.team_id = t.id) AS strafen,
  (SELECT COUNT(*) FROM team_games g WHERE g.team_id = t.id AND g.has_report = 1) AS spiele
FROM strength_phases p JOIN teams t ON t.id = p.team_id JOIN leagues l ON l.id = t.league_id
WHERE l.short LIKE 'M-VL-4%' AND p.situation = 'shorthanded'
GROUP BY t.id ORDER BY uz_diff DESC;
```

Alle Unterzahl-Phasen eines Teams mit positiver Bilanz, für Videoanalyse:
```sql
SELECT g.kickoff, g.home, g.guest, p.start_clock, p.end_clock, p.goals_for, p.goals_against, p.penalized
FROM strength_phases p JOIN games g ON g.id = p.game_id JOIN teams t ON t.id = p.team_id
WHERE t.name = 'TSV Bönnigheim' AND p.situation = 'shorthanded' AND p.goals_for > p.goals_against
ORDER BY g.kickoff, p.start_t;
```

Tore in den letzten 5 Minuten bei knappem Spielstand:
```sql
SELECT team_id, COUNT(*) FROM team_events
WHERE type IN ('goal','sevenGoal') AND by_team = 1 AND t >= 3300 AND ABS(lead_before) <= 2 GROUP BY team_id;
```

Für Videozeitpunkte das Werkzeug `video_timestamps` verwenden (rechnet Spielzeit in Videozeit um).
