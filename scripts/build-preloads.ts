import { buildSync } from 'esbuild';

buildSync({
  entryPoints: [
    'src/preload/controller-preload.ts',
    'src/preload/capture-preload.ts',
    'src/preload/overlay-preload.ts',
    'src/preload/region-selector-preload.ts'
  ],
  outdir: 'dist/src/preload',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron']
});

// The region selector shares its geometry with the main process, so it is bundled rather than
// compiled as a standalone script like the other renderers.
buildSync({
  entryPoints: ['src/renderer/region-selector.ts'],
  outfile: 'dist/src/renderer/region-selector.js',
  bundle: true,
  platform: 'browser',
  format: 'iife'
});
