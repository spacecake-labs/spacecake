import { defineConfig } from "@playwright/test"
import fs from "fs"

const isContainer = fs.existsSync("/.dockerenv") || fs.existsSync("/run/.containerenv")

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI || isContainer ? 1 : undefined,
  // Stop tests after n failures
  maxFailures: process.env.IS_DEVCONTAINER ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["list"], ["./e2e/time-reporter"]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    /* Take screenshot on failure */
    screenshot: "only-on-failure",
  },
  /* Output directory for test artifacts (screenshots, traces, etc.) */
  outputDir: "test-results",
  // timeout: 30_000,
  expect: {
    timeout: 10_000,
  },

  /* Configure projects for Electron testing */
  projects: [
    {
      name: "electron",
      use: {},
    },
  ],
})
