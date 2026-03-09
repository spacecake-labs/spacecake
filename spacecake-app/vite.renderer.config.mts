import path from "path"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
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
  optimizeDeps: {
    include: [
      // react core — often missed on first crawl in electron-forge setups
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      // heavy deps with deep sub-dependency trees
      "effect",
      "@effect/platform",
      "@effect/platform-browser",
      "lexical",
      "@lexical/code",
      "@lexical/history",
      "@lexical/link",
      "@lexical/list",
      "@lexical/markdown",
      "@lexical/rich-text",
      "@lexical/table",
      "codemirror",
      "@codemirror/lang-javascript",
      "@codemirror/lang-python",
      "@codemirror/lang-json",
      "@codemirror/lang-markdown",
      "@codemirror/lang-css",
      "@codemirror/lang-yaml",
      "@codemirror/merge",
      "@codemirror/theme-one-dark",
      // radix — barrel re-exports cause late discovery
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-context-menu",
      // tanstack
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@tanstack/react-table",
      "@tanstack/react-virtual",
      // state + ui
      "jotai",
      "xstate",
      "@xstate/react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "cmdk",
      "lucide-react",
      "sonner",
      "react-resizable-panels",
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
