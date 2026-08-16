import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: [
      '@tensorflow/tfjs',
      'upscaler',
      '@upscalerjs/esrgan-slim/2x',
      '@upscalerjs/esrgan-slim/4x',
    ],
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
});
