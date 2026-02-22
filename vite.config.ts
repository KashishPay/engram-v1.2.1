import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.', // Source files are in root
  base: './', // CRITICAL: Ensures assets use relative paths (e.g. "./script.js") instead of absolute ("/script.js") which fail on mobile
  publicDir: 'public', // ENABLED: Serves content from the 'public' folder (like images/error) at the root
  build: {
    target: 'es2015', // CHANGED: Maximum compatibility mode (ES6) for older Android 10/11 devices
    outDir: 'dist',
    emptyOutDir: true,
    // Ensure we copy these specific assets manually if needed, 
    // or let Vite resolve imports. 
    // Since images are referenced via URL string in code, we ensure they exist.
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
});