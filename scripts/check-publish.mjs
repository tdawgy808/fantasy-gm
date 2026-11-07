import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

// Explicit allowlist: publishing must use this manifest, never a recursive folder upload.
const roots = ['app', 'lib', 'public', 'scripts', 'tests', 'docs'];
const files = ['.env.example', '.gitignore', 'AGENTS.md', 'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'eslint.config.mjs', 'proxy.ts', 'vercel.json'];
async function walk(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`Symlink is not publishable: ${path}`);
  if (stat.isDirectory()) {
    for (const entry of await readdir(path)) await walk(`${path}/${entry}`);
  } else files.push(path);
}
for (const root of roots) await walk(root);
const manifest = [];
const suspects = [];
for (const file of files.sort()) {
  const path = file.replaceAll('\\', '/');
  if (/(^|\/)(node_modules|private|data|logs|certificates|sessions|\.sessions|\.git|\.next)(\/|$)|\.(pem|key|p12|pfx|crt|log|db|sqlite|session)$/i.test(path) ||
      /(^|\/)\.env/.test(path) && path !== '.env.example' ||
      /(?:token|secret|credential|cookie|storageState)/i.test(path)) throw new Error(`Forbidden publication path: ${path}`);
  if ((await lstat(file)).isSymbolicLink()) throw new Error(`Symlink is not publishable: ${file}`);
  const bytes = await readFile(file);
  const text = bytes.toString('utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|["'](?:access_token|refresh_token|client_secret|password)["']\s*:\s*["'][^"']{12,}["']/i.test(text)) suspects.push(path);
  manifest.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
if (suspects.length) throw new Error(`Review possible credentials in: ${suspects.join(', ')}`);
// Verify patterns against representative private paths using the same ignore parser as ESLint.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const ignore = require('ignore');
const matcher = ignore().add(await readFile('.gitignore', 'utf8'));
for (const path of ['.env','.env.local','.env.production.local','.env.backup','node_modules/example/index.js','private/snapshots/example.json','data/example.json','certificates/localhost.pem','sessions/session.json','.sessions/example','tokens.json','client-secret.json','cookies.json','storageState.json','.next/server/app.js']) {
  if (!matcher.ignores(path)) throw new Error(`Missing Git exclusion for: ${path}`);
}
for (const item of manifest) if (matcher.ignores(item.path)) throw new Error(`Source accidentally ignored: ${item.path}`);
await mkdir('private/migration-review', { recursive: true });
await writeFile(resolve('private/migration-review/publish-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`PASS: ${manifest.length} allowlisted files scanned; credential exclusions verified. Manifest: ${relative(process.cwd(), resolve('private/migration-review/publish-manifest.json'))}`);
