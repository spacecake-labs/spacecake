import { defineConfig } from "vite"

const buildSourcemap =
  process.env.NODE_ENV === "development" || process.env.IS_PLAYWRIGHT === "true"

// https://vitejs.dev/config
export default defineConfig({
  build: {
    // Enable source maps in dev mode
    sourcemap: buildSourcemap ? "inline" : false,
  },
})
