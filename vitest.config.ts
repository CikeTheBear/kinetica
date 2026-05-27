import { defineConfig } from 'vitest/config';
import path from 'path';

// Config mínima de vitest. El alias replica el "@/*" del tsconfig para que los
// tests puedan importar módulos del proyecto igual que el código de la app.
export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
