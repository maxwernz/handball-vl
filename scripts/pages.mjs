// GitHub Pages has no SPA rewrite rules. Publish a real document for every
// known route so shared links, refreshes and installed shortcuts return 200.
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('dist');
const shell = await fs.readFile(path.join(output, 'index.html'));
const index = JSON.parse(await fs.readFile(path.join(output, 'api/index.json'), 'utf8'));
const routes = new Set(['ligen', 'live', 'statistik', 'suche', 'vergleich']);
for (const season of index.seasons) {
  for (const [folder, route] of [['league', 'liga'], ['team', 'team'], ['game', 'spiel'], ['player', 'spieler']]) {
    const files = await fs.readdir(path.join(output, 'api/s', String(season.id), folder)).catch((error) => {
      if (error.code === 'ENOENT') return []; // e.g. a new season before the first player report
      throw error;
    });
    for (const file of files) {
      if (/^[a-zA-Z0-9-]+\.json$/.test(file)) routes.add(`${route}/${file.slice(0, -5)}`);
    }
  }
}
for (const route of routes) {
  const folder = path.join(output, route);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'index.html'), shell);
}
await fs.writeFile(path.join(output, '404.html'), shell);
console.log(`Published ${routes.size} direct routes for GitHub Pages.`);
