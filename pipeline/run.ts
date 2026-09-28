// Entry point of the data pipeline: sync with h4a, then write the static site data.
// `node pipeline/run.ts`            sync + export
// `node pipeline/run.ts --export`   export only, from what is already in DATA_DIR

import { exportAll } from './export.ts';
import { read } from './store.ts';
import { keys, syncAll, type SeasonIndex } from './sync.ts';

const exportOnly = process.argv.includes('--export');
const index = exportOnly ? await read<SeasonIndex>(keys.index) : await syncAll();
if (!index) throw new Error('No data yet – run without --export first.');
await exportAll(index);
