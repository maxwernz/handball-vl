import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export type Row = Record<string, SqlValue>;
export interface Result { columns: string[]; rows: SqlValue[][] }

let db: Database | null = null;

export async function loadDatabase(onProgress: (text: string) => void) {
  onProgress('Lade SQLite …');
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  onProgress('Lade Datenbank …');
  // no-cache: revalidate with the server (ETag), so a new data snapshot shows up right away.
  const response = await fetch(`${import.meta.env.BASE_URL}handball.db.gz`, { cache: 'no-cache' });
  if (!response.ok || !response.body) throw new Error(`Datenbank nicht gefunden (HTTP ${response.status})`);
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(`Lade Datenbank … ${(loaded / 1e6).toFixed(1)}${total ? ` / ${(total / 1e6).toFixed(1)}` : ''} MB`);
  }
  let bytes = new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
  // Pages serves the file as is; some servers already unpack it (Content-Encoding: gzip).
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    onProgress('Entpacke Datenbank …');
    const unpacked = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
    bytes = new Uint8Array(await new Response(unpacked).arrayBuffer());
  }
  db = new SQL.Database(bytes);
  db.create_function('sqrt', (x: number | null) => (x === null ? null : Math.sqrt(x)));
  db.create_function('ln', (x: number | null) => (x === null || x <= 0 ? null : Math.log(x)));
  db.create_function('power', (x: number | null, y: number | null) => (x === null || y === null ? null : x ** y));
}

export function run(sql: string): Result {
  if (!db) throw new Error('Datenbank nicht geladen');
  const out = db.exec(sql);
  const last = out[out.length - 1];
  return last ? { columns: last.columns, rows: last.values } : { columns: [], rows: [] };
}

export function rows<T = Row>(sql: string): T[] {
  const { columns, rows: values } = run(sql);
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])) as T);
}

export const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;
