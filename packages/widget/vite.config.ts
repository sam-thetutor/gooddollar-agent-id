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
      },
    },
    cssCodeSplit: false,
  },
});
