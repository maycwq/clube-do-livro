import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against `npm run dev` with an in-memory database, so
// they exercise the real handler and SQL without touching .data/.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:5174' },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    env: { LOCAL_DB_DIR: 'memory://', DATABASE_URL: '', LOCAL_RATE_LIMIT: '10000' },
    reuseExistingServer: false,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
