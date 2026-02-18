import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"
import svgr from "vite-plugin-svgr"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

import packageJson from "@/../package.json"

const buildSourcemap =
  process.env.NODE_ENV === "development" || process.env.IS_PLAYWRIGHT === "true"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    svgr(),
    tailwindcss(),
    wasm(),
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@assets": path.resolve(__dirname, "./assets"),
      mermaid: path.join(__dirname, "node_modules/mermaid/dist/mermaid.esm.min.mjs"),
    },
  },
  assetsInclude: ["./src/drizzle/*.sql"],
  optimizeDeps: {
    exclude: [
      "web-tree-sitter",
      "tree-sitter-python",
      "tree-sitter-typescript",
      "@electric-sql/pglite",
    ],
  },
  server: {
    hmr: {
      port: 24678,
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    // Enable source maps in dev mode
    sourcemap: buildSourcemap ? "inline" : false,
  },
})
