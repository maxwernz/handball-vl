import { useMemo } from 'react';
import { rows } from '../db.ts';
import { DataTable, Section } from '../components.tsx';
import { gamesInScope } from '../scope.ts';
import type { ViewProps } from './types.ts';

export function Games({ f }: ViewProps) {
  const games = useMemo(() => rows(`WITH g AS (${gamesInScope(f)}),
    ev AS (SELECT e.*, LAG(e.home_score - e.guest_score) OVER (PARTITION BY e.game_id ORDER BY e.seq) AS prev_diff
           FROM events e WHERE e.type IN ('goal','sevenGoal') AND e.game_id IN (SELECT id FROM g)),
    flow AS (SELECT game_id,
        SUM(prev_diff IS NOT NULL AND ((prev_diff <= 0 AND home_score - guest_score > 0) OR (prev_diff >= 0 AND home_score - guest_score < 0))) AS changes,
        MAX(home_score - guest_score) AS max_home, MIN(home_score - guest_score) AS max_guest FROM ev GROUP BY game_id),
    x AS (SELECT game_id,
        SUM(type IN ('twoMinutes','disqualification') AND side = 'home') AS hp, SUM(type IN ('twoMinutes','disqualification') AND side = 'guest') AS gp,
        SUM(type IN ('sevenGoal','sevenMiss') AND side = 'home') AS h7, SUM(type IN ('sevenGoal','sevenMiss') AND side = 'guest') AS g7,
        SUM(type = 'timeout') AS timeouts FROM events WHERE game_id IN (SELECT id FROM g) GROUP BY game_id)
    SELECT g.date AS Datum, g.weekday AS Tag, substr(g.kickoff, 12) AS Zeit, l.short AS Liga, g.round AS ST, g.home AS Heim, g.guest AS Gast,
      g.home_goals AS H, g.guest_goals AS G, g.home_goals_ht AS "H HZ", g.guest_goals_ht AS "G HZ", g.home_goals + g.guest_goals AS Tore, g.home_goals - g.guest_goals AS Diff,
      flow.changes AS Führungswechsel, flow.max_home AS "max. Heim-Führung", -flow.max_guest AS "max. Gast-Führung",
      x.hp AS "Strafen H", x.gp AS "Strafen G", x.h7 AS "7m H", x.g7 AS "7m G", x.timeouts AS Auszeiten,
      g.spectators AS Zuschauer, g.referees AS Schiedsrichter, g.town AS Ort, g.has_report AS Bericht, g.game_no AS Spielnr
    FROM g JOIN leagues l ON l.id = g.league_id LEFT JOIN flow ON flow.game_id = g.id LEFT JOIN x ON x.game_id = g.id
    ORDER BY g.kickoff DESC`), [f]);
  return (
    <Section title="Spiele" note="Beendete Spiele ohne Wertungen/Absagen. Führungswechsel, Strafen und 7m nur mit Spielbericht. Spielnr = Phönix-Videoportal.">
      <DataTable name="spiele" rows={games} limit={150} maxHeight={700} />
    </Section>
  );
}
