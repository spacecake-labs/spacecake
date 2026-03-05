import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"
import svgr from "vite-plugin-svgr"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths
import packageJson from "./package.json"

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
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },
  optimizeDeps: {},
  server: {
    hmr: {
      port: 24678,
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    // electron's chromium natively supports modulepreload — skip the polyfill
    // and __vite_mapDeps helper to avoid retaining ~7 MB of source strings
    modulePreload: false,
    // Enable source maps in dev mode
    sourcemap: buildSourcemap ? "inline" : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // no manual chunk for mermaid — it's lazy-loaded via React.lazy() and
          // forcing it into a named chunk causes __vitePreload to land there,
          // making every chunk in the app statically depend on it.

          // codemirror-lang-mermaid is lazy-loaded separately — don't bundle with core codemirror
          if (id.includes("node_modules/codemirror-lang-mermaid"))
            return "vendor-codemirror-mermaid"
          if (id.includes("node_modules/@codemirror") || id.includes("node_modules/codemirror"))
            return "vendor-codemirror"
          if (id.includes("node_modules/@lexical") || id.includes("node_modules/lexical"))
            return "vendor-lexical"
          if (id.includes("node_modules/effect") || id.includes("node_modules/@effect"))
            return "vendor-effect"
        },
      },
    },
  },
})
