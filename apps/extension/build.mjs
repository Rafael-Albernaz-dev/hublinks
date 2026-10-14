import { cp, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
await build({
  entryPoints: ['src/background.ts'],
  outfile: 'dist/background.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
});
