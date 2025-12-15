import path from "path"

import { coverageConfigDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@assets": path.resolve(__dirname, "./assets"),
    },
  },
  test: {
    include: ["src/**/*.test.(ts|tsx)"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "**/*.config.*",
        "**/scripts/",
        "**/*.tsx",
        ...coverageConfigDefaults.exclude,
      ],
    },
    clearMocks: true,
  },
})
