import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, HEALTH_URL } from './src/env.ts'

const browser = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
}

export default defineConfig({
  testDir: 'tests',
  outputDir: '.test-tmp/results',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '.test-tmp/report' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'parallel', testIgnore: /broadcast\.spec\.ts/, use: browser },
    { name: 'broadcast', testMatch: /broadcast\.spec\.ts/, dependencies: ['parallel'], use: browser },
  ],
  webServer: {
    command: 'node src/serve.ts',
    url: HEALTH_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
