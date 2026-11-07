import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseSnapshot } from '../lib/fantasy/snapshot.ts';

try {
  if (!process.argv[2]) throw new Error('Usage: npm run snapshot:import -- path/to/snapshot.json');
  const snapshot = parseSnapshot(await readFile(resolve(process.argv[2]), 'utf8'));
  const content = JSON.stringify(snapshot, null, 2) + '\n';
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 12);
  const stamp = new Date(snapshot.captured_at).toISOString().replaceAll(':', '-');
  const directory = resolve('private/snapshots');
  await mkdir(directory, { recursive: true });
  const destination = resolve(directory, `${stamp}-${snapshot.league.id}-${snapshot.team.id}-${digest}.json`);
  try { await writeFile(destination, content, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  console.log(`Validated snapshot saved locally: ${destination}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Snapshot import failed.');
  process.exitCode = 1;
}
