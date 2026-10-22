// Data access. Everything comes from the static JSON files the pipeline publishes
// under api/; while a game is running, scores and tables are additionally taken
// straight from h4a, so live results don't wait for the next pipeline run.

import { useEffect, useMemo, useState } from 'react';
import { useQuery, type QueryClient, useQueryClient } from '@tanstack/react-query';
import { gameStatus, isActive, leagueUrl, normalizeTable, rawGames, scoreFields, type LeagueResponse } from '../../shared/h4a.ts';
import type {
  Game,
  GameDetail,
  GameScorer,
  League,
  Meta,
  PlayerDetail,
  SiteIndex,
  StatsResponse,
  TableRow,
  TeamDetail,
} from '../../shared/types.ts';
import { useSeason } from './lib/season.tsx';
import { applyTickerResult, type LiveGame } from './lib/liveTicker.ts';
import { requestJSON } from './lib/requests.ts';
import { leagueOrder } from './lib/format.ts';

export const BASE = import.meta.env.BASE_URL;

async function get<T>(path: string): Promise<T> {
  return requestJSON<T>(`${BASE}api/${path}.json`, { cache: 'no-cache' });
}

const LIVE_POLL_MS = 20_000;
const POLL_MS = 5 * 60_000;

/** Polls fast while any of the games is running or about to start. */
export function pollInterval(games: Game[] | undefined) {
  const leagues = new Set(games?.filter((g) => isActive(g)).map((g) => g.leagueId));
  return leagues.size ? Math.max(LIVE_POLL_MS, leagues.size * 3000) : POLL_MS;
}

/** The published status is a snapshot; recompute it against the current time. */
function refresh(game: Game): Game {
  const status = gameStatus(game);
  return status === game.status ? game : { ...game, status };
}

/** h4a only publishes a ticker token while the game runs, so hold on to the ones seen. */
const tickerTokens = new Map<number, string>();
let leagueRequestQueue = Promise.resolve();
let nextLeagueRequest = 0;
let sourceBackoffUntil = 0;

/** Space requests even when several mounted views ask for different leagues. */
async function liveRequest(url: string) {
  const turn = leagueRequestQueue.then(async () => {
    const wait = Math.max(0, nextLeagueRequest - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    nextLeagueRequest = Date.now() + 1500;
  });
  leagueRequestQueue = turn.catch(() => {});
  await turn;
  if (Date.now() < sourceBackoffUntil) throw new Error('Live-Daten werden später erneut geladen.');
  try { return await requestJSON<LeagueResponse[]>(url); }
  catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 429) sourceBackoffUntil = Date.now() + POLL_MS;
    throw error;
  }
}

function withToken(game: Game): Game {
  if (game.tickerToken) tickerTokens.set(game.id, game.tickerToken);
  const tickerToken = tickerTokens.get(game.id);
  return tickerToken && !game.tickerToken ? { ...game, tickerToken } : game;
}

interface LiveLeague {
  games: Map<number, ReturnType<typeof scoreFields>>;
  table: TableRow[];
}

function fetchLive(client: QueryClient, season: number, leagueId: number): Promise<LiveLeague | null> {
  return client.fetchQuery({
    queryKey: ['h4a', season, leagueId],
    staleTime: 15_000,
    queryFn: async () => {
      try {
        const data = await liveRequest(leagueUrl(season, leagueId));
        const league = data?.[0];
        if (!league?.content || !Array.isArray(league.content.score)) throw new Error('Keine Ligadaten');
        return {
          games: new Map(rawGames(league).map((g) => [Number(g.gID), scoreFields(g)])),
          table: normalizeTable(league.content.score),
        };
      } catch {
        // A failed poll must not roll a running score back to the published snapshot.
        return client.getQueryData<LiveLeague | null>(['h4a', season, leagueId]) ?? null;
      }
    },
  });
}

/** Refreshes statuses and, for leagues with a running game, merges live scores from h4a. */
async function withLive(client: QueryClient, season: number, games: Game[]): Promise<{ games: Game[]; tables: Map<number, TableRow[]> }> {
  const finalResult = (game: Game) => applyTickerResult(game, game.tickerToken ? client.getQueryData<LiveGame>(['tickerResult', game.tickerToken]) : undefined);
  const refreshed = games.map((g) => finalResult(withToken(refresh(g))));
  const active = [...new Set(refreshed.filter((g) => isActive(g)).map((g) => g.leagueId))];
  const tables = new Map<number, TableRow[]>();
  if (!active.length) return { games: refreshed, tables };
  const live = new Map<number, LiveLeague>();
  await Promise.all(
    active.map(async (id) => {
      const data = await fetchLive(client, season, id);
      if (data) {
        live.set(id, data);
        tables.set(id, data.table);
      }
    }),
  );
  return {
    games: refreshed.map((g) => {
      const fields = live.get(g.leagueId)?.games.get(g.id);
      return fields ? finalResult(withToken(refresh({ ...g, ...fields }))) : g;
    }),
    tables,
  };
}

export function useIndex() {
  return useQuery({ queryKey: ['index'], queryFn: () => get<SiteIndex>('index'), refetchInterval: POLL_MS });
}

/** The numeric id of the selected season, once the index is known. */
export function useSeasonId(): number | undefined {
  const { season } = useSeason();
  const { data } = useIndex();
  if (!data) return undefined;
  if (season === 'current' || !data.seasons.some((s) => s.id === season)) return data.currentSeason;
  return season;
}

export function useMeta() {
  const season = useSeasonId();
  return useQuery({
    queryKey: ['meta', season],
    queryFn: async () => {
      const meta = await get<Meta>(`s/${season}/meta`);
      return { ...meta, leagues: [...meta.leagues].sort(leagueOrder) };
    },
    enabled: season !== undefined,
    staleTime: POLL_MS,
  });
}

export function useLeague(id: number | undefined) {
  const season = useSeasonId();
  const client = useQueryClient();
  return useQuery({
    queryKey: ['league', season, id],
    queryFn: async () => {
      const league = await get<League>(`s/${season}/league/${id}`);
      const { games, tables } = await withLive(client, season!, league.games);
      return { ...league, games, table: tables.get(league.id) ?? league.table };
    },
    enabled: id !== undefined && season !== undefined,
    refetchInterval: (q) => pollInterval(q.state.data?.games),
  });
}

/** All games of the season whose kickoff lies in [from, to). */
export function useGames(from?: string, to?: string) {
  const season = useSeasonId();
  const client = useQueryClient();
  const start = from ? Date.parse(from) : -Infinity;
  const end = to ? Date.parse(to) : Infinity;
  const published = useQuery({
    queryKey: ['allGames', season],
    queryFn: () => get<Game[]>(`s/${season}/games`),
    enabled: season !== undefined,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
  const selection = useMemo(() => published.data?.filter((g) => g.ts >= start && g.ts < end), [published.data, start, end]);
  const query = useQuery({
    queryKey: ['games', season, from, to, published.dataUpdatedAt],
    queryFn: async () => {
      return (await withLive(client, season!, selection!)).games;
    },
    enabled: season !== undefined && selection !== undefined,
    // Published fixtures render immediately while live league requests are spaced out.
    placeholderData: () => selection?.map(refresh),
    refetchInterval: (q) => pollInterval(q.state.data),
  });
  const error = query.data ? null : published.error ?? query.error;
  return { ...query, error, isPending: !error && !query.data && (published.isPending || query.isPending), isLoading: !error && !query.data && (published.isLoading || query.isLoading) };
}

/** Games that are running or about to start. */
export function useLiveSchedule(includeFinished = false) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // Rounded to 5 minutes so the query key (and cache entry) stays stable between renders.
  const now = Math.floor(clock / 300_000) * 300_000;
  const query = useGames(new Date(now - 4 * 3600_000).toISOString(), new Date(now + 3600_000).toISOString());
  const data = useMemo(() => query.data?.filter((g) => isActive(g) || includeFinished && g.status === 'finished') ?? [], [query.data, includeFinished, now]);
  return { ...query, data };
}

export function useLiveGames(): Game[] {
  return useLiveSchedule().data;
}

export function useGame(id: number) {
  const season = useSeasonId();
  const client = useQueryClient();
  return useQuery({
    queryKey: ['game', season, id],
    queryFn: async () => {
      const detail = await get<GameDetail>(`s/${season}/game/${id}`);
      const [game] = (await withLive(client, season!, [detail.game])).games;
      return { ...detail, game };
    },
    enabled: season !== undefined,
    refetchInterval: (q) => pollInterval(q.state.data ? [q.state.data.game] : undefined),
  });
}

export function useTeam(id: number) {
  const season = useSeasonId();
  const client = useQueryClient();
  return useQuery({
    queryKey: ['team', season, id],
    queryFn: async () => {
      const detail = await get<TeamDetail>(`s/${season}/team/${id}`);
      const { games, tables } = await withLive(client, season!, detail.games);
      const liveRow = tables.get(detail.league.id)?.find((r) => r.teamId === id);
      return { ...detail, games, tableRow: liveRow ?? detail.tableRow };
    },
    enabled: season !== undefined,
    refetchInterval: (q) => pollInterval(q.state.data?.games),
  });
}

export function useStats(league: number | null) {
  const season = useSeasonId();
  return useQuery({
    queryKey: ['stats', season, league],
    queryFn: () => get<StatsResponse>(`s/${season}/${league ? `stats-${league}` : 'stats'}`),
    enabled: season !== undefined,
    staleTime: POLL_MS,
  });
}

/** Best scorers per game id (best first), for all games of the season with a match report. */
export function useTopScorers() {
  const season = useSeasonId();
  return useQuery({
    queryKey: ['scorers', season],
    queryFn: async () => {
      const data = await get<Record<number, GameScorer | GameScorer[]>>(`s/${season}/scorers`);
      // A copy cached offline may still hold a single scorer per game.
      return Object.fromEntries(Object.entries(data).map(([id, v]) => [id, Array.isArray(v) ? v : [v]])) as Record<number, GameScorer[]>;
    },
    enabled: season !== undefined,
    staleTime: POLL_MS,
  });
}

export function usePlayer(key: string) {
  const season = useSeasonId();
  return useQuery({
    queryKey: ['player', season, key],
    queryFn: () => get<PlayerDetail>(`s/${season}/player/${encodeURIComponent(key)}`),
    enabled: season !== undefined && key !== '',
    staleTime: POLL_MS,
  });
}
