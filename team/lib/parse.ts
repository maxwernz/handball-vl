// Parser for the three HTML exports of the statistics app. Works without a DOM so the
// same code runs in the upload page (browser) and in the GitHub workflow (Node).

import { ZONES, type EventKind, type PlayerLine, type StatEvent, type Zone, type ZoneCounts } from './model.ts';

export interface ParsedFiles {
  ownLabel: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  htFor: number;
  htAgainst: number;
  players: PlayerLine[];
  events: StatEvent[];
  warnings: string[];
}

export class ParseError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function text(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Rows of cell texts; a cell with colspan=n is repeated n times so columns line up. */
function tableRows(tableHtml: string) {
  return [...tableHtml.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)].map(([row]) =>
    [...row.matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi)].flatMap(([, , attrs, body]) => {
      const span = Number(/colspan\s*=\s*['"]?(\d+)/i.exec(attrs)?.[1] ?? 1);
      return Array<string>(span).fill(text(body));
    }),
  );
}

function tables(html: string) {
  return [...html.matchAll(/<table[\s>][\s\S]*?<\/table>/gi)].map((m) => ({ index: m.index, rows: tableRows(m[0]) }));
}

const int = (s: string | undefined) => {
  const n = parseInt((s ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};
const frac = (s: string | undefined): [number, number] => {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(s ?? '');
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};
const score = (s: string | undefined): [number, number] | null => {
  const m = /(\d+)\s*:\s*(\d+)/.exec(s ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};

export const normalizeName = (name: string) => name.normalize('NFC').replace(/\s+/g, ' ').trim();

function zoneOf(rest: string): Zone | undefined {
  const r = rest.trim().toLowerCase();
  return ZONES.find((z) => z.toLowerCase() === r);
}

export function classify(action: string): { kind: EventKind; zone?: Zone } {
  const a = action.trim();
  const m = /^(Tor|Fehlwurf|Gegentor|Parade)\s+(.+)$/i.exec(a);
  if (m) {
    const kind = ({ tor: 'goal', fehlwurf: 'miss', gegentor: 'conceded', parade: 'save' } as const)[m[1].toLowerCase() as 'tor'];
    return { kind, zone: zoneOf(m[2]) };
  }
  const l = a.toLowerCase();
  if (/^ballgewinn\s+er\w*zwungen/.test(l)) return { kind: 'forcedSteal' };
  if (l === 'ballgewinn') return { kind: 'steal' };
  if (l === 'ballverlust' || l === 'technischer fehler') return { kind: 'turnover' };
  if (l === 'stopfoul') return { kind: 'foul' };
  if (l === 'assist') return { kind: 'assist' };
  if (l === '7m geholt') return { kind: 'sevenWon' };
  if (l === '7m verursacht') return { kind: 'sevenCaused' };
  if (/^2\s*min/.test(l)) return { kind: 'twoMin' };
  if (l.startsWith('gelb')) return { kind: 'yellow' };
  if (l.startsWith('rot') || l.startsWith('disqual')) return { kind: 'red' };
  return { kind: 'other' };
}

function parseClock(s: string) {
  const m = /^(\d+):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function parseScore(html: string): StatEvent[] {
  const table = tables(html).find((t) => t.rows[0]?.includes('Aktion'));
  if (!table) throw new ParseError('score.html: Tabelle mit Spalte „Aktion“ nicht gefunden.');
  const head = table.rows[0];
  const col = (name: string) => head.indexOf(name);
  const [cTime, cPlayer, cAction, cScore] = [col('Zeit'), col('Spieler'), col('Aktion'), col('Score')];
  if ([cTime, cPlayer, cAction, cScore].some((c) => c < 0)) throw new ParseError('score.html: Spalten Zeit/Spieler/Aktion/Score fehlen.');
  const events: StatEvent[] = [];
  for (const row of table.rows.slice(1)) {
    if (row.length < head.length) continue;
    const t = parseClock(row[cTime]);
    const s = score(row[cScore]);
    if (!Number.isFinite(t) || !s) continue;
    const { kind, zone } = classify(row[cAction]);
    // "Spieler" spans two columns: number, then name.
    events.push({ t, no: row[cPlayer], name: normalizeName(row[cPlayer + 1]), action: row[cAction], kind, ...(zone ? { zone } : {}), for: s[0], against: s[1] });
  }
  if (!events.length) throw new ParseError('score.html enthält keine Aktionen.');
  return events;
}

export function parseGame(html: string) {
  const all = tables(html);
  const header = all[0]?.rows[0];
  if (!header || header.length < 2) throw new ParseError('game.html: Kopfzeile mit den Teamnamen fehlt.');
  const result = all.find((t) => t.rows.some((r) => r[0] === 'Endstand'));
  if (!result) throw new ParseError('game.html: „Endstand“ nicht gefunden.');
  const row = (label: string) => score(result.rows.find((r) => r[0] === label)?.[1]);
  const end = row('Endstand');
  const half = row('1. Halbzeit');
  if (!end) throw new ParseError('game.html: Endstand nicht lesbar.');
  return { ownLabel: header[0], opponent: header[1], goalsFor: end[0], goalsAgainst: end[1], htFor: half?.[0] ?? 0, htAgainst: half?.[1] ?? 0 };
}

const emptyLine = (no: string, name: string): PlayerLine => ({
  name, no, goals: 0, shots: 0, zones: {}, sevenWon: 0, sevenCaused: 0, assists: 0, steals: 0,
  forcedSteals: 0, turnovers: 0, twoMin: 0, red: 0, yellow: 0, fouls: 0,
});

export function parsePlayers(html: string): PlayerLine[] {
  const lines = new Map<string, PlayerLine>();
  const headings = [...html.matchAll(/<h2[\s\S]*?<\/h2>/gi)].map((m) => ({ index: m.index, title: text(m[0]) }));
  for (const table of tables(html)) {
    const title = headings.filter((h) => h.index < table.index).at(-1)?.title ?? '';
    const keeper = /torh/i.test(title);
    const head = table.rows[0] ?? [];
    if (!head.includes('Spieler')) continue;
    const at = (row: string[], name: string) => {
      const i = head.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
      return i < 0 ? '' : row[i];
    };
    for (const row of table.rows.slice(1)) {
      const name = normalizeName(row[1] ?? '');
      if (!name) continue;
      const line = lines.get(name) ?? emptyLine(row[0], name);
      lines.set(name, line);
      const zones: ZoneCounts = {};
      for (const z of ZONES) {
        const [made, att] = frac(at(row, z));
        if (att) zones[z] = [made, att];
      }
      if (keeper) {
        line.keeper = { saves: int(at(row, 'Paraden')), faced: int(at(row, 'Würfe')), zones };
        const [g, s] = frac(at(row, 'Tore'));
        line.goals += g;
        line.shots += s;
      } else {
        line.goals += int(at(row, 'Tore'));
        line.shots += int(at(row, 'Würfe'));
        line.zones = zones;
      }
      line.sevenWon += int(at(row, '+7'));
      line.sevenCaused += int(at(row, '-7'));
      line.assists += int(at(row, 'Assists'));
      line.steals += int(at(row, 'Ballgewinne'));
      line.turnovers += int(at(row, 'Ballverluste'));
      line.twoMin += int(at(row, '2 Min'));
      line.red += int(at(row, 'Rote'));
      line.yellow += int(at(row, 'Gelbe'));
      line.fouls += int(at(row, 'Stopfoul'));
      line.forcedSteals += int(at(row, 'Ballgewinn Er'));
    }
  }
  if (!lines.size) throw new ParseError('players.html: keine Spielerzeilen gefunden.');
  return [...lines.values()];
}

/** Recognises which of the three exports a file is, by its title. */
export function detectFile(html: string): 'score' | 'game' | 'players' | null {
  const title = text(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').toLowerCase();
  if (title === 'score') return 'score';
  if (title.startsWith('spielauswertung')) return 'game';
  if (title.startsWith('einzelstatistik')) return 'players';
  return null;
}

/** Totals per player as counted from the event log, for cross-checking players.html. */
export function eventTotals(events: StatEvent[]) {
  const by = new Map<string, Record<string, number>>();
  for (const e of events) {
    const r = by.get(e.name) ?? {};
    by.set(e.name, r);
    r[e.kind] = (r[e.kind] ?? 0) + 1;
  }
  return by;
}

export function parseFiles(files: { score: string; game: string; players: string }): ParsedFiles {
  const game = parseGame(files.game);
  const events = parseScore(files.score);
  const players = parsePlayers(files.players);
  const warnings: string[] = [];
  const last = events.at(-1)!;
  if (last.for !== game.goalsFor || last.against !== game.goalsAgainst) {
    warnings.push(`Spielverlauf endet ${last.for}:${last.against}, Endstand laut Auswertung ${game.goalsFor}:${game.goalsAgainst}.`);
  }
  const goals = players.reduce((s, p) => s + p.goals, 0);
  if (goals !== game.goalsFor) warnings.push(`Spielertore ergeben ${goals}, Endstand nennt ${game.goalsFor}.`);
  const totals = eventTotals(events);
  for (const p of players) {
    const t = totals.get(p.name) ?? {};
    const pairs: [string, number, number][] = [
      ['Tore', p.goals, t.goal ?? 0],
      ['Würfe', p.shots, (t.goal ?? 0) + (t.miss ?? 0)],
      ['Paraden', p.keeper?.saves ?? 0, t.save ?? 0],
      ['Zeitstrafen', p.twoMin, t.twoMin ?? 0],
    ];
    for (const [label, table, log] of pairs) {
      if (table !== log) warnings.push(`${p.name}: ${label} ${table} laut Spielertabelle, ${log} im Spielverlauf.`);
    }
  }
  return { ...game, players, events, warnings };
}
