// Bundles the production server (server/prod.ts) into dist-server/prod.js.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'server/prod.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { entryFileNames: 'prod.js' } },
  },
});
