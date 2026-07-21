import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, "../../"), "");
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET || "https://gcopilot-api.geinz.lol";
  const isProd = mode === "production";

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (
              id.includes("@reown/appkit") ||
              id.includes("@wagmi") ||
              id.includes("/wagmi/") ||
              id.includes("/viem/")
            ) {
              return "wallet-vendor";
            }
            if (id.includes("react-dom") || id.includes("/react/")) {
              return "react-vendor";
            }
          },
        },
      },
    },
    // Load VITE_* vars from the monorepo root .env.
    envDir: resolve(__dirname, "../../"),
    // Never ship local dev host URLs in production bundles (see host.ts → /host).
    define: isProd
      ? {
          "import.meta.env.VITE_HOST_BASE_URL": '""',
          "import.meta.env.VITE_HOST_LIST_BASE_URL": '""',
          "import.meta.env.VITE_HOST_USE_LOCAL": '""',
        }
      : {},
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
