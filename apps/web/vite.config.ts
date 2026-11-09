import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

import { version } from "../../package.json";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy REST calls to the Bun server
      "/api": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
