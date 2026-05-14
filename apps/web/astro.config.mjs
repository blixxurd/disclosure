import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// SSR (server) output so we can run FTS5 search endpoints. Most pages
// can still be statically pre-rendered via `export const prerender = true`.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // better-sqlite3 is a native module; let Vite know to leave it alone.
    ssr: {
      external: ['better-sqlite3'],
    },
  },
});
