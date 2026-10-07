// Pass SQL.
function createPassesRepo(db) {
  const get = (sql, ...p) => db.prepare(sql).get(...p), run = (sql, ...p) => db.prepare(sql).run(...p);
  return {
    findByRegistration: (regId) => get('SELECT * FROM passes WHERE registration_id = ?', regId),
    insert: (regId, token) => run('INSERT INTO passes(registration_id, token) VALUES (?, ?)', regId, token),
    reinstate: (id) => run("UPDATE passes SET status='ISSUED' WHERE id = ?", id),
    revoke: (id) => run("UPDATE passes SET status='REVOKED' WHERE id = ?", id),
    // atomic: only one caller can flip ISSUED -> CHECKED_IN, and only while the registration is still CONFIRMED; true if this call won
    checkIn: (token, at) => run(`UPDATE passes SET status='CHECKED_IN', checked_in_at=? WHERE token = ? AND status='ISSUED'
        AND registration_id IN (SELECT id FROM registrations WHERE status = 'CONFIRMED')`, at, token).changes === 1,
    findInfoByToken: (token) => get(`SELECT p.registration_id, r.name, r.email, r.status AS registration_status, e.id AS event_id, e.title, p.status, p.checked_in_at
        FROM passes p JOIN registrations r ON r.id = p.registration_id JOIN events e ON e.id = r.event_id WHERE p.token = ?`, token),
  };
}
module.exports = { createPassesRepo };
