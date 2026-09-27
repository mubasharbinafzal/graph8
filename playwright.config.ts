import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command:
        ".venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000",
      url: "http://127.0.0.1:8000/ai/config",
      reuseExistingServer: !process.env.CI,
      env: {
        DEMO_MODE: "true",
        DATABASE_PATH: "/tmp/autopilot-browser-tests.sqlite3",
      },
    },
    {
      command: "npm run dev -- --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
