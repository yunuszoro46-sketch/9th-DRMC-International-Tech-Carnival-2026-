// Composition root: wires repositories -> service -> routes -> http server.
const http = require('http');
const path = require('path');
const fs = require('fs');
const { open, transaction } = require('./db');
const { loadConfig } = require('./config');
const { createEventsRepo } = require('./repository/events');
const { createRegistrationsRepo } = require('./repository/registrations');
const { createPassesRepo } = require('./repository/passes');
const { createVolunteersRepo } = require('./repository/volunteers');
const { createClubService } = require('./services/club');
const { createAuthService } = require('./services/auth');
const { createRouter } = require('./http/router');
const { createStaticHandler } = require('./http/static');
const { createIntentClient } = require('./ai/intent-client');

// Serves the React build (web/dist) when it exists, otherwise the zero-build classic UI in public/. UI=classic forces the classic UI.
function staticDir() {
  const root = path.join(__dirname, '..'), dist = path.join(root, 'web', 'dist');
  return process.env.UI !== 'classic' && fs.existsSync(path.join(dist, 'index.html')) ? dist : path.join(root, 'public');
}

function createApp(db = open(), config = loadConfig()) {
  // The AI helper is optional. A failure is logged here (never the key, never the question) and the assistant carries on without it.
  const client = createIntentClient(config.ai || {});
  const interpreter = client && ((...args) => client(...args).catch((e) => { console.warn(`[assistant] AI helper unavailable: ${e.name === 'TimeoutError' ? 'timed out' : e.message}`); throw e; }));
  const service = createClubService({ interpreter,
    events: createEventsRepo(db), registrations: createRegistrationsRepo(db), passes: createPassesRepo(db), volunteers: createVolunteersRepo(db),
    tx: (fn) => transaction(db, fn), secret: () => config.passSecret });
  const auth = createAuthService(config);
  const routes = [...require('./http/routes/public')(service), ...require('./http/routes/admin')(service, auth)];
  const handle = createRouter({ routes, config, auth, serveStatic: createStaticHandler(staticDir()) });
  return { server: http.createServer(handle), db, config, ai: !!client };
}
module.exports = { createApp };
