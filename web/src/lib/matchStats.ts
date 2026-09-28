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
}

const isGoal = (e: MatchEvent) => e.type === 'goal' || e.type === 'sevenGoal';

export function matchStats(report: Report): { home: SideStats; guest: SideStats } {
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
    };
  };
  const home = make('home');
  const guest = make('guest');
  let run = { side: null as 'home' | 'guest' | null, length: 0 };
  for (const e of report.events.filter(isGoal)) {
    const diff = e.homeScore - e.guestScore;
    home.maxLead = Math.max(home.maxLead, diff);
    guest.maxLead = Math.max(guest.maxLead, -diff);
    run = e.side === run.side ? { side: run.side, length: run.length + 1 } : { side: e.side, length: 1 };
    if (run.side) {
      const s = run.side === 'home' ? home : guest;
      s.longestRun = Math.max(s.longestRun, run.length);
    }
  }
  return { home, guest };
}
