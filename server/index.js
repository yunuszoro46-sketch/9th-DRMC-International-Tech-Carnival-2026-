process.env.TZ = 'UTC'; // belt and braces: instants are also parsed with explicit offsets (see domain/registration.js)
const path = require('path');
const { loadConfig } = require('./config');
const { open } = require('./db');
const { createApp } = require('./app');

let config;
try { config = loadConfig(); } catch (e) { console.error(e.message); process.exit(1); }
const { server, db, ai } = createApp(open(config.dbFile), config);
// Say which database file is in use and whether it holds anything, so "where did my data go?" has a one-line answer.
const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, dbPath = path.resolve(config.dbFile || path.join(__dirname, '..', 'club.db'));
server.listen(config.port, () => {
  console.log(`Smart Club Ops listening on http://localhost:${config.port}${config.production ? ' (production)' : ''}`);
  console.log(count('events') ? `Database: ${dbPath} (${count('events')} events, ${count('registrations')} registrations, ${count('volunteers')} volunteer applications)`
    : `Database: ${dbPath} is empty. Run "npm run seed" once for the demo catalogue, or create fests and events in the organizer area.`);
  console.log(ai ? `Assistant: answers from the event data, with the AI helper on (model ${config.ai.model}).` : 'Assistant: answers from the event data. AI helper off (set AI_API_KEY and AI_MODEL to turn it on).');
});

const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', stop); process.on('SIGINT', stop);
