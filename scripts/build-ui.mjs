// Builds each UI entry into a single self-contained HTML file (MCP Apps views
// run in sandboxed iframes without a same-origin server, so everything is inlined).
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "ui");
const outDir = path.resolve(root, "..", "..", "dist", "ui");
const dev = process.env.NODE_ENV === "development";

for (const [i, entry] of ["view.html", "playground.html"].entries()) {
  await build({
    root,
    logLevel: "warn",
    plugins: [viteSingleFile()],
    build: {
      outDir,
      emptyOutDir: i === 0,
      sourcemap: dev ? "inline" : false,
      minify: !dev,
      cssMinify: !dev,
      rollupOptions: { input: path.join(root, entry) },
    },
  });
  console.log(`built ${entry}`);
}
