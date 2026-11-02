// Local tool for the internal statistics. Passwords live in .team-secrets.json (git-ignored).
//
//   node team/cli.ts setup [--view <pw>] [--upload <pw>]  create or change passwords (new salts)
//   node team/cli.ts token                                 store the GitHub token for uploads (asks for it)
//   node team/cli.ts secrets                               copy the secrets to GitHub (gh secret set)
//   node team/cli.ts import <folder> [--id <h4a id>]       add score/game/players.html from a folder to .team-data
//   node team/cli.ts build                                 rebuild .team-data/bundle.enc
//   node team/cli.ts show                                  print passwords

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { passwordKey, randomBytes, seal, toB64 } from './lib/crypto.ts';
import { detectFile, parseFiles } from './lib/parse.ts';
import { bestCandidate, candidates } from './lib/match.ts';
import { customId } from './lib/game.ts';
import { Store, type Secrets } from './store.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SECRETS = path.join(ROOT, '.team-secrets.json');
const CONFIG = path.join(ROOT, 'team/config.json');
const DATA = path.join(ROOT, '.team-data');

type LocalSecrets = Secrets & { token?: string };

const WORDS = (
  'anwurf aufsetzer ballgewinn block deckung doppelpass dreher durchbruch einlaeufer flugball fluegel freiwurf ' +
  'gegenstoss halle harz heber kempa konter kreis kreislaeufer linkshaender mannschaft parade pass rueckraum ' +
  'schlagwurf siebenmeter sprungwurf steinlach tempo torwart trikot unterzahl ueberzahl wechsel wurf zeitstrafe ' +
  'abwehr angriff auszeit mitte anpfiff halbzeit spielzug finte schritt prellen sperre absetzen kombination ' +
  'heimspiel auswaerts tribuene derby bank kapitaen trainer schiri pfiff punkte tabelle saison spieltag'
).split(' ');

function generatePassword(words: number) {
  const bytes = randomBytes(words + 1);
  const parts = Array.from({ length: words }, (_, i) => WORDS[bytes[i] % WORDS.length]);
  return `${parts.join('-')}-${10 + (bytes[words] % 90)}`;
}

async function readJson<T>(file: string): Promise<T | null> {
  return JSON.parse(await fs.readFile(file, 'utf8').catch(() => 'null'));
}
const writeJson = (file: string, value: unknown) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function secrets(): Promise<LocalSecrets> {
  const s = await readJson<LocalSecrets>(SECRETS);
  if (!s) throw new Error('Noch nicht eingerichtet: node team/cli.ts setup');
  return s;
}

async function sealToken(config: Record<string, string>, s: LocalSecrets) {
  config.uploadToken = s.token ? await seal(await passwordKey(s.uploadPassword, config.uploadSalt), s.token) : '';
}

async function setup() {
  const old = await readJson<LocalSecrets>(SECRETS);
  const config = (await readJson<Record<string, string>>(CONFIG))!;
  const s: LocalSecrets = {
    viewPassword: arg('view') ?? old?.viewPassword ?? generatePassword(3),
    uploadPassword: arg('upload') ?? old?.uploadPassword ?? generatePassword(5),
    storageKey: old?.storageKey ?? toB64(randomBytes(32)),
    ...(old?.token ? { token: old.token } : {}),
  };
  if (!old || s.viewPassword !== old.viewPassword) config.viewSalt = toB64(randomBytes(16));
  if (!old || s.uploadPassword !== old.uploadPassword) config.uploadSalt = toB64(randomBytes(16));
  await sealToken(config, s);
  await writeJson(SECRETS, s);
  await writeJson(CONFIG, config);
  console.log('Eingerichtet. Passwörter: node team/cli.ts show. Danach: node team/cli.ts secrets');
}

async function token() {
  const s = await secrets();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const value = (await rl.question('GitHub-Token (fine-grained, nur handball-vl, Actions: Read and write): ')).trim();
  rl.close();
  if (!/^(github_pat_|ghp_)\w+$/.test(value)) throw new Error('Das sieht nicht wie ein GitHub-Token aus.');
  s.token = value;
  const config = (await readJson<Record<string, string>>(CONFIG))!;
  await sealToken(config, s);
  await writeJson(SECRETS, s);
  await writeJson(CONFIG, config);
  console.log('Token verschlüsselt in team/config.json gespeichert. Jetzt committen und pushen.');
}

function pushSecrets(s: LocalSecrets) {
  const repo = 'maxwernz/handball-vl';
  for (const [name, value] of [['TEAM_PASSWORD', s.viewPassword], ['TEAM_UPLOAD_PASSWORD', s.uploadPassword], ['TEAM_STORAGE_KEY', s.storageKey]]) {
    execFileSync('gh', ['secret', 'set', name, '--repo', repo], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
  }
}

async function apiLoader(): Promise<<T>(p: string) => Promise<T>> {
  const local = path.join(ROOT, 'web/public/api');
  const base = arg('api') ?? (await fs.stat(local).then(() => local, () => 'https://maxwernz.github.io/handball-vl/api'));
  console.log(`Spielplan aus ${base}`);
  return async <T>(p: string) =>
    (base.startsWith('http') ? ((await (await fetch(`${base}/${p}.json`)).json()) as T) : (JSON.parse(await fs.readFile(path.join(base, `${p}.json`), 'utf8')) as T));
}

async function importFolder(folder: string) {
  const files: Partial<Record<'score' | 'game' | 'players', string>> = {};
  for (const name of await fs.readdir(folder)) {
    if (!name.endsWith('.html')) continue;
    const html = await fs.readFile(path.join(folder, name), 'utf8');
    const kind = detectFile(html);
    if (kind) files[kind] = html;
  }
  if (!files.score || !files.game || !files.players) throw new Error('Im Ordner fehlen score.html, game.html oder players.html.');
  const all = files as { score: string; game: string; players: string };
  const parsed = parseFiles(all);
  const config = (await readJson<{ team: string }>(CONFIG))!;
  const list = await candidates(await apiLoader(), config.team, parsed);
  const id = arg('id');
  const pick = id ? list.find((c) => c.meta.id === id) : bestCandidate(list);
  const meta = pick?.meta ?? { id: customId(arg('date') ?? new Date().toISOString(), parsed.opponent), date: arg('date') ?? new Date().toISOString().slice(0, 16), opponent: parsed.opponent, home: null };
  console.log(pick ? `Zugeordnet: ${meta.date} ${meta.home ? 'gegen' : 'bei'} ${meta.opponent} (${meta.id})` : 'Kein h4a-Spiel gefunden, als eigenes Spiel gespeichert.');
  const store = new Store(DATA, await secrets());
  console.log(await store.apply({ action: 'upload', files: all, meta }));
  if (parsed.warnings.length) console.log('Hinweise:\n- ' + parsed.warnings.join('\n- '));
  await store.build();
}

const [command, param] = process.argv.slice(2);
switch (command) {
  case 'setup': await setup(); break;
  case 'token': await token(); break;
  case 'secrets': pushSecrets(await secrets()); console.log('Secrets bei GitHub gesetzt.'); break;
  case 'import': await importFolder(param); break;
  case 'build': console.log(`${(await new Store(DATA, await secrets()).build()).games.length} Spiele im Bundle.`); break;
  case 'show': {
    const s = await secrets();
    console.log(`Mannschafts-Passwort: ${s.viewPassword}\nUpload-Passwort:      ${s.uploadPassword}\nToken hinterlegt:     ${s.token ? 'ja' : 'nein'}`);
    break;
  }
  default:
    console.log('Befehle: setup, token, secrets, import <ordner>, build, show');
}
