import { build } from "esbuild";

/**
 * Bundle the MCP server into self-contained ESM artifacts.
 *
 * The server depends on internal, unpublished workspace packages
 * (`@goodagent/chain`, `@goodagent/shared`) plus viem / zod / the MCP SDK.
 * We inline everything so the published package installs and runs via `npx`
 * with zero runtime dependencies.
 */
const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  // Some bundled deps are CJS and call `require`; provide it in the ESM output.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
};

await build({
  ...shared,
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
});

await build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  // Preserve the executable shebang ahead of the require shim.
  banner: {
    js: "#!/usr/bin/env node\n" + shared.banner.js,
  },
});
