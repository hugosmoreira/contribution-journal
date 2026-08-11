import { defineConfig } from 'vitest/config'

// Live tests are opt-in: they spend API tokens, so they live outside the
// default `*.test.ts` pattern that `npm test` picks up. Run them with
// `npm run test:live -w packages/ai`.
export default defineConfig({
  test: {
    include: ['test/**/*.live.ts'],
    testTimeout: 180_000,
  },
})
