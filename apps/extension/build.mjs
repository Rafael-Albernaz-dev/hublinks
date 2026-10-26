import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { configureManifest, deploymentOrigin } from './build-config.mjs';

const origin = deploymentOrigin(process.env.HUB_EXTENSION_ORIGIN);
await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
const manifest = JSON.parse(await readFile('static/manifest.json', 'utf8'));
await writeFile(
  'dist/manifest.json',
  JSON.stringify(configureManifest(manifest, origin), null, 2) + '\n',
);
await build({
  entryPoints: ['src/background.ts', 'src/autofill.ts', 'src/content.ts', 'src/popup.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  define: { __HUB_EXTENSION_ORIGIN__: JSON.stringify(origin) },
});
