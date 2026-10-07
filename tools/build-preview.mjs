// Builds ONE self-contained preview.html of the React app: open it by double-clicking, no server and no install.
//   ESBUILD_DIR=/path/to/node_modules/esbuild NODE_PATH=/path/to/node_modules node tools/build-preview.mjs [out.html]
// Inside the file: the real frontend (web/src, unchanged) and the project's real service + domain + route code running
// in the browser on in-memory sample data (tools/preview/). See tools/preview/backend.js for exactly what is a stand-in.
// It is a DEMO, not the product: nothing is saved, passes are not secure, and the headings load Orbitron from Google
// Fonts when online (the real build bundles its fonts). The older tools/build-preview.js previews the classic public/ UI.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, ".."), web = path.join(root, "web");
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_DIR || "esbuild");
const out = path.resolve(process.argv[2] || path.join(root, "preview.html"));
const nodePaths = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
const stubFonts = { name: "stub-fonts", setup(b) {
  b.onResolve({ filter: /^@fontsource\// }, (a) => ({ path: a.path, namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "", loader: "css" }));
} };
const common = { bundle: true, write: false, minify: true, format: "iife", logLevel: "warning", nodePaths, define: { "process.env.NODE_ENV": '"production"' } };

const backend = await esbuild.build({ ...common, entryPoints: [path.join(here, "preview", "shim.js")], platform: "browser", alias: { crypto: path.join(here, "preview", "crypto-shim.js") } });
const app = await esbuild.build({ ...common, entryPoints: [path.join(web, "src/main.jsx")], outdir: "/preview-out", jsx: "automatic", plugins: [stubFonts],
  loader: { ".png": "dataurl", ".svg": "dataurl", ".jpg": "dataurl", ".webp": "dataurl" },
  // the app is compiled unchanged; these four names are pointed at the stand-ins defined in tools/preview/shim.js
  define: { ...common.define, "window.location": "__pvLoc", "window.history": "__pvHist", sessionStorage: "__pvSession", localStorage: "__pvLocal" } });
const file = (ext) => app.outputFiles.find((f) => f.path.endsWith(ext)).text;
const inlineJs = (s) => s.replace(/<\/script/gi, "<\\/script");
const favicon = "data:image/png;base64," + fs.readFileSync(path.join(web, "public", "favicon.png")).toString("base64");
const built = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#021B1A" />
<meta name="robots" content="noindex" />
<link rel="icon" type="image/png" href="${favicon}" />
<title>Preview · DRMC IT Club</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Orbitron:wght@600;800;900&display=swap" />
<style>${file(".css")}
.pv-bar{display:flex;flex-wrap:wrap;gap:.3rem 1rem;align-items:center;justify-content:center;padding:.4rem .9rem;background:#c6f432;color:#012a25;font:600 .78rem/1.35 Inter,system-ui,sans-serif;text-align:center}
.pv-bar code{padding:.05rem .4rem;border-radius:6px;background:rgba(1,42,37,.14);font:600 .76rem ui-monospace,Menlo,monospace}
.pv-bar button{border:1px solid rgba(1,42,37,.5);border-radius:99px;background:none;color:inherit;font:inherit;padding:.05rem .6rem;cursor:pointer}
</style>
</head>
<body>
<div class="pv-bar" id="pv-bar" role="note"><span>PREVIEW with sample data. Nothing is saved; reloading starts over.</span><span>Organizer key: <code>demo-organizer-key</code></span><span>Built ${built}</span><button type="button" id="pv-hide">Hide</button></div>
<div id="root"></div>
<script>${inlineJs(backend.outputFiles[0].text)}</script>
<script>document.getElementById("pv-hide").onclick=function(){document.getElementById("pv-bar").remove()};</script>
<script>${inlineJs(file(".js"))}</script>
</body>
</html>
`;
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)}  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
