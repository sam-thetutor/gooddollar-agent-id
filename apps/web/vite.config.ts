import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, "../../"), "");
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET || "https://gcopilot-api.geinz.lol";

  return {
    plugins: [react()],
    // Load VITE_* vars from the monorepo root .env.
    envDir: resolve(__dirname, "../../"),
    server: {
      port: 5173,
      host: true,
      // Allow tunnel hostnames (cloudflared/ngrok) to reach the dev server.
      allowedHosts: true,
      // Proxy API calls through the same origin when VITE_API_BASE_URL=/api.
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
        "/host": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
