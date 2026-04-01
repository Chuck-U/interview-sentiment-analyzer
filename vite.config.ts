import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Mirror tsconfig.json "paths" so Rollup resolves the same imports as tsc.
      "@components": path.resolve(__dirname, "./src/components"),
      "@electron": path.resolve(__dirname, "./electron"),
      "@backend": path.resolve(__dirname, "./src/backend"),
      "@workers": path.resolve(__dirname, "./src/workers"),
      "@pipelines": path.resolve(__dirname, "./src/pipelines"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
});
