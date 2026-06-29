import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Load VITE_* vars from the monorepo root .env.
  envDir: resolve(__dirname, "../../"),
  server: {
    port: 5173,
    host: true,
    // Allow tunnel hostnames (cloudflared/ngrok) to reach the dev server.
    allowedHosts: true,
    // Proxy API calls through the same origin so only one HTTPS tunnel is needed.
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
