// h4a's live ticker: while a game is being ticked at the scorer's table, its
// events can be read with the token h4a publishes in the league data. This is
// the same service the "Liveticker" link on bwhv.org leads to.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { H4A_BASE } from '../../../shared/h4a.ts';
import type { EventType, MatchEvent, PlayerLine, Report, TeamSheet } from '../../../shared/types.ts';

const POLL_MS = 20_000;

interface RawMessage {
  /** Game clock in seconds. */
  game_time: string;
  home_score: string;
  guest_score: string;
  message: string;
}

interface RawMember {
  prename: string;
  name: string;
  player_no: string;
}

interface RawTeam {
  club: string;
  team_members: RawMember[];
}

interface RawTeams {
  team_home: RawTeam;
  team_guest: RawTeam;
}

/** What the ticker knows about a game so far, shaped like a match report so the same views can show it. */
export interface LiveGame extends Pick<Report, 'home' | 'guest' | 'events'> {
  homeGoals: number;
  guestGoals: number;
  /** "Halbzeit", "Ende" or the minute of the latest ticker entry. */
  phase: string;
}

async function call<T>(token: string, cmd: string): Promise<T> {
  const res = await fetch(`${H4A_BASE}/service/if_ticker_data.php?token=${encodeURIComponent(token)}&cmd=${cmd}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Fehler ${res.status}`);
  return res.json() as Promise<T>;
}

// Messages read like "Tor für die Gastmannschaft durch die Nummer 95" or
// "2-min Strafe für die Nummer 2 der Heimmannschaft"; clock and score messages are skipped.
const TYPES: [RegExp, EventType][] = [
  [/^Tor /, 'goal'],
  [/^Erfolgreicher 7m/, 'sevenGoal'],
  [/^7m-Wurf/, 'sevenMiss'],
  [/^Verwarnung/, 'warning'],
  [/^2-min/, 'twoMinutes'],
  [/^Disqualifikation/, 'disqualification'],
  [/Auszeit/, 'timeout'],
];

const clock = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

/** Officials wear letters instead of numbers. */
const isOfficial = (no: string) => !/^\d+$/.test(no);

function emptyLine(no: string, name: string | null): PlayerLine {
  return {
    no,
    name: name ?? (isOfficial(no) ? `Offizieller ${no}` : `Spieler ${no}`),
    goals: 0,
    sevenGoals: 0,
    sevenAttempts: 0,
    warning: null,
    twoMinutes: [],
    disqualification: null,
    official: isOfficial(no),
    ...(name ? {} : { anonymous: true }),
  };
}

function lines(team: RawTeam | undefined) {
  const map = new Map<string, PlayerLine>();
  for (const m of team?.team_members ?? []) {
    const no = m.player_no.trim();
    const named = m.name && m.name !== 'N.N.';
    const line = emptyLine(no, named ? [m.prename === 'N.N.' ? '' : m.prename, m.name].join(' ').trim() : null);
    // Unnamed officials are just empty seats on the bench.
    if (named || !line.official) map.set(no, line);
  }
  return map;
}

function sheet(team: RawTeam | undefined, players: Map<string, PlayerLine>, fallback: string): TeamSheet {
  const all = [...players.values()].sort((a, b) => a.no.localeCompare(b.no, 'de', { numeric: true }));
  return { name: team?.club ?? fallback, players: all.filter((l) => !l.official), officials: all.filter((l) => l.official) };
}

export function parseTicker(messages: RawMessage[], teams?: RawTeams): LiveGame {
  const players = { home: lines(teams?.team_home), guest: lines(teams?.team_guest) };
  const events: MatchEvent[] = [];
  for (const m of messages) {
    const type = TYPES.find(([pattern]) => pattern.test(m.message))?.[1];
    if (!type) continue;
    const side = m.message.includes('Heimmannschaft') ? 'home' : m.message.includes('Gastmannschaft') ? 'guest' : null;
    const no = m.message.match(/Nummer\s+(\S+)/)?.[1] ?? null;
    const t = Number(m.game_time) || 0;
    let line: PlayerLine | undefined;
    if (no && side) {
      line = players[side].get(no) ?? emptyLine(no, null);
      players[side].set(no, line);
      if (type === 'goal' || type === 'sevenGoal') line.goals++;
      if (type === 'sevenGoal') line.sevenGoals++;
      if (type === 'sevenGoal' || type === 'sevenMiss') line.sevenAttempts++;
      if (type === 'warning') line.warning = clock(t);
      if (type === 'twoMinutes') line.twoMinutes.push(clock(t));
      if (type === 'disqualification') line.disqualification = clock(t);
    }
    events.push({
      clock: clock(t),
      t,
      type,
      side,
      no,
      player: line ? (line.anonymous ? `Nr. ${no}` : line.name) : null,
      homeScore: Number(m.home_score) || 0,
      guestScore: Number(m.guest_score) || 0,
      text: m.message,
    });
  }
  const last = messages.at(-1);
  // "Spielstand 1. Halbzeit" closes a half; it stays the latest message until play resumes.
  const half = last?.message.match(/^Spielstand (\d)\. Halbzeit/)?.[1];
  return {
    events,
    home: sheet(teams?.team_home, players.home, 'Heim'),
    guest: sheet(teams?.team_guest, players.guest, 'Gast'),
    homeGoals: Number(last?.home_score) || 0,
    guestGoals: Number(last?.guest_score) || 0,
    phase: half === '1' ? 'Halbzeit' : half ? 'Ende' : `${Math.floor((Number(last?.game_time) || 0) / 60) + 1}. Minute`,
  };
}

/** A game as told by its live ticker so far; polls while the game is running. */
export function useLiveTicker(token: string | null | undefined, live: boolean): LiveGame | undefined {
  // No retries: an error may mean h4a is rate limiting, and then we back off.
  const messages = useQuery({
    queryKey: ['ticker', token],
    queryFn: async () => {
      const data = await call<RawMessage[]>(token!, 'getAllTickerMessages');
      if (!Array.isArray(data)) throw new Error('Kein Ticker');
      return data;
    },
    enabled: Boolean(token),
    retry: false,
    refetchInterval: live ? POLL_MS : false,
  });
  const teams = useQuery({
    queryKey: ['tickerTeams', token],
    queryFn: () => call<RawTeams>(token!, 'getAllGameInfo'),
    enabled: Boolean(token),
    retry: false,
    staleTime: 10 * 60_000,
  });
  return useMemo(
    () => (messages.data?.length ? parseTicker(messages.data, teams.data?.team_home ? teams.data : undefined) : undefined),
    [messages.data, teams.data],
  );
}
