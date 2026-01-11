import path from "path"

import { defineConfig } from "vite"

const buildSourcemap =
  process.env.NODE_ENV === "development" || process.env.IS_PLAYWRIGHT === "true"

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      external: [
        // don't bundle
        "electron",
        "web-tree-sitter",
        "tree-sitter-python",
        "tree-sitter-typescript",
        "@parcel/watcher",
        "@lydell/node-pty",
        "bufferutil",
        "utf-8-validate",
      ],
    },
    sourcemap: buildSourcemap ? "inline" : false,
  },
})
