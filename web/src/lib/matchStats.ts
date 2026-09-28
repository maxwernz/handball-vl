import type { MatchEvent, Report } from '../../../shared/types.ts';

export interface SideStats {
  goals: number;
  fieldGoals: number;
  sevenGoals: number;
  sevenAttempts: number;
  twoMinutes: number;
  warnings: number;
  timeouts: number;
  maxLead: number;
  longestRun: number;
  /** Seconds spent leading. */
  timeLeading: number;
  /** Goals scored with more players on court. */
  powerPlayGoals: number;
}

export interface GameFlow {
  leadChanges: number;
  ties: number;
  duration: number;
}

const isGoal = (e: MatchEvent) => e.type === 'goal' || e.type === 'sevenGoal';

const PENALTY_SECONDS = 120;

export function matchStats(report: Report): { home: SideStats; guest: SideStats; flow: GameFlow } {
  const make = (side: 'home' | 'guest'): SideStats => {
    const sheet = report[side];
    const lines = [...sheet.players, ...sheet.officials];
    const events = report.events.filter((e) => e.side === side);
    const goals = events.filter(isGoal).length;
    const sevenGoals = events.filter((e) => e.type === 'sevenGoal').length;
    return {
      goals,
      fieldGoals: goals - sevenGoals,
      sevenGoals,
      sevenAttempts: sevenGoals + events.filter((e) => e.type === 'sevenMiss').length,
      twoMinutes: lines.reduce((n, l) => n + l.twoMinutes.length, 0),
      warnings: lines.filter((l) => l.warning).length,
      timeouts: events.filter((e) => e.type === 'timeout').length,
      maxLead: 0,
      longestRun: 0,
      timeLeading: 0,
      powerPlayGoals: 0,
    };
  };
  const home = make('home');
  const guest = make('guest');
  const duration = Math.max(3600, ...report.events.map((e) => e.t));
  const flow: GameFlow = { leadChanges: 0, ties: 0, duration };
  let run = { side: null as 'home' | 'guest' | null, length: 0 };
  let leader: 'home' | 'guest' | null = null;
  let prev = { t: 0, diff: 0 };
  const addTime = (until: number) => {
    if (prev.diff > 0) home.timeLeading += until - prev.t;
    if (prev.diff < 0) guest.timeLeading += until - prev.t;
  };
  report.events.forEach((e, index) => {
    if (!isGoal(e)) return;
    const diff = e.homeScore - e.guestScore;
    addTime(e.t);
    prev = { t: e.t, diff };
    if (diff === 0) flow.ties++;
    const now = diff > 0 ? 'home' : diff < 0 ? 'guest' : leader;
    if (leader && now !== leader) flow.leadChanges++;
    leader = now;
    const serving = (side: 'home' | 'guest') =>
      report.events.filter(
        (p, i) => i < index && p.side === side && (p.type === 'twoMinutes' || p.type === 'disqualification') && e.t - p.t < PENALTY_SECONDS,
      ).length;
    if (e.side && serving(e.side) < serving(e.side === 'home' ? 'guest' : 'home')) (e.side === 'home' ? home : guest).powerPlayGoals++;
    home.maxLead = Math.max(home.maxLead, diff);
    guest.maxLead = Math.max(guest.maxLead, -diff);
    run = e.side === run.side ? { side: run.side, length: run.length + 1 } : { side: e.side, length: 1 };
    if (run.side) {
      const s = run.side === 'home' ? home : guest;
      s.longestRun = Math.max(s.longestRun, run.length);
    }
  });
  addTime(duration);
  return { home, guest, flow };
}
