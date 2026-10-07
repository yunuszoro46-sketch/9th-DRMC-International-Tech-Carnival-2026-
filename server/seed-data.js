// DRMC club catalogue: Club > Fest > Event. Sample content for demos: edit/replace with real fests and events.
// Everything is dated relative to the moment of seeding (club-local Dhaka time, stored as UTC ISO 8601), so the demo
// always shows a live fest, upcoming fests, a past fest, and events that are open, full, closed and ended.
// `form`: team | solo | cls | contest.
const { makeDates } = require('./dates');

const FORMS = {
  team: [{ key: 'team', label: 'Team name', type: 'text', required: true }, { key: 'size', label: 'Team size', type: 'select', required: true, options: ['1', '2', '3'] }],
  solo: [{ key: 'year', label: 'Year of study', type: 'select', required: true, options: ['1st', '2nd', '3rd', '4th', '5th'] }],
  cls: [{ key: 'class', label: 'Class', type: 'select', required: true, options: ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'] }, { key: 'roll', label: 'Roll number', type: 'text', required: false }],
  contest: [{ key: 'team', label: 'Team name', type: 'text', required: true }, { key: 'size', label: 'Team size', type: 'select', required: true, options: ['1', '2', '3'] },
    { key: 'phone', label: 'Contact number', type: 'tel', required: true }, { key: 'notes', label: 'Anything we should know?', type: 'textarea', required: false }],
};

function buildCatalog(now = new Date()) {
  const { day, at } = makeDates(now);
  const ev = (title, category, description, venue, start, deadline, capacity, auto, form, rules = '') => ({ title, category, description, venue, start, deadline, capacity, auto, form, rules });
  // one compact sample fest per non-IT club; `off` = days from today
  const mini = (club, emoji, description, fest, fdesc, venue, off, e1, c1, e2, c2) => ({ name: club, emoji, description, fests: [{ name: fest, description: fdesc, starts_on: day(off), ends_on: day(off), venue,
    events: [ev(e1[0], e1[1], e1[2], venue, at(off, '10:00'), at(off - 2, '23:59'), c1, 1, 'cls'), ev(e2[0], e2[1], e2[2], venue, at(off, '14:00'), at(off - 2, '23:59'), c2, 0, 'cls')] }] });

  return [
    { name: 'DRMC IT Club', emoji: '💻', description: 'Coding, AI, robotics and gaming for the whole college.', fests: [
      { name: 'Open Source Week 2026', description: 'Past fest: hands-on workshops and a capture-the-flag warm-up.', starts_on: day(-61), ends_on: day(-60), venue: 'DRMC Seminar Hall', events: [
        ev('Intro to Git & GitHub', 'Workshop', 'Version control from zero: commits, branches and your first pull request.', 'Computer Lab 2', at(-61, '10:00'), at(-63, '23:59'), 40, 1, 'solo'),
        ev('Capture the Flag Warm-up', 'Coding', 'Beginner-friendly security puzzles in teams.', 'Computer Lab 1', at(-60, '14:00'), at(-62, '23:59'), 30, 1, 'team')] },
      { name: 'Tech Carnival 2026', description: 'Flagship annual fest of the DRMC IT Club. Live now.', starts_on: day(-1), ends_on: day(2), venue: 'DRMC Auditorium', events: [
        ev('Opening Keynote', 'Talk', 'Kick-off talk on what students can build this year.', 'DRMC Auditorium', at(-1, '10:00'), at(-3, '23:59'), 100, 1, 'solo'),
        ev('AI Web Development Contest', 'AI', 'Build a working website with the help of AI tools in three hours.', 'Computer Lab 1', at(1, '10:00'), at(1, '08:00'), 30, 1, 'solo',
          'Bring your own laptop. Any AI tool is allowed; copying another team\'s site is not.'),
        ev('Programming Contest', 'Coding', 'Timed competitive programming contest, 5 problems, 3 hours.', 'Computer Lab 2', at(2, '14:00'), at(1, '23:59'), 40, 0, 'contest',
          'Teams of up to 3. One submission account per team. Organizers confirm every team before the contest.'),
        ev('Robotics Challenge', 'Robotics', 'Build and race an autonomous line-following bot. Registration closed early to confirm teams.', 'Workshop Bay', at(2, '10:00'), at(-1, '23:59'), 12, 0, 'team'),
        ev('Gaming Tournament', 'Gaming', '5v5 Valorant tournament, double elimination. All seats are taken.', 'Gaming Arena', at(2, '15:00'), at(1, '23:59'), 5, 0, 'team')] },
      { name: 'Winter Tech Fest 2026', description: 'Cozy winter-break workshops and contests.', starts_on: day(30), ends_on: day(31), venue: 'DRMC Seminar Hall', events: [
        ev('Hackathon', 'Hackathon', '24-hour build sprint. Registration closed early to confirm teams.', 'Computer Lab 1', at(31, '10:00'), at(-2, '23:59'), 20, 0, 'contest'),
        ev('Workshop: Web in a Day', 'Workshop', 'Hands-on workshop: ship a site in one day.', 'Computer Lab 2', at(30, '10:00'), at(28, '23:59'), 35, 1, 'solo'),
        ev('Tech Quiz', 'Quiz', 'Teams of up to 3 battle across tech trivia.', 'Auditorium', at(30, '16:00'), at(29, '23:59'), 60, 1, 'team')] },
      { name: 'Freshers Tech Fest 2027', description: 'Welcome event for the new batch.', starts_on: day(90), ends_on: day(91), venue: 'DRMC Lab Block', events: [
        ev('Coding Challenge', 'Coding', 'Beginner-friendly puzzles to break the ice.', 'Computer Lab 1', at(90, '11:00'), at(85, '23:59'), 50, 1, 'solo'),
        ev('AI Workshop', 'Workshop', 'Meet the AI team and train your first model.', 'Seminar Hall', at(91, '11:00'), at(87, '23:59'), 40, 1, 'solo')] }] },
  mini('Science Club', '🔬', 'Experiments, olympiads and the National Science Carnival.', 'DRMC Science Carnival 2026', 'Annual showcase of student science projects.', 'Science Block', 14,
    ['Science Olympiad', 'Science', 'Written and practical rounds across physics, chemistry and biology.'], 60, ['Project Showcase', 'Science', 'Present a working model or experiment.'], 40),
  mini('Photography Club', '📷', 'Photo walks, exhibitions and workshops.', 'Frames of DRMC 2026', 'Photo exhibition and contest.', 'Art Gallery Hall', 17,
    ['Photo Walk', 'Photography', 'Guided campus photo walk with mentors.'], 30, ['Photo Exhibition Entry', 'Photography', 'Submit three frames for the exhibition.'], 50),
  mini('Remians Youth Red Crescent', '➕', 'First aid, blood donation and humanitarian service.', 'RYRC First Aid Week 2026', 'Training and awareness week.', 'Medical Center', 20,
    ['First Aid Basics', 'Service', 'Hands-on first aid and CPR training.'], 40, ['Blood Donation Drive', 'Service', 'Volunteer registration for the donation drive.'], 80),
  mini('Games & Sports Club', '⚽', 'Inter-house tournaments and athletics.', 'Inter-House Sports Week 2026', 'Football, cricket and athletics.', 'DRMC Playground', 23,
    ['Inter-House Football', 'Sports', 'Knockout football tournament between houses.'], 66, ['Athletics Meet', 'Sports', 'Track and field events.'], 120),
  mini('BNCC', '🎖️', 'Bangladesh National Cadet Corps unit.', 'BNCC Annual Camp 2026', 'Drill, discipline and leadership.', 'Parade Ground', 26,
    ['Parade Drill Camp', 'Training', 'Three-day drill and leadership camp.'], 60, ['Leadership Seminar', 'Training', 'Seminar with senior cadets.'], 80),
  mini('DRMC Math Club', '➗', 'Olympiads, puzzles and problem solving.', 'Math Festival 2026', 'Olympiad and puzzle day.', 'Seminar Hall', 29,
    ['Math Olympiad', 'Math', 'Individual olympiad with four rounds.'], 80, ['Puzzle Hunt', 'Math', 'Team puzzle hunt across the campus.'], 45),
  mini('Remians Art Club', '🎨', 'Painting, sketching and exhibitions.', 'Art Fest 2026', 'Live painting and exhibition.', 'Art Gallery Hall', 32,
    ['Live Painting', 'Art', 'Paint on the spot with a surprise theme.'], 50, ['Sketching Workshop', 'Art', 'Learn portrait sketching basics.'], 30),
  mini('Music & Cultural Club', '🎵', 'Concerts, drama and cultural nights.', 'Cultural Night 2026', 'Music, dance and drama evening.', 'Modern Auditorium', 35,
    ['Singing Contest', 'Music', 'Solo and duet singing rounds.'], 40, ['Drama Night', 'Music', 'Stage plays by house teams.'], 150),
  mini('Social Service Club', '🤝', 'Community drives and volunteering.', 'Service Week 2026', 'Winter clothes and tree plantation drives.', 'College Gate', 38,
    ['Winter Clothes Drive', 'Service', 'Collect and distribute winter clothes.'], 70, ['Tree Plantation', 'Service', 'Plant saplings around the campus.'], 100),
  mini('DRMCMUNA', '🌐', 'Model United Nations of DRMC.', 'DRMC MUN 2026', 'Three-day MUN conference.', 'Modern Auditorium', 41,
    ['MUN Delegate Registration', 'Debate', 'Register as a delegate for a committee.'], 90, ['MUN Crash Course', 'Debate', 'Learn rules of procedure and position papers.'], 60),
  mini('DRMC Scout Unit', '🏕️', 'Scouting, camping and service.', 'Scout Jamboree 2026', 'Camp and skills competition.', 'Playground', 44,
    ['Camping Skills Contest', 'Training', 'Tent pitching, knots and navigation.'], 60, ['Scout Rally', 'Training', 'Uniform rally and flag ceremony.'], 100),
  mini('Language Club', '📚', 'Bangla and English literature, spelling and speaking.', 'Language Festival 2026', 'Spelling bee, recitation and storytelling.', 'Library Hall', 47,
    ['Spelling Bee', 'Language', 'English and Bangla spelling rounds.'], 60, ['Recitation Contest', 'Language', 'Poetry recitation in Bangla and English.'], 50),
  mini('DRMC Islamic Cultural Club', '🕌', 'Quran recitation, seminars and the Islamic Cultural Festival.', 'Islamic Cultural Festival 2026', 'Recitation, quiz and book fair.', 'Central Mosque Hall', 50,
    ['Quran Recitation', 'Culture', 'Tilawat competition by class group.'], 60, ['Islamic Quiz', 'Quiz', 'General knowledge quiz on Islamic history.'], 70),
  mini('DRMC Business and Career Club', '📈', 'Entrepreneurship, careers and guidance.', 'Career Expo 2026', 'Talks and a business plan contest.', 'Seminar Hall', 53,
    ['Business Plan Contest', 'Business', 'Pitch a business idea to judges.'], 40, ['Career Guidance Talk', 'Business', 'Alumni talk on careers after HSC.'], 150),
  mini('Debating Club', '🎤', 'Parliamentary and public debate.', 'Inter-House Debate 2026', 'Knockout debate tournament.', 'Auditorium', 56,
    ['Parliamentary Debate', 'Debate', 'Three-person team debate, knockout format.'], 48, ['Extempore Speaking', 'Debate', 'Speak for two minutes on a surprise topic.'], 40),
  ];
}
module.exports = { buildCatalog, FORMS };
