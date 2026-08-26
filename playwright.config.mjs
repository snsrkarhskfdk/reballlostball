import { defineConfig } from "@playwright/test";

const browserExecutable = String(process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "").trim();
const launchOptions = browserExecutable ? { executablePath: browserExecutable } : {};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  webServer: {
    command: "node scripts/dev-server.mjs 4190",
    url: "http://127.0.0.1:4190/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4190/",
    browserName: "chromium",
    headless: true,
    launchOptions,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
