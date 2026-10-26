// Builds the SQLite database for the analysis MCP server from a data snapshot
// (the layout of the "data" branch: seasons.json, s<season>/league-*.json, reports/<game>.json).

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { playerKey } from '../shared/players.ts';
import { playersDown, shortages, strengthPhases, type Side } from '../shared/strength.ts';
import type { Game, League, MatchEvent, Report } from '../shared/types.ts';

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE seasons (id INTEGER PRIMARY KEY, name TEXT, is_current INTEGER);
CREATE TABLE leagues (id INTEGER PRIMARY KEY, season_id INTEGER, short TEXT, name TEXT, gender TEXT, level TEXT, level_rank INTEGER, staffel INTEGER, data_updated TEXT);
CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT, short_name TEXT);
CREATE TABLE standings (league_id INTEGER, team_id INTEGER, rank INTEGER, played INTEGER, won INTEGER, drawn INTEGER, lost INTEGER,
  goals_for INTEGER, goals_against INTEGER, goal_diff INTEGER, points INTEGER, points_against INTEGER);
CREATE TABLE games (id INTEGER PRIMARY KEY, league_id INTEGER, season_id INTEGER, round INTEGER, kickoff TEXT, date TEXT, weekday TEXT, status TEXT,
  home_id INTEGER, guest_id INTEGER, home TEXT, guest TEXT, home_goals INTEGER, guest_goals INTEGER, home_goals_ht INTEGER, guest_goals_ht INTEGER,
  venue TEXT, town TEXT, comment TEXT, has_report INTEGER, spectators INTEGER, referees TEXT, duration INTEGER);
CREATE TABLE team_games (game_id INTEGER, league_id INTEGER, team_id INTEGER, team TEXT, opponent_id INTEGER, opponent TEXT, is_home INTEGER,
  kickoff TEXT, round INTEGER, status TEXT, goals_for INTEGER, goals_against INTEGER, ht_for INTEGER, ht_against INTEGER, result TEXT, has_report INTEGER);
CREATE TABLE players (game_id INTEGER, team_id INTEGER, player_key TEXT, no TEXT, name TEXT, is_official INTEGER, goals INTEGER,
  seven_goals INTEGER, seven_attempts INTEGER, field_goals INTEGER, warning_clock TEXT, two_minutes INTEGER, two_minutes_clocks TEXT, disqualification_clock TEXT);
CREATE TABLE events (game_id INTEGER, seq INTEGER, t INTEGER, clock TEXT, minute INTEGER, half INTEGER, type TEXT, side TEXT, team_id INTEGER,
  player TEXT, player_no TEXT, player_key TEXT, home_score INTEGER, guest_score INTEGER, home_lead_before INTEGER, home_down INTEGER, guest_down INTEGER, text TEXT);
-- Every event from the point of view of both teams, so questions can be asked per team.
CREATE VIEW team_events AS
SELECT e.game_id, e.seq, s.team_id, s.opponent_id, e.t, e.clock, e.minute, e.half, e.type,
  CASE WHEN e.side IS NULL THEN NULL WHEN e.side = s.side THEN 1 ELSE 0 END AS by_team,
  e.player, e.player_no, e.player_key,
  CASE s.side WHEN 'home' THEN e.home_score ELSE e.guest_score END AS score_for,
  CASE s.side WHEN 'home' THEN e.guest_score ELSE e.home_score END AS score_against,
  CASE s.side WHEN 'home' THEN e.home_lead_before ELSE -e.home_lead_before END AS lead_before,
  CASE s.side WHEN 'home' THEN e.home_down ELSE e.guest_down END AS own_down,
  CASE s.side WHEN 'home' THEN e.guest_down ELSE e.home_down END AS opp_down,
  CASE WHEN (CASE s.side WHEN 'home' THEN e.home_down - e.guest_down ELSE e.guest_down - e.home_down END) > 0 THEN 'shorthanded'
       WHEN e.home_down = e.guest_down THEN 'even' ELSE 'powerplay' END AS strength
FROM events e
JOIN (SELECT id AS game_id, home_id AS team_id, guest_id AS opponent_id, 'home' AS side FROM games
      UNION ALL SELECT id, guest_id, home_id, 'guest' FROM games) s ON s.game_id = e.game_id;
CREATE TABLE penalties (game_id INTEGER, seq INTEGER, team_id INTEGER, opponent_id INTEGER, player TEXT, player_no TEXT, player_key TEXT, type TEXT,
  start_t INTEGER, end_t INTEGER, start_clock TEXT, end_clock TEXT, half INTEGER, score_for INTEGER, score_against INTEGER);
CREATE TABLE strength_phases (game_id INTEGER, team_id INTEGER, opponent_id INTEGER, situation TEXT, players_difference INTEGER,
  start_t INTEGER, end_t INTEGER, start_clock TEXT, end_clock TEXT, duration INTEGER, half INTEGER, goals_for INTEGER, goals_against INTEGER,
  score_for_start INTEGER, score_against_start INTEGER, penalized TEXT);
`;
const INDEXES = `
CREATE INDEX games_league ON games(league_id);
CREATE INDEX team_games_team ON team_games(team_id);
CREATE INDEX team_games_game ON team_games(game_id);
CREATE INDEX players_game ON players(game_id, team_id);
CREATE INDEX players_key ON players(player_key);
CREATE INDEX events_game ON events(game_id, seq);
CREATE INDEX events_team ON events(team_id, type);
CREATE INDEX penalties_team ON penalties(team_id, game_id);
CREATE INDEX phases_team ON strength_phases(team_id, game_id);
`;

export const clock = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
/** 1 and 2 are the halves; 3 stands for any overtime. */
export const half = (t: number) => (t < 1800 ? 1 : t < 3600 ? 2 : 3);
const other = (side: Side): Side => (side === 'home' ? 'guest' : 'home');
const isGoal = (e: MatchEvent) => e.type === 'goal' || e.type === 'sevenGoal';
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function leagueParts(short: string) {
  const m = short.match(/^([MF])-(RL|OL|VL|LL)(?:-Auf)?(?:-(\d+))?/);
  return {
    gender: m?.[1] === 'F' ? 'Frauen' : m?.[1] === 'M' ? 'Männer' : null,
    level: m?.[2] ?? null,
    levelRank: m ? ['RL', 'OL', 'VL', 'LL'].indexOf(m[2]) + 1 : null,
    staffel: m?.[3] ? Number(m[3]) : null,
  };
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

export function buildDatabase(dataDir: string, outFile: string) {
  const index = readJson<{ seasons: { id: number; name: string }[]; current: number; updatedAt: string }>(path.join(dataDir, 'seasons.json'));
  const tmp = `${outFile}.tmp`;
  fs.rmSync(tmp, { force: true });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const db = new DatabaseSync(tmp);
  db.exec(SCHEMA);
  const insert = (table: string, columns: number) => db.prepare(`INSERT INTO ${table} VALUES (${Array(columns).fill('?').join(',')})`);
  const q = {
    meta: insert('meta', 2), season: insert('seasons', 3), league: insert('leagues', 9), team: insert('teams', 4), standing: insert('standings', 12),
    game: insert('games', 23), teamGame: insert('team_games', 16), player: insert('players', 14), event: insert('events', 18),
    penalty: insert('penalties', 15), phase: insert('strength_phases', 16),
  };
  let reports = 0;
  let games = 0;
  db.exec('BEGIN');
  for (const season of index.seasons) {
    const dir = path.join(dataDir, `s${season.id}`);
    if (!fs.existsSync(dir)) continue;
    q.season.run(season.id, season.name, Number(season.id === index.current));
    for (const file of fs.readdirSync(dir).filter((f) => /^league-\d+\.json$/.test(f))) {
      const league = readJson<League>(path.join(dir, file));
      const parts = leagueParts(league.short);
      q.league.run(league.id, season.id, league.short, league.name, parts.gender, parts.level, parts.levelRank, parts.staffel, league.sourceUpdated ?? null);
      for (const team of league.teams) q.team.run(team.id, league.id, team.name, team.short);
      for (const r of league.table) {
        q.standing.run(league.id, r.teamId, r.rank, r.played, r.won, r.drawn, r.lost, r.goalsFor, r.goalsAgainst, r.goalsFor - r.goalsAgainst, r.pointsPlus, r.pointsMinus);
      }
      for (const game of league.games) {
        games++;
        const reportFile = path.join(dataDir, 'reports', `${game.id}.json`);
        const report = fs.existsSync(reportFile) ? readJson<Report>(reportFile) : null;
        if (report) reports++;
        addGame(q, league, season.id, game, report);
      }
    }
  }
  q.meta.run('data_updated_at', index.updatedAt);
  q.meta.run('built_at', new Date().toISOString());
  q.meta.run('games', String(games));
  q.meta.run('reports', String(reports));
  db.exec('COMMIT');
  db.exec(INDEXES);
  db.exec('ANALYZE');
  db.close();
  fs.renameSync(tmp, outFile);
  return { games, reports };
}

type Statements = Record<'game' | 'teamGame' | 'player' | 'event' | 'penalty' | 'phase', ReturnType<DatabaseSync['prepare']>>;

function addGame(q: Statements, league: League, seasonId: number, game: Game, report: Report | null) {
  const events = report?.events ?? [];
  const duration = Math.max(3600, ...events.map((e) => e.t));
  const kickoff = game.date.replace('T', ' ');
  const weekday = WEEKDAYS[new Date(`${game.date.slice(0, 10)}T12:00:00Z`).getUTCDay()];
  q.game.run(game.id, league.id, seasonId, game.round, kickoff, game.date.slice(0, 10), weekday, game.status, game.homeId, game.guestId, game.home, game.guest,
    game.homeGoals, game.guestGoals, game.homeGoalsHt, game.guestGoalsHt, game.venue?.name ?? null, game.venue?.town ?? null, game.comment || null,
    Number(!!report), report?.spectators ?? null, report?.referees.join(', ') || null, report ? duration : null);

  const ids: Record<Side, number | null> = { home: game.homeId, guest: game.guestId };
  const goals = (side: Side, which: 'full' | 'ht') => side === 'home' ? (which === 'full' ? game.homeGoals : game.homeGoalsHt) : (which === 'full' ? game.guestGoals : game.guestGoalsHt);
  for (const side of ['home', 'guest'] as const) {
    const gf = goals(side, 'full');
    const ga = goals(other(side), 'full');
    const result = game.status === 'finished' && gf !== null && ga !== null ? (gf > ga ? 'S' : gf < ga ? 'N' : 'U') : null;
    q.teamGame.run(game.id, league.id, ids[side], side === 'home' ? game.home : game.guest, ids[other(side)], side === 'home' ? game.guest : game.home,
      Number(side === 'home'), kickoff, game.round, game.status, gf, ga, goals(side, 'ht'), goals(other(side), 'ht'), result, Number(!!report));
  }
  if (!report) return;

  const key = (side: Side | null, name: string | null) => (side && name && ids[side] !== null ? playerKey(ids[side]!, name) : null);
  for (const side of ['home', 'guest'] as const) {
    for (const line of [...report[side].players, ...report[side].officials]) {
      q.player.run(game.id, ids[side], key(side, line.name), line.no, line.name, Number(line.official), line.goals, line.sevenGoals, line.sevenAttempts,
        line.goals - line.sevenGoals, line.warning, line.twoMinutes.length, line.twoMinutes.join(', ') || null, line.disqualification);
    }
  }

  const missing = shortages(events);
  const scoreBefore = (index: number) => (index === 0 ? { home: 0, guest: 0 } : { home: events[index - 1].homeScore, guest: events[index - 1].guestScore });
  const downAt = events.map((_, index) => playersDown(missing, events, index));
  events.forEach((e, index) => {
    const down = downAt[index];
    const before = scoreBefore(index);
    // The text only adds information for events without their own type (e.g. jersey changes).
    q.event.run(game.id, index, e.t, e.clock, Math.floor(e.t / 60) + 1, half(e.t), e.type, e.side, e.side ? ids[e.side] : null, e.player, e.no,
      key(e.side, e.player), e.homeScore, e.guestScore, before.home - before.guest, down.home, down.guest, e.type === 'other' ? e.text : null);
  });

  for (const s of missing) {
    const before = scoreBefore(s.index);
    const e = events[s.index];
    q.penalty.run(game.id, s.index, ids[s.side], ids[other(s.side)], s.player, e.no, key(s.side, s.player), s.type, s.start, Math.min(s.end, duration),
      clock(s.start), clock(Math.min(s.end, duration)), half(s.start), before[s.side], before[other(s.side)]);
  }

  for (const phase of strengthPhases(missing)) {
    const end = Math.min(phase.end, duration);
    if (end <= phase.start) continue;
    // A goal belongs to the phase when the numbers on court at that goal match it.
    const inPhase = events.map((e, index) => ({ e, index })).filter(({ e, index }) => isGoal(e) && e.side && e.t >= phase.start && e.t < end
      && downAt[index][phase.short] > downAt[index][other(phase.short)]);
    const firstIndex = events.findIndex((e) => e.t >= phase.start);
    const before = scoreBefore(firstIndex < 0 ? events.length : firstIndex);
    const penalized = (side: Side) => missing.filter((s) => s.side === side && s.start < end && s.end > phase.start).map((s) => `${s.player ?? '?'} (${clock(s.start)}${s.type === 'disqualification' ? ', Rot' : ''})`).join('; ');
    for (const side of ['home', 'guest'] as const) {
      const short = side === phase.short;
      q.phase.run(game.id, ids[side], ids[other(side)], short ? 'shorthanded' : 'powerplay', phase.difference, phase.start, end, clock(phase.start), clock(end),
        end - phase.start, half(phase.start), inPhase.filter(({ e }) => e.side === side).length, inPhase.filter(({ e }) => e.side !== side).length,
        before[side], before[other(side)], penalized(phase.short));
    }
  }
}
