// h4a's live ticker: while a game is being ticked at the scorer's table, its
// events can be read with the token h4a publishes in the league data. This is
// the same service the "Liveticker" link on bwhv.org leads to.

import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { H4A_BASE } from '../../../shared/h4a.ts';
import type { EventType, Game, MatchEvent, PlayerLine, Report, TeamSheet } from '../../../shared/types.ts';

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
  /** Game clock (seconds) of the latest ticker entry; the real clock is somewhat further. */
  clock: number;
}

async function call<T>(token: string, cmd: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  const res = await fetch(`${H4A_BASE}/service/if_ticker_data.php?token=${encodeURIComponent(token)}&cmd=${cmd}`, {
    method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw Object.assign(new Error(`Fehler ${res.status}`), { status: res.status });
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

const seconds = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
export const matchClock = (value: number) => {
  const t = seconds(value);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
/** A whistle or event at 60:00 belongs to minute 60; real extra time remains visible. */
export const matchMinute = (t: number) => Math.max(1, Math.ceil(seconds(t) / 60));
const scoreNumber = (value: unknown) => {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
};

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
  for (const m of Array.isArray(team?.team_members) ? team.team_members : []) {
    if (!m || typeof m.player_no !== 'string') continue;
    const no = m.player_no.trim();
    if (!no) continue;
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
  let homeGoals = 0;
  let guestGoals = 0;
  let lastClock = 0;
  let phase: 'pending' | 'running' | 'halftime' | 'finished' = 'pending';
  let boundary = 0;
  for (const m of messages) {
    if (!m || typeof m.message !== 'string') continue;
    const t = seconds(m.game_time);
    lastClock = Math.max(lastClock, t);
    homeGoals = scoreNumber(m.home_score) ?? homeGoals;
    guestGoals = scoreNumber(m.guest_score) ?? guestGoals;
    const half = m.message.match(/^Spielstand (\d+)\. Halbzeit/)?.[1];
    if (half || /^(Spielende|Spiel beendet|Endstand)\b/i.test(m.message)) {
      phase = half === '1' ? 'halftime' : 'finished';
      boundary = t;
    } else if (t > boundary || (/^Spielzeit gestartet/.test(m.message) && phase !== 'finished')) {
      phase = 'running';
    }
    const type = TYPES.find(([pattern]) => pattern.test(m.message))?.[1];
    if (!type) continue;
    const side = m.message.includes('Heimmannschaft') ? 'home' : m.message.includes('Gastmannschaft') ? 'guest' : null;
    const no = m.message.match(/Nummer\s+(\S+)/)?.[1] ?? null;
    let line: PlayerLine | undefined;
    if (no && side) {
      line = players[side].get(no) ?? emptyLine(no, null);
      players[side].set(no, line);
      if (type === 'goal' || type === 'sevenGoal') line.goals++;
      if (type === 'sevenGoal') line.sevenGoals++;
      if (type === 'sevenGoal' || type === 'sevenMiss') line.sevenAttempts++;
      if (type === 'warning') line.warning = matchClock(t);
      if (type === 'twoMinutes') line.twoMinutes.push(matchClock(t));
      if (type === 'disqualification') line.disqualification = matchClock(t);
    }
    events.push({
      clock: matchClock(t),
      t,
      type,
      side,
      no,
      player: line ? (line.anonymous ? `Nr. ${no}` : line.name) : null,
      homeScore: homeGoals,
      guestScore: guestGoals,
      text: m.message,
    });
  }
  return {
    events,
    home: sheet(teams?.team_home, players.home, 'Heim'),
    guest: sheet(teams?.team_guest, players.guest, 'Gast'),
    homeGoals,
    guestGoals,
    phase: phase === 'halftime' ? 'Halbzeit' : phase === 'finished' ? 'Ende' : phase === 'pending' ? 'Vor dem Anwurf' : `${matchMinute(lastClock)}. Minute`,
    clock: lastClock,
  };
}

/** Score and phase from the ticker, if the game runs and the ticker is at least as far as the league data. */
export function liveScore(game: Game, ticker: LiveGame | undefined) {
  if (!ticker || game.status !== 'live') return null;
  if (ticker.phase === 'Vor dem Anwurf' || ticker.homeGoals < (game.homeGoals ?? 0) || ticker.guestGoals < (game.guestGoals ?? 0)) return null;
  return { homeGoals: ticker.homeGoals, guestGoals: ticker.guestGoals, phase: ticker.phase, status: ticker.phase === 'Ende' ? 'finished' as const : 'live' as const };
}

/** Use a validated ticker result until the official result arrives. */
export function applyTickerResult(game: Game, ticker: LiveGame | undefined): Game {
  const officialResult = !game.liveFlag && game.homePoints != null && game.guestPoints != null && game.homePoints + game.guestPoints === 2;
  // A stale snapshot also becomes "finished" when the polling window expires.
  // That clock heuristic must not replace a known final score with a half-time
  // snapshot while publication is delayed. Awarded official results still win.
  const expiredSnapshot = game.status === 'finished' && ticker?.phase === 'Ende' && !officialResult;
  const score = liveScore(expiredSnapshot ? { ...game, status: 'live' } : game, ticker);
  return score ? { ...game, ...score, liveFlag: score.status === 'live' } : game;
}

const PENALTY_SECONDS = 120;

/** Who of a team is serving a time penalty as of the latest ticker entry, and until when. */
export function activePenalties(ticker: LiveGame, side: 'home' | 'guest') {
  if (ticker.phase === 'Ende') return [];
  return ticker.events
    .filter((e) => e.side === side && (e.type === 'twoMinutes' || e.type === 'disqualification') && ticker.clock >= e.t && ticker.clock - e.t < PENALTY_SECONDS)
    .map((e) => ({ player: e.player ?? '', until: matchClock(e.t + PENALTY_SECONDS) }));
}

const messagesQuery = (token: string) => async ({ signal }: { signal?: AbortSignal } = {}) => {
  const data = await call<RawMessage[]>(token, 'getAllTickerMessages', signal);
  if (!Array.isArray(data)) throw new Error('Kein Ticker');
  return data;
};
const teamsQuery = (token: string) => ({ signal }: { signal?: AbortSignal } = {}) => call<RawTeams>(token, 'getAllGameInfo', signal);
const TEAMS_STALE_MS = 10 * 60_000;

/** A game as told by its live ticker so far; polls while the game is running. */
export function useLiveTicker(token: string | null | undefined, live: boolean): LiveGame | undefined {
  const client = useQueryClient();
  // No retries: an error may mean h4a is rate limiting, and then we back off.
  const messages = useQuery({
    queryKey: ['ticker', token],
    queryFn: messagesQuery(token!),
    enabled: Boolean(token),
    retry: false,
    refetchInterval: (query) => live && (!query.state.data?.length || parseTicker(query.state.data).phase !== 'Ende') ? POLL_MS : false,
  });
  const teams = useQuery({
    queryKey: ['tickerTeams', token],
    queryFn: teamsQuery(token!),
    enabled: Boolean(token),
    retry: false,
    staleTime: TEAMS_STALE_MS,
  });
  const ticker = useMemo(
    () => (messages.data?.length ? parseTicker(messages.data, teams.data?.team_home ? teams.data : undefined) : undefined),
    [messages.data, teams.data],
  );
  useEffect(() => {
    if (token && ticker?.phase === 'Ende') rememberResult(client, token, ticker);
  }, [client, token, ticker]);
  return ticker;
}

function rememberResult(client: QueryClient, token: string, ticker: LiveGame) {
  const previous = client.getQueryData<LiveGame>(['tickerResult', token]);
  if (previous?.homeGoals === ticker.homeGoals && previous.guestGoals === ticker.guestGoals) return;
  client.setQueryData(['tickerResult', token], ticker);
  for (const key of ['games', 'game', 'league', 'team']) void client.invalidateQueries({ queryKey: [key] });
}

/** Pause between two tickers of the conference, and the share of time one game may claim. */
const CONFERENCE_GAP_MS = 1000;
const CONFERENCE_MS_PER_GAME = 4000;
const CONFERENCE_MIN_MS = 30_000;

/**
 * The tickers of several games at once, by game id. To stay gentle on h4a the
 * tickers are read one after the other and less often the more games there are.
 * An expired ticker does not interrupt other games; rate limiting ends a round.
 */
export function useConference(games: Game[]) {
  const client = useQueryClient();
  const ticked = games.filter((g) => g.tickerToken);
  const queryKey = ['conference', ticked.map((g) => g.tickerToken).join()];
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      // Keep the last known entries during a temporary outage instead of
      // emptying the feed on the next poll.
      const result = new Map(client.getQueryData<Map<number, LiveGame>>(queryKey));
      for (const [i, game] of ticked.entries()) {
        const token = game.tickerToken!;
        const ended = client.getQueryData<LiveGame>(['tickerResult', token]);
        if (ended) { result.set(game.id, ended); continue; }
        if (i) await new Promise((resolve) => setTimeout(resolve, CONFERENCE_GAP_MS));
        try {
          const messages = await messagesQuery(token)({ signal });
          const teams = await client.fetchQuery({ queryKey: ['tickerTeams', token], queryFn: teamsQuery(token), staleTime: TEAMS_STALE_MS, retry: false }).catch(() => undefined);
          if (messages.length) {
            const ticker = parseTicker(messages, teams?.team_home ? teams : undefined);
            result.set(game.id, ticker);
            client.setQueryData(['ticker', token], messages);
            if (ticker.phase === 'Ende') rememberResult(client, token, ticker);
          }
        } catch (error) {
          if (signal.aborted) throw signal.reason;
          if (error instanceof Error && 'status' in error && error.status === 429) break;
          // One expired token must not blank the other matches in the conference.
          continue;
        }
      }
      return result;
    },
    enabled: ticked.length > 0,
    retry: false,
    placeholderData: keepPreviousData,
    refetchInterval: Math.max(CONFERENCE_MIN_MS, ticked.length * CONFERENCE_MS_PER_GAME),
  }).data;
}
