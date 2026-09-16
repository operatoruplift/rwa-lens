import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `server-only` exists to fail a build if a server module is pulled into a
      // client bundle. Under vitest there is no such boundary, so it resolves to
      // its throwing client entry; the empty module keeps the guard meaningful
      // in Next while letting these server modules be unit tested directly.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});
