import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome111",
    rollupOptions: {
      input: { content: resolve(__dirname, "src/content.ts") },
      output: { entryFileNames: "[name].js", format: "iife" },
    },
  },
});
