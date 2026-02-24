import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * NoVoice App Template — Vite Config
 *
 * dev:   normal React dev server (npm run dev)
 * build: IIFE bundle for NoVoice App Store (npm run build → dist/app.bundle.js)
 */
export default defineConfig(({ command }) => {
  if (command === 'build') {
    return {
      plugins: [react({ jsxRuntime: 'classic' })],
      build: {
        lib: {
          entry: 'src/App.jsx',
          name: 'NoVoiceApp',   // ← MUST stay "NoVoiceApp"
          formats: ['iife'],
          fileName: () => 'app.bundle',
        },
        rollupOptions: {
          external: ['react'],
          output: {
            globals: { react: 'React' },
          },
        },
        minify: true,
      },
    };
  }

  // Development: normal Vite React app
  return {
    plugins: [react()],
  };
});
