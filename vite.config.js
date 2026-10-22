import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/weather-scene-card.js',
      formats: ['es'],
      fileName: () => 'weather-scene-card.js',
    },
    outDir: 'dist',
    target: 'es2022',
    minify: true,
    // lib mode keeps whitespace in ES output; HA loads this file on every
    // dashboard open, so minify it fully
    rolldownOptions: { output: { minify: true } },
  },
});
