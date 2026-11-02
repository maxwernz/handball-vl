// Third page: the password-protected team statistics at /intern/. The data is an
// encrypted bundle in the branch "team-data" (see team/README.md); the page only ships code.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'team/web',
  base: `${process.env.BASE_PATH ?? '/'}intern/`,
  build: { outDir: '../../dist/intern', emptyOutDir: true },
  plugins: [
    react(),
    {
      // Dev server: serve the local data (node team/cli.ts import …) instead of GitHub.
      name: 'local-team-data',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.split('?')[0].endsWith('/__bundle.enc')) return next();
          const file = path.resolve('.team-data/bundle.enc');
          if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
          res.setHeader('Content-Type', 'text/plain');
          res.end(fs.readFileSync(file));
        });
      },
    },
  ],
});
