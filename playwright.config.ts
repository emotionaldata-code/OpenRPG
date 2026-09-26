import { defineConfig } from '@playwright/test';
export default defineConfig({
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  testDir: './tests/browser', timeout: 45000, workers: 1, fullyParallel: false,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 1000 }, launchOptions: { args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
