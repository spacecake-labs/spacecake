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
        // Don't bundle electron
        "electron",
        "chokidar",
        "web-tree-sitter",
        "tree-sitter-python",
      ],
    },
  },
})
