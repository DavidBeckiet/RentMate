import path from "node:path";
import { defineConfig } from "@playwright/test";

const frontendDirectory = __dirname;
const repositoryDirectory = path.resolve(frontendDirectory, "..");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "mobile-chromium",
      testMatch: /rm054-responsive-accessibility\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true
      }
    }
  ],
  webServer: [
    {
      command: "npm --prefix backend run start:rm054:e2e",
      cwd: repositoryDirectory,
      url: "http://localhost:4100/api/health",
      reuseExistingServer: false,
      env: {
        PORT: "4100",
        FRONTEND_ORIGIN: "http://localhost:3100"
      }
    },
    {
      command: "npm run build && npm run start -- --hostname localhost --port 3100",
      cwd: frontendDirectory,
      url: "http://localhost:3100",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4100"
      }
    }
  ]
});
