// Parses the h4a "Presseinformation - lang" PDF match report into structured data:
// referees and spectators, both team sheets (goals, 7m, penalties) and the full
// play-by-play. Columns are recognized by the x position of their header labels.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { EventType, MatchEvent, PlayerLine, Report, TeamSheet } from '../shared/types.ts';

interface Cell {
  x: number;
  text: string;
}

interface Row {
  page: number;
  y: number;
  cells: Cell[];
}

async function extractRows(data: Uint8Array): Promise<Row[]> {
  const task = getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  const rows: Row[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    const byY = new Map<number, Cell[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 1) ?? y;
      const cells = byY.get(key) ?? [];
      cells.push({ x: Math.round(item.transform[4]), text: item.str.trim() });
      byY.set(key, cells);
    }
    for (const [y, cells] of [...byY].sort((a, b) => b[0] - a[0])) {
      rows.push({ page, y, cells: cells.sort((a, b) => a.x - b.x) });
    }
  }
  await task.destroy();
  return rows.filter((r) => !/^(Handball4all AG|Presseinformation)/.test(r.cells[0].text));
}

type Column = 'goals' | 'seven' | 'warning' | 'twoMinutes' | 'disqualification' | 'report' | 'total';

const HEADER_LABELS: Record<string, Column> = {
  '(ges)': 'goals',
  'Tore': 'goals',
  '7m/': 'seven',
  'Verw.': 'warning',
  '1.': 'twoMinutes',
  '2.': 'twoMinutes',
  '3.': 'twoMinutes',
  'Disq.': 'disqualification',
  'Ber.': 'report',
  'zus.': 'total',
  'Strafe': 'total',
};

function nearestColumn(x: number, columns: { x: number; column: Column }[]): Column | null {
  let best: { x: number; column: Column } | null = null;
  for (const c of columns) {
    if (!best || Math.abs(c.x - x) < Math.abs(best.x - x)) best = c;
  }
  return best && Math.abs(best.x - x) < 30 ? best.column : null;
}

function parseLine(row: Row, columns: { x: number; column: Column }[]): PlayerLine {
  const [noCell, nameCell, ...rest] = row.cells;
  const line: PlayerLine = {
    no: noCell.text,
    name: nameCell && nameCell.x < 150 ? nameCell.text : '',
    goals: 0,
    sevenGoals: 0,
    sevenAttempts: 0,
    warning: null,
    twoMinutes: [],
    disqualification: null,
    official: /^[A-E]$/.test(noCell.text),
  };
  const firstColumnX = Math.min(...columns.map((c) => c.x));
  for (const cell of rest) {
    if (cell.x < firstColumnX - 15) continue; // birth year and other unused columns
    switch (nearestColumn(cell.x, columns)) {
      case 'goals':
        line.goals = Number(cell.text) || 0;
        break;
      case 'seven': {
        // The column reads "attempts/goals".
        const [attempts, made] = cell.text.split('/').map(Number);
        line.sevenGoals = made || 0;
        line.sevenAttempts = attempts || 0;
        break;
      }
      case 'warning':
        line.warning = cell.text;
        break;
      case 'twoMinutes':
        line.twoMinutes.push(...cell.text.split(/\s+/));
        break;
      case 'disqualification':
        line.disqualification = cell.text;
        break;
    }
  }
  return line;
}

const PLAYER_REF = /^(.+?) \(([\dA-E]+), (.+)\)$/;

function parseAction(action: string): { type: EventType; player: string | null; no: string | null; team: string | null } {
  const patterns: [RegExp, EventType][] = [
    [/^7m-Tor durch (.+)$/, 'sevenGoal'],
    [/^Tor durch (.+)$/, 'goal'],
    [/^7m, KEIN Tor durch (.+)$/, 'sevenMiss'],
    [/^2-min Strafe für (.+)$/, 'twoMinutes'],
    [/^Verwarnung für (.+)$/, 'warning'],
    [/^Disqualifikation für (.+)$/, 'disqualification'],
  ];
  for (const [pattern, type] of patterns) {
    const match = action.match(pattern);
    if (!match) continue;
    const ref = match[1].match(PLAYER_REF);
    if (ref) return { type, player: ref[1], no: ref[2], team: ref[3] };
    const unnamed = match[1].match(/^((?:Offizieller [A-E])|(?:Spieler (\d+))), (.+)$/);
    if (unnamed) return { type, player: unnamed[1], no: unnamed[2] ?? unnamed[1].slice(-1), team: unnamed[3] };
    return { type, player: match[1], no: null, team: null };
  }
  const timeout = action.match(/^Auszeit (.+)$/);
  if (timeout) return { type: 'timeout', player: null, no: null, team: timeout[1] };
  return { type: 'other', player: null, no: null, team: null };
}

function toSeconds(clock: string) {
  const [m, s] = clock.split(':').map(Number);
  return m * 60 + s;
}

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
}

/** `shortNames` are the abbreviated team names h4a uses in the play-by-play. */
export async function parseReport(
  data: Uint8Array,
  gameId: number,
  reportId: number,
  shortNames: { home: string; guest: string },
): Promise<Report> {
  const rows = await extractRows(data);
  const report: Report = {
    gameId,
    reportId,
    fetchedAt: new Date().toISOString(),
    spectators: null,
    referees: [],
    home: { name: '', players: [], officials: [] },
    guest: { name: '', players: [], officials: [] },
    events: [],
  };

  let section: 'overview' | 'home' | 'guest' | 'timeline' = 'overview';
  let columns: { x: number; column: Column }[] = [];
  let homeScore = 0;
  let guestScore = 0;

  for (const row of rows) {
    const first = row.cells[0].text;
    const joined = row.cells.map((c) => c.text).join(' ');

    if (first.startsWith('Heim:') || first.startsWith('Gast:')) {
      section = first.startsWith('Heim:') ? 'home' : 'guest';
      report[section].name = first.slice(5).trim();
      columns = [];
      continue;
    }
    if (first === 'Spielverlauf') {
      section = 'timeline';
      continue;
    }

    if (section === 'overview') {
      const spectators = joined.match(/Zuschauer:\s*(\d+)/);
      if (spectators) report.spectators = Number(spectators[1]);
      if (first === 'Name') {
        report.referees = row.cells.slice(1).map((c) => c.text).filter((n) => n && n !== 'N.N. N.N.' && n !== 'N.N.');
      }
      continue;
    }

    if (section === 'home' || section === 'guest') {
      if (row.cells.some((c) => c.text in HEADER_LABELS) && !/^(\d+|[A-E])$/.test(first)) {
        for (const cell of row.cells) {
          const column = HEADER_LABELS[cell.text];
          if (column && !columns.some((c) => Math.abs(c.x - cell.x) < 5)) columns.push({ x: cell.x, column });
        }
        continue;
      }
      if (/^(\d+|[A-E])$/.test(first)) {
        const line = parseLine(row, columns);
        if (!line.name) continue;
        if (line.name === 'N.N. N.N.') {
          // Players who opted out of publication still count for the team.
          if (line.official || (!line.goals && !line.twoMinutes.length && !line.warning)) continue;
          line.name = `Spieler ${line.no}`;
          line.anonymous = true;
        }
        (line.official ? report[section].officials : report[section].players).push(line);
      }
      continue;
    }

    const event = joined.match(/^(\d\d:\d\d:\d\d)\s+(\d{1,3}:\d\d)\s+(?:(\d+):(\d+)\s+)?(.+)$/);
    if (!event) continue;
    const [, , clock, h, g, action] = event;
    const parsed = parseAction(action);
    let side: MatchEvent['side'] = null;
    if (h !== undefined) {
      const nextHome = Number(h);
      const nextGuest = Number(g);
      if (nextHome > homeScore) side = 'home';
      else if (nextGuest > guestScore) side = 'guest';
      homeScore = nextHome;
      guestScore = nextGuest;
    }
    side ??= resolveSide(report, parsed, shortNames);
    report.events.push({
      clock,
      t: toSeconds(clock),
      type: parsed.type,
      side,
      player: parsed.player,
      no: parsed.no,
      homeScore,
      guestScore,
      text: action,
    });
  }
  return report;
}

function resolveSide(
  report: Report,
  parsed: ReturnType<typeof parseAction>,
  shortNames: { home: string; guest: string },
): MatchEvent['side'] {
  const inSheet = (sheet: TeamSheet) =>
    [...sheet.players, ...sheet.officials].some(
      (p) => p.no === parsed.no && (parsed.player?.startsWith('Offizieller') || normalize(p.name) === normalize(parsed.player ?? '')),
    );
  if (parsed.player) {
    const home = inSheet(report.home);
    const guest = inSheet(report.guest);
    if (home !== guest) return home ? 'home' : 'guest';
  }
  if (parsed.team) {
    const team = normalize(parsed.team);
    if ([report.home.name, shortNames.home].some((n) => normalize(n) === team)) return 'home';
    if ([report.guest.name, shortNames.guest].some((n) => normalize(n) === team)) return 'guest';
  }
  return null;
}
