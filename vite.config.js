import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: { port: 3000, open: true },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        minigolf: resolve(__dirname, 'minigolf.html'),
        racing: resolve(__dirname, 'racing.html'),
      },
    },
  },
});
