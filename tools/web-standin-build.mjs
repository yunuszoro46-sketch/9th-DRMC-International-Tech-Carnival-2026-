// STAND-IN build for environments where `npm install` is blocked (no Vite). Bundles web/src with esbuild into web/dist so the real
// server can serve the React app for browser testing. It is NOT the production build: use `npm run web:install && npm run web:build`.
// Differences from Vite: @fontsource/* CSS is stubbed (system fonts), output names differ.
// Usage: ESBUILD_DIR=/path/to/node_modules/esbuild NODE_PATH=/path/to/node_modules node tools/web-standin-build.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_DIR || "esbuild");
const dist = path.join(root, "dist");
fs.rmSync(dist, { recursive: true, force: true });
const stubFonts = { name: "stub-fonts", setup(b) {
  b.onResolve({ filter: /^@fontsource\// }, (a) => ({ path: a.path, namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "", loader: "css" }));
} };
const res = await esbuild.build({
  entryPoints: [path.join(root, "src/main.jsx")], bundle: true, splitting: true, format: "esm", outdir: path.join(dist, "assets"), publicPath: "/assets", metafile: true,
  jsx: "automatic", loader: { ".png": "file", ".svg": "file", ".jpg": "file", ".webp": "file" }, assetNames: "[name]-[hash]", minify: true, sourcemap: false,
  plugins: [stubFonts], nodePaths: (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean), define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
});
const pub = path.join(root, "public");
if (fs.existsSync(pub)) fs.cpSync(pub, dist, { recursive: true });   // Vite copies web/public to the site root too
const html = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(
  /<script type="module" src="\/src\/main.jsx"><\/script>/,
  '<link rel="stylesheet" href="/assets/main.css" /><script type="module" src="/assets/main.js"></script>');
fs.writeFileSync(path.join(dist, "index.html"), html);
const kb = (n) => (n / 1024).toFixed(1) + " KB";
for (const [f, m] of Object.entries(res.metafile.outputs)) if (/\.(js|css)$/.test(f)) console.log(path.relative(root, f).padEnd(40), kb(m.bytes));
