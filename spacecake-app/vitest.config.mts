import path from "path"

import { coverageConfigDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "**/*.config.*",
        "**/scripts/",
        "**/*.tsx",
        ...coverageConfigDefaults.exclude,
      ],
    },
  },
})
