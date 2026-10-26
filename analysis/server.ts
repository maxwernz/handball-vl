// MCP server (stdio) that lets an AI assistant query the handball database.
// Start: `node --disable-warning=ExperimentalWarning analysis/server.ts` (see analysis/README.md).

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { dbFile, update } from './update.ts';
import { videoTimestamps } from './video.ts';

const schemaDoc = fs.readFileSync(path.join(import.meta.dirname, 'SCHEMA.md'), 'utf8');
const MAX_ROWS = 5000;
/** The data branch changes at most every 30 minutes; older databases refresh on the next call. */
const REFRESH_MS = 3 * 3600_000;
const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failure = (message: string) => ({ ...text(message), isError: true });

function open() {
  if (!fs.existsSync(dbFile)) update();
  else if (Date.now() - fs.statSync(dbFile).mtimeMs > REFRESH_MS) {
    try {
      update();
    } catch (err) {
      console.error('Aktualisierung fehlgeschlagen, nutze vorhandene Datenbank:', (err as Error).message);
    }
  }
  // Opened per call: a rebuilt database replaces the file, and read-only access cannot change it.
  return new DatabaseSync(dbFile, { readOnly: true });
}

function status() {
  const db = open();
  try {
    const rows = db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[];
    const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return `Datenstand: ${meta.data_updated_at} · ${meta.reports} Spielberichte von ${meta.games} Spielen · Datenbank erstellt ${meta.built_at}`;
  } finally {
    db.close();
  }
}

/** Only single reading statements; the connection is read-only as well. */
export function checkSql(sql: string) {
  const body = sql.trim().replace(/;\s*$/, '');
  if (!/^(select|with|explain|pragma\s+table_info)\b/i.test(body)) return 'Nur SELECT- bzw. WITH-Abfragen sind erlaubt.';
  if (/\b(attach|detach)\b/i.test(body)) return 'ATTACH/DETACH ist nicht erlaubt.';
  return null;
}

export function runQuery(sql: string, maxRows = 500) {
  const problem = checkSql(sql);
  if (problem) throw new Error(problem);
  const db = open();
  try {
    const rows: unknown[] = [];
    let truncated = false;
    for (const row of db.prepare(sql.trim().replace(/;\s*$/, '')).iterate()) {
      if (rows.length >= maxRows) { truncated = true; break; }
      rows.push(row);
    }
    return { rows, truncated };
  } finally {
    db.close();
  }
}

const server = new McpServer(
  { name: 'handball-bw', version: '1.0.0' },
  {
    instructions: 'Daten der Handball-Ligen Baden-Württembergs (Ergebnisse, Tabellen, Spielberichte mit Spielverlauf, Strafen, '
      + 'Über-/Unterzahl). Rufe zuerst `schema` auf, dann `query` mit SQLite-SQL. Für Video-Zeitpunkte `video_timestamps`. '
      + 'Antworte auf Deutsch und nenne bei Ergebnissen Spiel, Datum und Spielzeit.',
  },
);

server.registerTool('schema', {
  title: 'Tabellen und Bedeutung',
  description: 'Beschreibt alle Tabellen, Spalten, Codes und Grenzen der Daten, mit Beispielabfragen, plus aktuellen Datenstand. Vor der ersten Abfrage aufrufen.',
  annotations: { readOnlyHint: true },
}, async () => text(`${status()}\n\n${schemaDoc}`));

server.registerTool('query', {
  title: 'SQL-Abfrage',
  description: 'Führt eine lesende SQLite-Abfrage (SELECT/WITH) auf der Handball-Datenbank aus und gibt die Zeilen als JSON zurück.',
  inputSchema: {
    sql: z.string().describe('Eine einzelne SELECT- oder WITH-Abfrage'),
    max_rows: z.number().int().min(1).max(MAX_ROWS).optional().describe('Höchstzahl Zeilen (Standard 500)'),
  },
  annotations: { readOnlyHint: true },
}, async ({ sql, max_rows }) => {
  try {
    const { rows, truncated } = runQuery(sql, max_rows);
    return text(JSON.stringify({ rowCount: rows.length, truncated, rows }));
  } catch (err) {
    return failure(`Abfragefehler: ${(err as Error).message}`);
  }
});

server.registerTool('video_timestamps', {
  title: 'Spielzeit in Videozeit umrechnen',
  description: 'Rechnet Spielzeiten (MM:SS) in Videozeitpunkte um, ausgehend vom Anpfiff jeder Halbzeit im Video. '
    + 'Spielunterbrechungen (Auszeiten, Time-out der Schiedsrichter) verschieben die Videozeit nach hinten; der Vorlauf fängt das zum Teil ab.',
  inputSchema: {
    times: z.array(z.string()).min(1).describe('Spielzeiten als MM:SS, z. B. ["22:05", "47:20"]'),
    first_half_kickoff: z.string().describe('Videozeit des Anpfiffs der 1. Halbzeit, H:MM:SS oder MM:SS'),
    second_half_kickoff: z.string().optional().describe('Videozeit des Anpfiffs der 2. Halbzeit; nötig für Zeiten ab 30:00'),
    lead_seconds: z.number().int().min(0).max(300).optional().describe('Vorlauf vor dem Ereignis in Sekunden (Standard 20)'),
    clip_seconds: z.number().int().min(10).max(600).optional().describe('Länge eines Clips ab Ereignis in Sekunden (Standard 120)'),
  },
  annotations: { readOnlyHint: true },
}, async (input) => {
  try {
    return text(JSON.stringify(videoTimestamps(input)));
  } catch (err) {
    return failure((err as Error).message);
  }
});

server.registerTool('update_data', {
  title: 'Daten aktualisieren',
  description: 'Holt den neuesten Datenstand aus dem Repository (Branch "data") und baut die Datenbank neu. Fragt handball4all nicht an.',
}, async () => {
  try {
    update();
    return text(status());
  } catch (err) {
    return failure((err as Error).message);
  }
});

if (import.meta.main) await server.connect(new StdioServerTransport());
