/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** the single file has no separate icon or manifest to point at */
const dropLinks = { name: 'drop-links', transformIndexHtml: (h: string) => h.replace(/\s*<link rel="(icon|manifest)"[^>]*>/g, '') };

// `npm run build`        → dist/: a folder of files for a web server (GitHub Pages, an intranet server…)
// `npm run build:single` → single/FMAREA.html: one file that runs straight from a synced SharePoint/OneDrive folder
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react(), ...(single ? [dropLinks, viteSingleFile({ removeViteModuleLoader: true })] : [])],
    // the single file has no service worker, manifest or separate icon: everything is inside it
    publicDir: single ? false : 'public',
    define: { 'import.meta.env.SINGLE': JSON.stringify(single) },
    build: { target: 'es2022', chunkSizeWarningLimit: 4000, outDir: single ? 'single' : 'dist', assetsInlineLimit: single ? 100_000_000 : 4096 },
    test: { environment: 'jsdom', include: ['src/**/*.test.ts'] }
  };
});
