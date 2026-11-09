import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['./live-reporter.ts'], ['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: { actionTimeout: 15_000, baseURL: 'http://localhost:47831', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'bun runtime.ts',
    url: 'http://localhost:47832/info',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'local', testMatch: 'local.spec.ts' },
    { name: 'live', testMatch: 'live.spec.ts', timeout: 180_000 },
  ],
});
