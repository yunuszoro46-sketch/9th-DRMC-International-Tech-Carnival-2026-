// Test-only dataset (the original demo data, dated relative to `now` so tests never expire). Keeps the integration tests independent of the demo catalogue in seed-data.js.
const { open } = require('./db');
const { loadConfig } = require('./config');
const { rand, signPass } = require('./domain/pass');
const { toIso } = require('./domain/registration');
const { makeDates } = require('./dates');

function seedFixtures(db = open(), now = new Date()) {
  const { at, day } = makeDates(now), secret = loadConfig().passSecret, T = (l) => toIso(l);
  const club = Number(db.prepare("INSERT INTO clubs(name,slug,description,emoji) VALUES ('DRMC IT Club','it-club','Fixture club','💻')").run().lastInsertRowid);
  const fest = db.prepare('INSERT INTO fests(club_id,name,description,starts_on,ends_on,venue) VALUES (?,?,?,?,?,?)');
  const ev = db.prepare('INSERT INTO events(fest_id,title,category,description,venue,starts_at,deadline,capacity,auto_confirm,form_schema) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const reg = db.prepare('INSERT INTO registrations(event_id,name,email,answers,status,manage_token) VALUES (?,?,?,?,?,?)'), pass = db.prepare('INSERT INTO passes(registration_id,token) VALUES (?,?)');
  const f = (n, d, s, e, v) => Number(fest.run(club, n, d, s, e, v).lastInsertRowid);
  const team = [{ key: 'team', label: 'Team name', type: 'text', required: true }, { key: 'size', label: 'Team size', type: 'select', required: true, options: ['1', '2', '3'] }];
  const solo = [{ key: 'year', label: 'Year of study', type: 'select', required: true, options: ['1st', '2nd', '3rd', '4th', '5th'] }];
  const e = (fid, title, cat, desc, venue, st, dl, cap, auto, sc) => Number(ev.run(fid, title, cat, desc, venue, T(st), T(dl), cap, auto, JSON.stringify(sc)).lastInsertRowid);
  const tc = f('Tech Carnival 2026', 'Flagship fest.', day(20), day(22), 'DRMC Auditorium'), wt = f('Winter Tech Fest 2026', 'Winter fest.', day(70), day(71), 'DRMC Seminar Hall'), ft = f('Freshers Tech Fest 2027', 'Freshers fest.', day(120), day(121), 'DRMC Lab Block');
  const ids = [
    e(tc, 'Code Rush', 'Coding', 'Timed contest.', 'Computer Lab 1', at(20, '10:00'), at(15, '23:59'), 40, 0, team), e(tc, 'AI Prompt Battle', 'AI', 'Prompt contest.', 'Seminar Hall', at(20, '14:00'), at(16, '23:59'), 30, 1, solo),
    e(tc, 'Line Follower Robotics', 'Robotics', 'Race a bot.', 'Workshop Bay', at(21, '10:00'), at(10, '23:59'), 12, 0, team), e(tc, 'Valorant Showdown', 'Gaming', '5v5.', 'Gaming Arena', at(21, '15:00'), at(18, '23:59'), 5, 0, team),
    e(tc, 'Tech Quiz Night', 'Quiz', 'Trivia.', 'Auditorium', at(22, '17:00'), at(20, '12:00'), 60, 1, team), e(wt, 'Web in a Day', 'Coding', 'Workshop.', 'Computer Lab 2', at(70, '10:00'), at(66, '23:59'), 35, 1, solo),
    e(wt, 'Neural Nets 101', 'AI', 'Intro to ML.', 'Seminar Hall', at(70, '14:00'), at(67, '23:59'), 50, 1, solo), e(wt, 'Hack the Winter (closed)', 'Coding', 'Past deadline.', 'Computer Lab 1', at(71, '10:00'), at(-30, '23:59'), 20, 0, team),
    e(ft, 'Freshers Quiz', 'Quiz', 'Icebreaker.', 'Auditorium', at(120, '11:00'), at(115, '23:59'), 80, 1, solo), e(ft, 'Intro to Robotics', 'Robotics', 'Meet the team.', 'Workshop Bay', at(121, '11:00'), at(117, '23:59'), 25, 1, solo)];
  const mk = (eid, name, email, ans, status) => { const id = Number(reg.run(eid, name, email, JSON.stringify(ans), status, rand()).lastInsertRowid); if (status === 'CONFIRMED') pass.run(id, signPass(id, secret)); };
  const names = ['Ayesha Rahman', 'Tanvir Hasan', 'Nusrat Jahan', 'Rafi Ahmed', 'Mehnaz Akter', 'Sabbir Hossain', 'Farhana Islam', 'Imran Khan'], em = (n) => `${n.split(' ')[0].toLowerCase()}@example.com`;
  names.slice(0, 6).forEach((n, i) => mk(ids[0], n, em(n), { team: `Team ${i + 1}`, size: '2' }, i % 3 === 0 ? 'PENDING' : 'CONFIRMED'));
  names.slice(0, 4).forEach((n) => mk(ids[1], n, em(n), { year: '2nd' }, 'CONFIRMED'));
  names.slice(0, 5).forEach((n, i) => mk(ids[3], n, em(n), { team: `Squad ${i}`, size: '1' }, 'PENDING'));
  names.slice(2, 8).forEach((n, i) => mk(ids[5], n, em(n), { year: '3rd' }, i % 2 ? 'PENDING' : 'CONFIRMED'));
  return db;
}
module.exports = { seedFixtures };
