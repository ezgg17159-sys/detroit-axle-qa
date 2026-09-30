import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { htmlBaseline } from "./plugins/htmlBaseline.ts";

export default defineConfig({
  plugins: [react(), htmlBaseline()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
