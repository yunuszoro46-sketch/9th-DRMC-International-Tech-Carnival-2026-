// Volunteer applications (the "Call for Volunteers" portal). Raw SQL only.
function createVolunteersRepo(db) {
  return {
    findByEmail: (email) => db.prepare('SELECT id FROM volunteers WHERE email = ?').get(email),
    insert: (v) => Number(db.prepare('INSERT INTO volunteers(name,cls,roll,phone,email,domain,why) VALUES (?,?,?,?,?,?,?)').run(v.name, v.cls, v.roll, v.phone, v.email, v.domain, v.why).lastInsertRowid),
    list: () => db.prepare('SELECT * FROM volunteers ORDER BY id DESC LIMIT 500').all(),
  };
}
module.exports = { createVolunteersRepo };
