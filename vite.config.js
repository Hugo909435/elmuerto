import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  // host + allowedHosts laissent passer un tunnel HTTPS public (cloudflared)
  // devant le serveur de dev — indispensable pour la caméra sur téléphone.
  // proxy /ws -> serveur de lobby (ws) pour que le multijoueur passe lui aussi
  // par le tunnel HTTPS, sans exposer le port 8080 séparément.
  server: {
    port: 3000,
    open: true,
    host: true,
    allowedHosts: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        minigolf: resolve(__dirname, 'minigolf.html'),
        petanque: resolve(__dirname, 'petanque.html'),
        racing: resolve(__dirname, 'racing.html'),
        colorhunt: resolve(__dirname, 'colorhunt.html'),
      },
    },
  },
});
