import { defineConfig } from "@playwright/test"

/**
 * playwright config for memory benchmarks.
 * separated from the main config so benchmarks are excluded from CI / `just e2e`.
 * run via `just bench`.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/memory-benchmark*",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "off",
    screenshot: "off",
  },
  outputDir: "test-results",
  expect: {
    timeout: 10_000,
  },
  projects: [
    {
      name: "electron",
      use: {},
    },
  ],
})
