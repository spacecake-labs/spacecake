import { defineConfig } from "vite";
import path from "path";

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
        "electron",
        "tree-sitter",
        "tree-sitter-compat",
        "tree-sitter-javascript",
        "tree-sitter-python",
        "tree-sitter-typescript",
      ], // Don't bundle electron or tree-sitter modules
    },
  },
});
