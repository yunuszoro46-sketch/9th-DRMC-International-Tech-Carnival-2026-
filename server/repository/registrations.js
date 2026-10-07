// Registration SQL + aggregate stats. seats taken = PENDING + CONFIRMED + CHECKED_IN.
const SEATS = "('PENDING','CONFIRMED','CHECKED_IN')";
const like = (s) => '%' + String(s).replace(/[\\%_]/g, '\\$&') + '%';

function createRegistrationsRepo(db) {
  const all = (sql, ...p) => db.prepare(sql).all(...p), get = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  return {
    findLive: (eventId, email) => get("SELECT 1 AS x FROM registrations WHERE event_id = ? AND email = ? AND status != 'CANCELLED'", eventId, email),
    insert({ eventId, name, email, answers, status, manageToken }) {
      const r = run('INSERT INTO registrations(event_id,name,email,answers,status,manage_token) VALUES (?,?,?,?,?,?)',
        eventId, name, email, JSON.stringify(answers), status, manageToken);
      return get('SELECT id, status, manage_token FROM registrations WHERE id = ?', r.lastInsertRowid);
    },
    findById: (id) => get('SELECT id, event_id, status FROM registrations WHERE id = ?', id),
    findByToken: (token) => get('SELECT r.id, r.status, e.starts_at FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.manage_token = ?', token),
    findViewByToken: (token) => get(`SELECT r.id, r.name, r.email, r.status, r.answers, r.created_at, e.id AS event_id, e.fest_id, e.title, e.venue, e.starts_at,
        f.name AS fest_name, c.name AS club_name, p.token AS pass_token, p.status AS pass_status, p.checked_in_at
        FROM registrations r JOIN events e ON e.id = r.event_id JOIN fests f ON f.id = e.fest_id LEFT JOIN clubs c ON c.id = f.club_id
        LEFT JOIN passes p ON p.registration_id = r.id WHERE r.manage_token = ?`, token),
    setStatus: (id, status, at = null) => run('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?', status, at, id),
    countForEvent: (eventId) => get('SELECT COUNT(*) n FROM registrations WHERE event_id = ?', eventId).n,
    // organizer table: one query for any combination of event / fest / status / search, with the total for paging
    listAdmin({ eventId, festId, status, q, limit, offset }) {
      const w = [], p = [];
      if (eventId) { w.push('r.event_id = ?'); p.push(eventId); }
      if (festId) { w.push('e.fest_id = ?'); p.push(festId); }
      if (status) { w.push('r.status = ?'); p.push(status); }
      if (q) { w.push("(r.name LIKE ? ESCAPE '\\' OR r.email LIKE ? ESCAPE '\\')"); p.push(like(q), like(q)); }
      const from = `FROM registrations r JOIN events e ON e.id = r.event_id JOIN fests f ON f.id = e.fest_id
        LEFT JOIN passes p ON p.registration_id = r.id ${w.length ? 'WHERE ' + w.join(' AND ') : ''}`;
      return { total: get(`SELECT COUNT(*) n ${from}`, ...p).n,
        rows: all(`SELECT r.id, r.event_id, r.name, r.email, r.status, r.answers, r.created_at, p.status AS pass_status, p.checked_in_at,
          e.title AS event_title, f.id AS fest_id, f.name AS fest_name ${from} ORDER BY r.id DESC LIMIT ? OFFSET ?`, ...p, limit, offset) };
    },
    allForEvent: (eventId) => all(`SELECT r.*, p.status AS pass_status, p.checked_in_at FROM registrations r LEFT JOIN passes p ON p.registration_id = r.id
        WHERE r.event_id = ? ORDER BY r.id`, eventId),
    statusCounts: () => all('SELECT status, COUNT(*) n FROM registrations GROUP BY status'),
    seatsByEvent: () => all(`SELECT e.id, e.title, e.category, e.capacity, f.id AS fest_id, f.name AS fest_name, COALESCE(c.name, 'Other') AS club_name,
        (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ${SEATS}) AS taken
        FROM events e JOIN fests f ON f.id = e.fest_id LEFT JOIN clubs c ON c.id = f.club_id
        WHERE e.archived_at IS NULL AND f.archived_at IS NULL ORDER BY e.id`),
  };
}
module.exports = { createRegistrationsRepo };
