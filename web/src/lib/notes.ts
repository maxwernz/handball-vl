// Short remarks about a team's current run: streaks, firsts and round numbers.

import type { Game, PlayerStats } from '../../../shared/types.ts';

const games = (n: number) => `${n} ${n === 1 ? 'Spiel' : 'Spielen'}`;
const GOAL_STEP = 100;
const PLAYER_STEP = 50;
const PLAYER_NEAR = 5;

export function teamNotes(all: Game[], teamId: number, players: PlayerStats[] = []): string[] {
  const played = all
    .filter((g) => g.status === 'finished' && g.homeGoals !== null && g.guestGoals !== null && (g.homeId === teamId || g.guestId === teamId))
    .sort((a, b) => a.ts - b.ts)
    .map((g) => {
      const home = g.homeId === teamId;
      const own = home ? g.homeGoals! : g.guestGoals!;
      const other = home ? g.guestGoals! : g.homeGoals!;
      return { home, own, result: own > other ? 'W' : own < other ? 'L' : 'D' };
    });
  if (!played.length) return [];
  const notes: string[] = [];
  /** Length of the run of games at the end that all satisfy the test. */
  const run = (test: (r: string) => boolean) => {
    let n = 0;
    while (n < played.length && test(played[played.length - 1 - n].result)) n++;
    return n;
  };
  const wins = run((r) => r === 'W');
  const losses = run((r) => r === 'L');
  const unbeaten = run((r) => r !== 'L');
  const winless = run((r) => r !== 'W');
  const last = played[played.length - 1];

  if (unbeaten === played.length && played.length >= 3) notes.push(wins === played.length ? `Alle ${played.length} Spiele gewonnen` : 'Noch ungeschlagen');
  else if (wins >= 3) notes.push(`${wins} Siege in Folge`);
  else if (unbeaten >= 4) notes.push(`Seit ${games(unbeaten)} ungeschlagen`);
  if (losses >= 3) notes.push(`${losses} Niederlagen in Folge`);
  else if (winless >= 4) notes.push(`Seit ${games(winless)} ohne Sieg`);

  if (last.result === 'W') {
    const earlier = played.slice(0, -1);
    if (earlier.length >= 2 && earlier.every((g) => g.result !== 'W')) notes.push('Erster Saisonsieg');
    else if (!last.home && earlier.filter((g) => !g.home).length >= 2 && earlier.every((g) => g.home || g.result !== 'W')) notes.push('Erster Auswärtssieg');
  }
  const homeGames = played.filter((g) => g.home);
  if (homeGames.length >= 3 && homeGames.every((g) => g.result === 'W') && unbeaten !== played.length) notes.push('Zu Hause alle Spiele gewonnen');

  const total = played.reduce((n, g) => n + g.own, 0);
  const mark = Math.floor(total / GOAL_STEP) * GOAL_STEP;
  if (mark && total - last.own < mark) notes.push(`${mark}. Saisontor im letzten Spiel`);

  const top = [...players].sort((a, b) => b.goals - a.goals)[0];
  if (top) {
    const next = (Math.floor(top.goals / PLAYER_STEP) + 1) * PLAYER_STEP;
    const missing = next - top.goals;
    if (missing <= PLAYER_NEAR) notes.push(`${top.name} ${missing === 1 ? 'fehlt noch 1 Tor' : `fehlen noch ${missing} Tore`} zum ${next}. Saisontor`);
  }
  return notes;
}
