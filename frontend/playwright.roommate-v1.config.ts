import { defineConfig } from "@playwright/test";

const frontendDirectory = __dirname;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /roommate-v1-release\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results/roommate-v1",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3000",
    cwd: frontendDirectory,
    url: "http://localhost:3000",
    reuseExistingServer: false,
    env: {
      NODE_ENV: "development",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:4001"
    }
  }
});
