// A separate, browser-only build. Keep Lovable/TanStack Start's server config intact.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: process.env['PAGES_BASE_PATH'] || '/helpmy/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { 'import.meta.env.VITE_STATIC_SITE': 'true' },
  build: {
    outDir: 'dist-pages', emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./pages.html', import.meta.url)) },
  },
});
