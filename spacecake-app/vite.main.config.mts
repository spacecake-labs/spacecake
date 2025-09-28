import path from "path"

import { defineConfig } from "vite"

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
      ],
    },
  },
})
