import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // WASM Threading (threaded mode — disabled by default)
  // ─────────────────────────────────────────────────────
  // Uncomment the server.headers block below AND the matching
  // onHeadersReceived hook in electron/main/index.ts to enable
  // SharedArrayBuffer support required by multi-threaded ONNX WASM.
  // Also set numThreads > 1 in src/renderer/workers/transformers-env.ts.
  //
  // server: {
  //   headers: {
  //     'Cross-Origin-Opener-Policy': 'same-origin',
  //     'Cross-Origin-Embedder-Policy': 'require-corp',
  //   },
  // },
});
