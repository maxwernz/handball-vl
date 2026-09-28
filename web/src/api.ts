// Data access. Everything comes from the static JSON files the pipeline publishes
// under api/; while a game is running, scores and tables are additionally taken
// straight from h4a, so live results don't wait for the next pipeline run.

import { keepPreviousData, useQuery, type QueryClient, useQueryClient } from '@tanstack/react-query';
import { gameStatus, isActive, leagueUrl, normalizeTable, rawGames, scoreFields, type LeagueResponse } from '../../shared/h4a.ts';
import type {
  Game,
  GameDetail,
  League,
  Meta,
  PlayerDetail,
  SiteIndex,
  StatsResponse,
  TableRow,
  TeamDetail,
} from '../../shared/types.ts';
import { useSeason } from './lib/season.tsx';

export const BASE = import.meta.env.BASE_URL;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}api/${path}.json`);
  if (!res.ok) throw new Error(res.status === 404 ? 'Nicht gefunden' : `Fehler ${res.status}`);
  return res.json() as Promise<T>;
}

const LIVE_POLL_MS = 20_000;
const POLL_MS = 5 * 60_000;

/** Polls fast while any of the games is running or about to start. */
export function pollInterval(games: Game[] | undefined) {
  return games?.some((g) => isActive(g)) ? LIVE_POLL_MS : POLL_MS;
}

/** The published status is a snapshot; recompute it against the current time. */
function refresh(game: Game): Game {
  const status = gameStatus(game);
  return status === game.status ? game : { ...game, status };
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
        const res = await fetch(leagueUrl(season, leagueId));
        const data = (await res.json()) as LeagueResponse[];
        const league = data[0];
        return {
          games: new Map(rawGames(league).map((g) => [Number(g.gID), scoreFields(g)])),
          table: normalizeTable(league.content.score),
        };
      } catch {
        return null; // live data is a bonus; the published data still works
      }
    },
  });
}

/** Refreshes statuses and, for leagues with a running game, merges live scores from h4a. */
async function withLive(client: QueryClient, season: number, games: Game[]): Promise<{ games: Game[]; tables: Map<number, TableRow[]> }> {
  const refreshed = games.map(refresh);
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
      return fields ? refresh({ ...g, ...fields }) : g;
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
    queryFn: () => get<Meta>(`s/${season}/meta`),
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
    placeholderData: keepPreviousData,
    refetchInterval: (q) => pollInterval(q.state.data?.games),
  });
}

/** All games of the season whose kickoff lies in [from, to). */
export function useGames(from?: string, to?: string) {
  const season = useSeasonId();
  const client = useQueryClient();
  const start = from ? Date.parse(from) : -Infinity;
  const end = to ? Date.parse(to) : Infinity;
  return useQuery({
    queryKey: ['games', season, from, to],
    queryFn: async () => {
      const all = await client.fetchQuery({ queryKey: ['allGames', season], queryFn: () => get<Game[]>(`s/${season}/games`), staleTime: POLL_MS });
      return (await withLive(client, season!, all.filter((g) => g.ts >= start && g.ts < end))).games;
    },
    enabled: season !== undefined,
    refetchInterval: (q) => pollInterval(q.state.data),
  });
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
    placeholderData: keepPreviousData,
    staleTime: POLL_MS,
  });
}

export function usePlayer(key: string) {
  const season = useSeasonId();
  return useQuery({
    queryKey: ['player', season, key],
    queryFn: () => get<PlayerDetail>(`s/${season}/player/${encodeURIComponent(key)}`),
    enabled: season !== undefined,
    staleTime: POLL_MS,
  });
}
