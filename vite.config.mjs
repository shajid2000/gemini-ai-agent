// vite.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths()
  ],
  build: {
    lib: {
      entry: {
        index: path.resolve('src/index.js'),
        react: path.resolve('src/react/index.js'),
        'shared/audio-recorder': path.resolve('src/shared/audio-recorder.js'),
        'shared/audio-streamer': path.resolve('src/shared/audio-streamer.js'),
        'shared/media-handler': path.resolve('src/shared/media-handler.js'),
      },
      name: 'GeminiAIAgent',
      formats: ['es', 'cjs'],
      fileName: (format, name) =>
        name === 'index' ? `index${format === 'es' ? '.esm.js' : '.js'}` : `${name}${format === 'es' ? '.esm.js' : '.js'}`
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: { react: 'React' }
      }
    },
    sourcemap: true,
    emptyOutDir: true
  }
});
