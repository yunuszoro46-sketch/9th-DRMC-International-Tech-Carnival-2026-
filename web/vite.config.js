import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` proxies /api to the Node server (npm start in the repo root). `npm run build` writes web/dist,
// which the server serves automatically (see staticDir() in server/app.js).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000" } },
  // assetsInlineLimit 0: small fonts/SVGs are emitted as files instead of data: URIs. The server's CSP has no font-src, so
  // fonts fall under default-src 'self' and an inlined (data:) font subset would be blocked.
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0 },
});
