import { cp, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
await build({
  entryPoints: ['src/background.ts', 'src/autofill.ts', 'src/content.ts', 'src/popup.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
});
