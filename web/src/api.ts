// Data access. Everything comes from the static JSON files the pipeline publishes
// under api/; while a game is running, scores and tables are additionally taken
// straight from h4a, so live results don't wait for the next pipeline run.

import { useEffect, useMemo, useState } from 'react';
import { useQuery, type QueryClient, useQueryClient } from '@tanstack/react-query';
import { berlinDay, shiftDay, weekStart } from '../../shared/dates.ts';
import { gameStatus, isActive, leagueUrl, normalizeTable, rawGames, scoreFields, type LeagueResponse } from '../../shared/h4a.ts';
import type {
  Game,
  GameDetail,
  GameScorer,
  League,
  Meta,
  PlayerDetail,
  PlayerSearchEntry,
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

/** Seed a returning view with live data already received in this session. */
function cachedGame(client: QueryClient, season: number, game: Game): Game {
  const official = !game.liveFlag && game.homePoints != null && game.guestPoints != null && game.homePoints + game.guestPoints === 2;
  const fields = official ? undefined : client.getQueryData<LiveLeague>(['h4a', season, game.leagueId])?.games.get(game.id);
  const next = withToken(refresh(fields ? { ...game, ...fields } : game));
  return applyTickerResult(next, next.tickerToken ? client.getQueryData<LiveGame>(['tickerResult', next.tickerToken]) : undefined);
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
interface LiveSnapshot { games: Game[]; tables: Map<number, TableRow[]> }

async function withLive(client: QueryClient, season: number, games: Game[], onUpdate?: (data: LiveSnapshot) => void): Promise<LiveSnapshot> {
  const finalResult = (game: Game) => applyTickerResult(game, game.tickerToken ? client.getQueryData<LiveGame>(['tickerResult', game.tickerToken]) : undefined);
  const refreshed = games.map((g) => cachedGame(client, season, g));
  const active = [...new Set(refreshed.filter((g) => isActive(g)).map((g) => g.leagueId))];
  const tables = new Map<number, TableRow[]>();
  if (!active.length) return { games: refreshed, tables };
  const live = new Map<number, LiveLeague>();
  const snapshot = (): LiveSnapshot => ({
    games: refreshed.map((g) => {
      const fields = live.get(g.leagueId)?.games.get(g.id);
      return fields ? finalResult(withToken(refresh({ ...g, ...fields }))) : g;
    }),
    tables: new Map(tables),
  });
  await Promise.all(
    active.map(async (id) => {
      const data = await fetchLive(client, season, id);
      if (data) {
        live.set(id, data);
        tables.set(id, data.table);
        onUpdate?.(snapshot());
      }
    }),
  );
  return snapshot();
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
      client.setQueryData(['league', season, id], { ...league, games: league.games.map((game) => cachedGame(client, season!, game)) });
      const { games, tables } = await withLive(client, season!, league.games);
      return { ...league, games, table: tables.get(league.id) ?? league.table };
    },
    enabled: id !== undefined && season !== undefined,
    refetchInterval: (q) => pollInterval(q.state.data?.games),
  });
}

const EMPTY_GAMES: Game[] = [];

function weekQuery(meta: Meta | undefined, week: string) {
  return {
    queryKey: meta?.weeks ? ['week', meta.season, week] : ['allGames', meta?.season],
    queryFn: () => meta?.weeks
      ? (meta.weeks.includes(week) ? get<Game[]>(`s/${meta.season}/week/${week}`) : EMPTY_GAMES)
      : get<Game[]>(`s/${meta?.season}/games`),
    staleTime: POLL_MS,
  };
}

function usePublishedWeek(meta: Meta | undefined, week: string, enabled = true) {
  return useQuery({
    ...weekQuery(meta, week),
    enabled: enabled && meta !== undefined,
    refetchInterval: POLL_MS,
    select: meta?.weeks ? undefined : (games) => games.filter((game) => weekStart(game.date) === week),
  });
}

function useGamesWithLive(season: number | undefined, scope: readonly unknown[], selection: Game[] | undefined) {
  const client = useQueryClient();
  const queryKey = ['games', season, ...scope];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      return (await withLive(client, season!, selection!, (data) => {
        client.setQueryData(queryKey, data.games);
      })).games;
    },
    enabled: season !== undefined && selection !== undefined,
    // Published fixtures render immediately while live league requests are spaced out.
    placeholderData: () => selection?.map((game) => cachedGame(client, season!, game)),
    refetchInterval: (q) => pollInterval(q.state.data),
  });
  return query;
}

export function useWeekGames(meta: Meta, week: string) {
  const client = useQueryClient();
  const published = usePublishedWeek(meta, week);
  const query = useGamesWithLive(meta.season, ['week', week], published.data);
  useEffect(() => {
    if (!published.data || !meta.weeks) return;
    const timer = window.setTimeout(() => {
      for (const offset of [-7, 7]) {
        const neighbour = shiftDay(week, offset);
        if (meta.weeks?.includes(neighbour)) void client.prefetchQuery(weekQuery(meta, neighbour));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [client, meta, published.data, week]);
  const error = query.data ? null : published.error ?? query.error;
  return { ...query, error, isPending: query.isPending && !error };
}

/** Games that are running or about to start. */
export function useLiveSchedule(includeFinished = false) {
  const { data: meta, error: metaError } = useMeta();
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // Rounded to 5 minutes so the query key (and cache entry) stays stable between renders.
  const now = Math.floor(clock / 300_000) * 300_000;
  const start = now - 4 * 3600_000;
  const end = now + 3600_000;
  const firstWeek = weekStart(berlinDay(start));
  const lastWeek = weekStart(berlinDay(end));
  const crossesWeek = firstWeek !== lastWeek;
  const first = usePublishedWeek(meta, firstWeek);
  const last = usePublishedWeek(meta, lastWeek, crossesWeek);
  const selection = useMemo(() => {
    if (!first.data || (crossesWeek && !last.data)) return undefined;
    const games = [...(first.data ?? []), ...(crossesWeek ? last.data ?? [] : [])];
    return games.filter((game) => game.ts >= start && game.ts < end);
  }, [first.data, last.data, crossesWeek, start, end]);
  const query = useGamesWithLive(meta?.season, ['live', now], selection);
  const data = useMemo(() => query.data?.filter((g) => isActive(g) || includeFinished && g.status === 'finished') ?? [], [query.data, includeFinished, now]);
  const error = query.data ? null : metaError ?? first.error ?? (crossesWeek ? last.error : null) ?? query.error;
  return { ...query, data, error, isPending: query.isPending && !error };
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
      client.setQueryData(['game', season, id], { ...detail, game: cachedGame(client, season!, detail.game) });
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
      client.setQueryData(['team', season, id], { ...detail, games: detail.games.map((game) => cachedGame(client, season!, game)) });
      const { games, tables } = await withLive(client, season!, detail.games);
      const liveRow = tables.get(detail.league.id)?.find((r) => r.teamId === id);
      return { ...detail, games, tableRow: liveRow ?? detail.tableRow };
    },
    enabled: season !== undefined,
    refetchInterval: (q) => pollInterval(q.state.data?.games),
  });
}

/** One league, all men's or women's leagues, or the full comparison scope. */
export function useStats(league: number | 'M' | 'F' | null) {
  const season = useSeasonId();
  return useQuery({
    queryKey: ['stats', season, league],
    queryFn: () => get<StatsResponse>(`s/${season}/${league === null ? 'stats' : `stats-${league}`}`),
    enabled: season !== undefined,
    staleTime: POLL_MS,
  });
}

export function usePlayerSearch(meta: Meta | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['playerSearch', meta?.season, Boolean(meta?.weeks)],
    queryFn: async () => meta?.weeks ? get<PlayerSearchEntry[]>(`s/${meta.season}/player-search`)
      : (await get<StatsResponse>(`s/${meta?.season}/stats`)).players,
    enabled: meta !== undefined && enabled,
    staleTime: POLL_MS,
  });
}

/** Best scorers per game id, for the selected match week. */
export function useTopScorers(meta: Meta, week: string, enabled: boolean) {
  return useQuery({
    queryKey: ['scorers', meta.season, meta.weeks ? week : null],
    queryFn: async () => {
      const data = await get<Record<number, GameScorer | GameScorer[]>>(`s/${meta.season}/${meta.weeks ? `week-scorers/${week}` : 'scorers'}`);
      // A copy cached offline may still hold a single scorer per game.
      return Object.fromEntries(Object.entries(data).map(([id, v]) => [id, Array.isArray(v) ? v : [v]])) as Record<number, GameScorer[]>;
    },
    enabled,
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
