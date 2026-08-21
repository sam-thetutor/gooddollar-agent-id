import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      include: ["src"],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        privy: resolve(__dirname, "src/privy.ts"),
        "partner-gamearena": resolve(__dirname, "src/partner-gamearena.ts"),
        "partner-chess-arena": resolve(__dirname, "src/partner-chess-arena.ts"),
      },
      formats: ["es"],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "viem",
        "viem/chains",
        "@goodsdks/citizen-sdk",
        "@privy-io/react-auth",
      ],
      output: {
        assetFileNames: "widget.css",
        inlineDynamicImports: false,
        manualChunks(id) {
          if (
            id.includes("@goodagent/live-arena") ||
            id.includes("/live-arena/")
          ) {
            return "live-arena";
          }
        },
      },
    },
    cssCodeSplit: false,
  },
});
