import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    // Web src alias - mirrors src/web/vite.config.ts and src/web/tsconfig.json
    // so tests under tests/web/ can import via '@/...' identical to runtime.
    alias: {
      '@': fileURLToPath(new URL('./src/web', import.meta.url)),
      // @tanstack/react-query lives in src/web/node_modules (it's a web-only
      // dep). Vitest runs from the project root and doesn't auto-walk into
      // src/web/node_modules, so we map the bare specifier explicitly.
      '@tanstack/react-query': fileURLToPath(
        new URL('./src/web/node_modules/@tanstack/react-query', import.meta.url),
      ),
      // zustand lives only in src/web/node_modules. Pin it explicitly so all
      // imports (including zustand/react.js) resolve to the same copy and
      // share the same React instance that react-dom uses.
      'zustand': fileURLToPath(
        new URL('./src/web/node_modules/zustand', import.meta.url),
      ),
    },
    // Force a single React copy across the test runner. The web bundle has
    // its own node_modules under src/web; without dedupe (combined with
    // the prededupe-react script run by `npm test`), transitive radix-ui
    // imports resolve a nested react copy alongside the root install ->
    // "Invalid hook call" inside any rendered Dialog.
    dedupe: ['react', 'react-dom', 'zustand'],
  },
  test: {
    globals: true,
    root: '.',
    env: {
      MOCKINGBIRD_WATCH_POLL_INTERVAL: '50',
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    // Default environment is node so non-DOM tests don't pay jsdom startup
    // cost. Component tests opt in per-file via the `@vitest-environment
    // jsdom` pragma at the top of the test file.
  },
});
