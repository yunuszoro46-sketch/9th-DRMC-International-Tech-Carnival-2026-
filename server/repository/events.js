// Event + fest SQL. Returns raw rows; the domain shapes them.
// seats taken = PENDING + CONFIRMED + CHECKED_IN. Archived events/fests are hidden unless `includeArchived`.
const SEATS = "('PENDING','CONFIRMED','CHECKED_IN')";
const SELECT = `SELECT e.*, f.name AS fest_name, f.archived_at AS fest_archived_at, f.club_id, c.name AS club_name,
  (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status IN ${SEATS}) AS taken
  FROM events e JOIN fests f ON f.id = e.fest_id LEFT JOIN clubs c ON c.id = f.club_id`;
// fest card = fest + its club + totals over its (non-archived) events
const FEST = `SELECT f.*, c.name AS club_name, c.slug AS club_slug, c.emoji AS club_emoji,
  (SELECT COUNT(*) FROM events e WHERE e.fest_id = f.id AND e.archived_at IS NULL) AS event_count,
  (SELECT COALESCE(SUM(e.capacity), 0) FROM events e WHERE e.fest_id = f.id AND e.archived_at IS NULL) AS capacity,
  (SELECT COUNT(*) FROM registrations r JOIN events e ON e.id = r.event_id WHERE e.fest_id = f.id AND e.archived_at IS NULL AND r.status IN ${SEATS}) AS taken
  FROM fests f LEFT JOIN clubs c ON c.id = f.club_id`;
const like = (s) => '%' + String(s).replace(/[\\%_]/g, '\\$&') + '%';

function createEventsRepo(db) {
  const all = (sql, ...p) => db.prepare(sql).all(...p), get = (sql, ...p) => db.prepare(sql).get(...p), run = (sql, ...p) => db.prepare(sql).run(...p);
  const eventValues = (e) => [e.fest_id, e.title, e.category, e.description, e.rules, e.venue, e.starts_at, e.deadline, e.capacity, e.auto_confirm ? 1 : 0, JSON.stringify(e.form_schema)];
  return {
    count: () => get('SELECT COUNT(*) n FROM events').n,
    counts: () => ({ fests: get('SELECT COUNT(*) n FROM fests WHERE archived_at IS NULL').n,
      events: get('SELECT COUNT(*) n FROM events e JOIN fests f ON f.id = e.fest_id WHERE e.archived_at IS NULL AND f.archived_at IS NULL').n }),
    archivedCounts: () => ({ fests: get('SELECT COUNT(*) n FROM fests WHERE archived_at IS NOT NULL').n, events: get('SELECT COUNT(*) n FROM events WHERE archived_at IS NOT NULL').n }),
    listClubs: () => all(`SELECT c.*, (SELECT COUNT(*) FROM fests f WHERE f.club_id = c.id AND f.archived_at IS NULL) AS fest_count,
      (SELECT COUNT(*) FROM events e JOIN fests f ON f.id = e.fest_id WHERE f.club_id = c.id AND f.archived_at IS NULL AND e.archived_at IS NULL) AS event_count FROM clubs c ORDER BY c.id`),
    findClub: (id) => get('SELECT * FROM clubs WHERE id = ?', id),
    listFests({ club = null, includeArchived = false } = {}) {
      const where = [], p = [];
      if (Number.isInteger(club)) { where.push('f.club_id = ?'); p.push(club); }
      if (!includeArchived) where.push('f.archived_at IS NULL');
      return all(`${FEST} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${Number.isInteger(club) ? '' : 'f.club_id, '}f.starts_on`, ...p);
    },
    findFest: (id) => get(`${FEST} WHERE f.id = ?`, id),
    findById: (id) => get(`${SELECT} WHERE e.id = ?`, id),
    insertFest: (f) => Number(run('INSERT INTO fests(club_id,name,description,starts_on,ends_on,venue) VALUES (?,?,?,?,?,?)', f.club_id, f.name, f.description, f.starts_on, f.ends_on, f.venue).lastInsertRowid),
    updateFest: (id, f) => run('UPDATE fests SET club_id=?, name=?, description=?, starts_on=?, ends_on=?, venue=? WHERE id=?', f.club_id, f.name, f.description, f.starts_on, f.ends_on, f.venue, id),
    setFestArchived: (id, at) => run('UPDATE fests SET archived_at = ? WHERE id = ?', at, id),
    deleteFest: (id) => run('DELETE FROM fests WHERE id = ?', id),
    countEventsInFest: (id) => get('SELECT COUNT(*) n FROM events WHERE fest_id = ?', id).n,
    insertEvent: (e) => Number(run('INSERT INTO events(fest_id,title,category,description,rules,venue,starts_at,deadline,capacity,auto_confirm,form_schema) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...eventValues(e)).lastInsertRowid),
    updateEvent: (id, e) => run('UPDATE events SET fest_id=?, title=?, category=?, description=?, rules=?, venue=?, starts_at=?, deadline=?, capacity=?, auto_confirm=?, form_schema=? WHERE id=?', ...eventValues(e), id),
    setEventArchived: (id, at) => run('UPDATE events SET archived_at = ? WHERE id = ?', at, id),
    deleteEvent: (id) => run('DELETE FROM events WHERE id = ?', id),
    list({ q, category, fest, club, limit, offset, includeArchived = false }) {
      const where = [], p = [];
      if (q) { where.push("(e.title LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\')"); p.push(like(q), like(q)); }
      if (category) { where.push('e.category = ?'); p.push(category); }
      if (Number.isInteger(fest)) { where.push('e.fest_id = ?'); p.push(fest); }
      if (Number.isInteger(club)) { where.push('f.club_id = ?'); p.push(club); }
      if (!includeArchived) where.push('e.archived_at IS NULL AND f.archived_at IS NULL');
      return all(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.starts_at, e.id LIMIT ? OFFSET ?`, ...p, limit, offset);
    },
  };
}
module.exports = { createEventsRepo };
