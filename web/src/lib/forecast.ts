// A deliberately simple forecast for a coming game, from season averages only.
// It is a toy to look at next to the comparison, not a betting model.

import type { TeamStats } from '../../../shared/types.ts';

/** Goals a home team is better off by, and how far results scatter around the expectation. */
const HOME_ADVANTAGE = 1.5;
const SPREAD = 6;
/** Goals per point of difference in the average points of the last games. */
const FORM_WEIGHT = 1;
/** Fewer games than this say too little about a team. */
const MIN_GAMES = 3;

/** Standard normal distribution function (Abramowitz/Stegun 26.2.17). */
function phi(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail = Math.exp((-x * x) / 2) * 0.3989423 * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - tail : tail;
}

const formPoints = (form: TeamStats['form']) => (form.length ? form.reduce((n, f) => n + (f === 'W' ? 2 : f === 'D' ? 1 : 0), 0) / form.length : 1);

export interface Forecast {
  /** Probabilities, adding up to 1. */
  home: number;
  draw: number;
  guest: number;
  homeGoals: number;
  guestGoals: number;
}

export function forecast(home: TeamStats, guest: TeamStats): Forecast | null {
  if (home.played < MIN_GAMES || guest.played < MIN_GAMES) return null;
  const perGame = (value: number, team: TeamStats) => value / team.played;
  const form = ((formPoints(home.form) - formPoints(guest.form)) * FORM_WEIGHT) / 2;
  // What a team scores is its own attack meeting the other's defense.
  const homeGoals = (perGame(home.goalsFor, home) + perGame(guest.goalsAgainst, guest)) / 2 + HOME_ADVANTAGE / 2 + form;
  const guestGoals = (perGame(guest.goalsFor, guest) + perGame(home.goalsAgainst, home)) / 2 - HOME_ADVANTAGE / 2 - form;
  const diff = homeGoals - guestGoals;
  const guestWins = phi((-0.5 - diff) / SPREAD);
  const homeWins = 1 - phi((0.5 - diff) / SPREAD);
  return { home: homeWins, draw: 1 - homeWins - guestWins, guest: guestWins, homeGoals, guestGoals };
}
