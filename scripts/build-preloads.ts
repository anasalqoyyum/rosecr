import { buildSync } from 'esbuild';

buildSync({
  entryPoints: [
    'src/preload/controller-preload.ts',
    'src/preload/capture-preload.ts',
    'src/preload/overlay-preload.ts'
  ],
  outdir: 'dist/src/preload',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron']
});
