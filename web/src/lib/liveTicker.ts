// h4a's live ticker: while a game is being ticked at the scorer's table, its
// events can be read with the token h4a publishes in the league data. This is
// the same service the "Liveticker" link on bwhv.org leads to.

import { useQuery } from '@tanstack/react-query';
import { H4A_BASE } from '../../../shared/h4a.ts';
import type { EventType, MatchEvent } from '../../../shared/types.ts';

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

interface RawTeams {
  team_home: { team_members: RawMember[] };
  team_guest: { team_members: RawMember[] };
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

function names(members: RawMember[] | undefined) {
  const named = (members ?? []).filter((m) => m.name && m.name !== 'N.N.');
  return new Map(named.map((m) => [m.player_no.trim(), [m.prename === 'N.N.' ? '' : m.prename, m.name].join(' ').trim()]));
}

export function parseTicker(messages: RawMessage[], teams?: RawTeams): MatchEvent[] {
  const players = { home: names(teams?.team_home.team_members), guest: names(teams?.team_guest.team_members) };
  const events: MatchEvent[] = [];
  for (const m of messages) {
    const type = TYPES.find(([pattern]) => pattern.test(m.message))?.[1];
    if (!type) continue;
    const side = m.message.includes('Heimmannschaft') ? 'home' : m.message.includes('Gastmannschaft') ? 'guest' : null;
    const no = m.message.match(/Nummer\s+(\S+)/)?.[1] ?? null;
    const t = Number(m.game_time) || 0;
    events.push({
      clock: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`,
      t,
      type,
      side,
      no,
      player: no && side ? (players[side].get(no) ?? `Nr. ${no}`) : null,
      homeScore: Number(m.home_score) || 0,
      guestScore: Number(m.guest_score) || 0,
      text: m.message,
    });
  }
  return events;
}

/** The events of a game's live ticker so far; polls while the game is running. */
export function useLiveTicker(token: string | null | undefined, live: boolean): MatchEvent[] | undefined {
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
  return messages.data && parseTicker(messages.data, teams.data?.team_home ? teams.data : undefined);
}
