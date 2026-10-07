const fs = require('fs/promises');
const path = require('path');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

// Serves files strictly inside `root`; extensionless misses fall back to index.html (SPA), asset misses are 404.
function createStaticHandler(root) {
  const base = path.resolve(root);
  const page = async () => ({ status: 200, type: MIME['.html'], body: await fs.readFile(path.join(base, 'index.html')), headers: { 'cache-control': 'no-cache' } });
  return async function serve(pathname) {
    let rel; try { rel = decodeURIComponent(pathname); } catch { rel = '/'; }
    const file = path.resolve(base, '.' + path.posix.normalize('/' + rel));
    if (file.startsWith(base + path.sep)) {
      try {
        if ((await fs.stat(file)).isFile()) return { status: 200, type: MIME[path.extname(file)] || 'application/octet-stream', body: await fs.readFile(file), headers: { 'cache-control': 'no-cache' } };
      } catch { /* fall through */ }
    }
    return path.extname(rel) ? { status: 404, type: MIME['.txt'], body: 'Not found' } : page();
  };
}
module.exports = { createStaticHandler };
