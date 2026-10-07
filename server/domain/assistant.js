// Public event-discovery assistant: question -> query -> grounded reply.
// Pure: no HTTP, no SQL, no clock, no network. `data` is the PUBLIC catalogue the service hands in
// ({ events(), fests(), clubs() }, archived records already removed). Every name, date, venue and number in a
// reply is copied from those records; nothing here can state a fact that is not in them. Registrations,
// volunteers and passes are never passed in, so there is no private record this module could reveal.
//
// Working rule for everything below: when a question is not understood, say so. A name has to be the published
// name (word for word, in order) to be answered as that record; a near miss is offered as "the closest name", a
// word that matches nothing is reported as left out, and a date phrase that cannot be read is never ignored silently.
const { invalid } = require('./errors');
const { DOMAINS } = require('./intake');

const MAX_MESSAGE = 300, LIST_CAP = 6, FEST_CAP = 12;
const OFFSET_MS = 6 * 36e5, DAY_MS = 864e5;   // club-local time: Dhaka, UTC+6, no daylight saving (same rule as festStatus)
const FAR = '9999-12-31';

// ---- request --------------------------------------------------------------------------------
function parseRequest(body) {
  const raw = body && body.message;
  if (typeof raw !== 'string') throw invalid('Type a question first.', 'message');
  const message = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!message) throw invalid('Type a question first.', 'message');
  if (message.length > MAX_MESSAGE) throw invalid(`Please keep your question under ${MAX_MESSAGE} characters.`, 'message');
  const c = body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
  const id = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  return { message, context: { event: id(c.event), fest: id(c.fest) } };   // context = "the event/fest we were just talking about"
}

// ---- text -----------------------------------------------------------------------------------
// Common spellings folded into one form, so "what's on", "whats on" and "todays events" read the same.
const CANON = new Map(Object.entries({ whats: 'what', wheres: 'where', whens: 'when', hows: 'how', whos: 'who', todays: 'today', tonights: 'tonight', tomorrows: 'tomorrow',
  tomorow: 'tomorrow', tommorow: 'tomorrow', tommorrow: 'tomorrow', tomorro: 'tomorrow', tmrw: 'tomorrow', tmr: 'tomorrow', tmw: 'tomorrow', '2morrow': 'tomorrow', '2moro': 'tomorrow',
  '2day': 'today', tody: 'today', wknd: 'weekend', im: 'i', ive: 'i', isnt: 'is not', arent: 'are not', cant: 'can not', cannot: 'can not', dont: 'do not', doesnt: 'does not',
  wont: 'will not', didnt: 'did not', wasnt: 'was not', werent: 'were not', havent: 'have not', hasnt: 'has not' }));
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/(\p{L})['’`]s(?![\p{L}\p{N}])/gu, '$1').replace(/['’`]/g, '')
  .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim().split(' ').map((w) => CANON.get(w) || w).join(' ');
const stem = (t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
const words = (s) => { const n = norm(s); return n ? n.split(' ') : []; };
const stems = (s) => words(s).map(stem);
const isYear = (t) => /^(19|20)\d\d$/.test(t);
// One typo apart (words of 5+ letters only). Used ONLY to suggest "did you mean ...?", never to pick a record.
function near(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.min(la, lb) < 5 || Math.abs(la - lb) > 1 || a[0] !== b[0]) return false;
  let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
  let ja = la - 1, jb = lb - 1; while (ja >= i && jb >= i && a[ja] === b[jb]) { ja--; jb--; }
  const ra = ja - i + 1, rb = jb - i + 1;
  return (ra <= 1 && rb <= 1) || (ra === 2 && rb === 2 && a[i] === b[i + 1] && a[i + 1] === b[i]);
}
// SAME: different words for one thing. RELATED: only tried when the visitor's own word matches nothing, and then
// the answer says the results are related rather than exact.
const SAME = [['programming', 'coding', 'code', 'coder', 'programmer'], ['ai', 'ml', 'artificial', 'intelligence'], ['robotic', 'robot'], ['gaming', 'gamer', 'esport'],
  ['photo', 'photography', 'photograph'], ['math', 'mathematic'], ['debate', 'debating'], ['music', 'musical'], ['science', 'scientific'], ['web', 'website']];
const RELATED = [['contest', 'competition', 'challenge', 'tournament', 'olympiad', 'championship'], ['talk', 'seminar', 'keynote', 'lecture', 'speech'], ['music', 'singing', 'song', 'concert'],
  ['art', 'painting', 'drawing', 'sketching', 'sketch'], ['quiz', 'trivia'], ['sport', 'athletic', 'football'], ['photo', 'picture', 'camera'], ['workshop', 'training', 'tutorial']];
const group = (sets, t) => sets.find((g) => g.includes(t));

// ---- guards: refuse before any data is touched -----------------------------------------------
const INJECTION = /\b(ignore|disregard|forget|override|bypass|skip)\b.{0,25}\b(your|all|previous|prior|above|earlier|system|those|these|any|every)\b.{0,15}\b(instructions?|rules?|prompts?|guidelines?|restrictions?|polic(y|ies)|safety|filters?)\b|\b(ignore|disregard|forget|override|bypass) (the )?(instructions?|prompts?|guidelines?|restrictions?|safety|filters?)\b|\b(system|developer|hidden|initial|original) (prompt|message|instructions?)\b|\byou are now\b|\bpretend (you are|that you|to be (an? |the )?(admin\w*|organi[sz]er|developer|system|hacker|root|ai))\b|\bact as (if you|though you|an? (admin\w*|organi[sz]er|developer|hacker|system|different|unrestricted)|the (admin\w*|organi[sz]er|developer|system)|admin\w*|organi[sz]er|developer|root|dan)\b|\brole ?play (as|that)\b|\bjailbreak\b|\bdeveloper mode\b|\bno restrictions\b|\breveal your\b|\byour (system )?(prompt|instructions)\b/;
const SQLISH = /\bselect\b.{0,30}\bfrom\b|\bdrop table\b|\binsert into\b|\bunion select\b|\bdelete from\b|\bupdate \w+ set\b|\bor 1 1\b/;
// Never a topic: credentials and server internals.
const HARD_SECRETS = /\b(passwords?|passcodes?|credentials?|(organi[sz]er|admin|access|api|secret|private|auth|signing|pass) (keys?|secrets?)|apikeys?|env|environment variables?|source code|server (files?|logs?|paths?|config\w*)|config(uration)? files?|stack traces?|(admin|organi[sz]er) (panel|access|account|login|data|dashboard|password)|(private|internal|confidential|hidden|raw) (data|records?|info\w*|details))\b/;
// Could be a topic ("is there a database workshop?"): refused when it is the system's own that is asked for.
const SOFT_SECRETS = /\b(databases?|db|sql|sqlite|schema|tables|dump|backups?|tokens?|secrets?)\b/;
const SOFT_ACCESS = /\b(show|give|dump|print|reveal|export|access|read|open|display|send|leak|get|see|view|list|download|hack|drop|delete|your|the|this|our|its)\b.{0,20}\b(databases?|db|sql|sqlite|schema|tables|dump|backups?|tokens?|secrets?)\b|^(databases?|db|sql|sqlite|schema|tables|dump|backups?|tokens?|secrets?)\b/;
const TOPIC_NOUN = /\b(workshops?|events?|sessions?|class|classes|courses?|contests?|talks?|seminars?|training|clubs?|fests?|competitions?|hackathons?|lessons?|tutorials?)\b/;
const PEOPLE = '(participants?|registrants?|attendees?|applicants?|volunteers|students?|members?|people|everyone|everybody|anyone|someone|users?|others?|those|organi[sz]ers?|admins?)';
const COLLECTIVE = new RegExp(`\\b(${PEOPLE}|his|her|their|whoever)\\b`);
const FIRST_PERSON = /\b(my|mine|i|me|myself)\b/;
// Someone's contact details, names, answers or the list of who signed up: never held here, never discussed.
const CONTACT = /\b(emails?|e mails?|mail ids?|(phone|mobile|contact|whatsapp|roll|id) (numbers?|nos?|details|info)|whatsapp|home address)\b/;
const NAMES = new RegExp(`\\bnames? of (all |every |each )?(the )?${PEOPLE}\\b|\\b${PEOPLE} names?\\b|\\b(answers?|responses?|details|info\\w*|data|list|contacts?|address(es)?|phones?) (of|from|about|for) (all |every |each )?(the )?${PEOPLE}\\b|\\b(what|which) (did|do|have|has) ${PEOPLE} (answer|write|say|put|enter|submit|fill)\\w*\\b|\\b(personal|private) (data|details|info\\w*) (of|about|for|from)\\b`);
const WHO_LIST = /\bwho (all |else )?(has |have |is |are )?(registered|signed up|applied|coming|attending|joined|joining|participating|enrolled|volunteered|volunteering)\b|\b(list|show|give|export|download|see|view|get|send|print)\b.{0,30}\b(participants?|registrants?|attendees?|applicants?|registrations|sign ?ups|volunteers|volunteer (applicants?|applications?|list|names?))\b/;
function asksForPeople(raw, mine) {
  if (NAMES.test(raw)) return true;
  if (CONTACT.test(raw) && !mine && !/\b(required|needed|need|necessary|optional|have to|must)\b/.test(raw)) return true;
  return WHO_LIST.test(raw) && !mine && !/\bhow many\b/.test(raw);                      // "how many participants can join" is a capacity question
}
// "Will other people see my email?" is a question about privacy, not a request for someone's data.
const PRIVACY_Q = /\b(who|anyone|anybody|others?|people|public|everyone|everybody|they|organi[sz]ers?|strangers?)\b.{0,40}\b(see|view|access|read|know|get|have)\b.{0,30}\bmy (email|phone|number|data|details|info\w*|answers?|name|registration)\b|\b(is|are|will|would) my (email|phone|number|data|details|info\w*|answers?|name|registration)\b.{0,30}\b(public|visible|private|safe|secure|shared|seen|stored|kept|shown)\b|\b(share|shared|sharing|sell|sold|store|stored|keep|kept|publish\w*)\b.{0,20}\bmy (email|phone|number|data|details|info\w*|answers?|name)\b/;
const ACCOUNT_Q = /\b(do|should|must|will) i (need|have to|require)\b.{0,30}\b(accounts?|passwords?|log ?in|sign ?in)\b|\b(accounts?|passwords?|log ?in)\b.{0,20}\b(needed|required|necessary)\b/;
const VERB = '(delete|remove|erase|wipe|edit|modify|rename|create|publish|archive|unarchive|approve|reject|cancel|reschedule|change|update|add|close|reopen|move)';
const OBJ = '(events?|fests?|registrations?|clubs?|deadline|capacity|venue|seats?|volunteers?|participants?|pass|passes|date|time)';
// Only instructions count: "delete the event", "can you approve ...", "how do I edit an event". A question that merely contains "update" does not.
const WRITE = new RegExp(`^(please |pls |kindly |now |just |go |and )*${VERB}\\b.{0,40}\\b${OBJ}\\b|\\b(can|could|will|would) you (please |kindly |just )?${VERB}\\b|\\b(i want|i need|i would like|help me|let me|allow me|you (must|should|need to|have to)) (you )?(to )?${VERB}\\b.{0,40}\\b${OBJ}\\b|\\bhow (do|can|to) (i |we )?${VERB}\\b.{0,30}\\b${OBJ}\\b`);
const FOR_ME = /\b(register|enrol+|book|reserve)\b (me|us)\b|\bregister (for|on behalf of) me\b|\bsign (me|us) up\b|\b(book|reserve) (me )?(a |my )?(seat|spot|place)\b/;

// ---- vocabulary -----------------------------------------------------------------------------
const GREET = /^(hi|hii+|hello|helo|hey|heya|hola|yo|salam|assalamualaikum|assalamu alaikum|good (morning|afternoon|evening))\b/;
const THANKS = /^(thanks|thank you|thankyou|thx|ty|ok|okay|great|cool|nice|got it|perfect|awesome)\b/;
const HELP = /\b(what can you do|what do you do|who are you|what are you|how (do|can) (i|you) (use|help)|your name|what can i ask)\b|^help( me)?$/;
const MY_OWN = /\b(my|mine)\b.{0,30}\b(pass|passes|ticket|tickets|qr|registrations?|seat|spot|status)\b|\b(digital|qr|entry|event) (pass|passes|ticket)\b(?! (price|cost|fee))|\b(a|the) pass\b|\bqr( code)?\b|\b(get|find|see|show|download|lost|where)\b.{0,15}\b(pass|ticket)\b(?! (price|cost|fee))|\bcancel\b|\bdid i (register|get)\b|\bam i (registered|confirmed|in)\b|\bi (have )?(already )?registered\b/;
const HOWTO_REGISTER = /\bwhat happens (after|when|once) i (register|sign up|apply)\b|\bafter i (register|sign up)\b|\bhow (do|can|to|should|does|would) (i |we |you |one |a student )?(go about )?(register|registering|sign(ing)? ?up|join|joining|enrol\w*|participate|apply|get in|enter)\b|\bhow (does|do) (the )?registration\b|\bregistration (process|steps|works?)\b/;
const THIS_FEST = /\b(this|that|the|current) (fest|festival|carnival)\b/;
const FEST_WORD = /\b(fests?|festivals?|carnivals?)\b/;
const CLUB_WORD = /\b(clubs?|organi[sz]ations?|societ(y|ies))\b/;
const EVENT_WORD = /\b(events?|contests?|competitions?|workshops?|activities|sessions|schedule|line ?up|programmes?|programs?|what (else )?(is )?(in|on))\b/;
const LIST = /\b(events|fests|festivals|contests|competitions|workshops|activities|sessions|programs|programmes|talks|games|tournaments|list|show|find|search|browse|recommend|suggest|which|any|anything|something|everything|all|every|what (is )?(on|happening)|happening|going on|looking for|interested in|into|like|other|else|schedule|calendar|timetable|line ?up)\b/;
const REFERS = /\b(it|its|this event|that event|this one|that one|the event)\b/;
const MORE = /\b(tell me more|more (info|information|details)|details|about (it|this|that))\b/;
const ASPECTS = [
  ['when', /\bwhen\b|\bwhat (time|day|date)\b|\bwhich (day|date)\b|\bdate\b|\btime\b|\bstarts?\b|\bstarting\b/],
  ['where', /\bwhere\b|\bvenue\b|\blocation\b|\b(which|what) (place|room|hall)\b|\bhow (do|can) i get\b/],
  ['seats', /\bseats?\b|\bspots?\b|\bslots?\b|\bcapacity\b|\bspace\b|\bhow many (people|students|participants|teams)\b|\b(max|maximum) (number|people|students|participants)\b|\bnumber of (people|students|participants|seats|teams)\b|\bfull\b|\bleft\b|\bremaining\b|\bavailab\w+\b/],
  ['deadline', /\bdeadlines?\b|\bclos(e|es|ing)\b|\bregistrations? closed\b|\blast (date|day|chance|time)\b|\b(by|until|till) when\b|\bregister by\b|\bregistration\b.{0,30}\b(end|ends|ending|over|finish\w*|last|until|till)\b|\bcut ?off\b/],
  ['rules', /\brules?\b|\bregulations?\b|\bguidelines?\b|\ballowed\b|\bbring\b|\brequirements?\b/],
  ['form', /\bform\b|\bwhat do i need\b|\bwhat (info|information|details) (do|will|should)\b|\brequired (info|fields|details)\b|\b(do|will|should|must) i (need|have) to (give|provide|share|enter|fill)\b/],
  ['register', /\bcan i (still )?(register|join|sign up|enter|participate|apply)\b|\bopen\b|\bhow (do|can|to) (i |we )?(register|join|sign up|enter|participate|apply)\b|\bregistration status\b|\bstill (register|join)\b/],
  ['host', /\bwho (organi[sz]es?|runs|hosts|is (organi[sz]ing|running|hosting|behind))\b|\borgani[sz]ers?\b|\borgani[sz]ed by\b|\bhosted by\b|\bwhich (club|fest)\b|\bpart of\b/],
];
// Things people ask about that the event data simply does not record. Saying so beats guessing.
const MISSING = [
  [/\b(fees?|price|prices|cost|costs|paid|payment|pay|taka|tk|bdt|is it free|free of|for free|free to|free (events?|entry|contests?|workshops?|sessions?))\b|\b(is|are)\b.{0,30}\bfree\b(?! (on|at|in|this|next|tomorrow|today|tonight|for))/, 'entry fees'],
  [/\b(prizes?|rewards?|awards?|certificates?|winners?|results?|scores?|leaderboard)\b/, 'prizes, certificates or results'],
  [/\b(judges?|speakers?|mentors?|guests?|sponsors?|instructors?|teachers?)\b/, 'judges, speakers or sponsors'],
  [/\b(eligib\w+|age limit|who can (join|participate|register|apply|enter)|which class(es)?|(only )?for (class|grade)( \d+)?|open to (all|everyone|every|class|grade)|how old|\d+(st|nd|rd|th) grade|dress code|food|lunch|snacks|transport|parking)\b/, 'eligibility or logistics details'],
  [/\b(when|what time) (does|do|will|did)\b.{0,50}\b(end|ends|finish|finishes|get over)\b|\bends? at\b|\bend time\b|\bduration\b|\bhow long\b|\bfinish(es)? at\b/, 'an end time or duration'],
];
const MISSING_WORDS = new Set('fee price cost paid payment pay taka tk bdt free prize reward award certificate winner result score leaderboard judge speaker mentor guest sponsor instructor teacher eligible eligibility age limit dress code food lunch snack transport parking duration long end ending finish'.split(' ').map(stem));
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WDL = WEEKDAYS.map((w) => w[0].toUpperCase() + w.slice(1));
const MOL = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1)), MO = MOL.map((m) => m.slice(0, 3));
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thur?s?|fri|sat)';
const NTH = '(?:st|nd|rd|th)?';
// Question words: whatever is left of a question once these (and matched names) are removed is its subject.
const VOCAB = new Set((`a an the this that these those there here it its i me my mine we our us you your he she they them their is are was were be been am do does did will would
  can could should shall may might have has had get got give show tell find list search browse see view know want need like love looking look interested into about of for on in at to from by with and or but
  if so as than then not no yes please pls plz kindly thanks thank hi hello hey what when where which who whom whose why how many much any all every each some more most other another else also
  just only still yet ever now currently current right today tonight tomorrow yesterday day days week weeks weekend month months year years next last upcoming coming soon future later past previous earlier
  happening happen happened going held hold take taking place taken start starts starting begin begins time date schedule venue location located event events fest fests festival festivals club clubs activity activities
  session sessions program programs programme programmes thing things stuff something anything everything info information detail details describe description explain seat seats spot spots slot slots capacity
  space left remaining available availability full open opened closed close closes closing deadline registration registrations register registering registered sign signing signup up join joining enter participate
  participating apply rule rules requirement requirements form organizer organiser organizers organisers organised organized organize organise organizes organises host hosted run runs part belong belongs under
  inside within during around near college campus drmc student students new latest recommend suggest good best cool fun nice great out whether number count total one ones ok okay hmm wanna gonna let lets check try
  able possible exactly actually really exist offer offered provide hosting doing make work mean kind type sort category categories topic related based themed regarding attend attending go come live ongoing
  running active public published after before between over until till since through ago following including include already ended finished completed missed miss sold accepting accept soonest earliest nearest
  bring name names called free bored busy end beginning mid middle early late phone mobile email contact address roll class grade maximum max minimum limit allowed people person team teams size both two three four five six seven eight nine ten first second third morning afternoon evening night noon
  delete remove erase wipe edit modify rename create publish archive unarchive approve reject cancel reschedule change update add reopen move book reserve enrol enroll
  win play watch visit learn prepare meet help tell say said ask asked wondering wonder think thought heard hear read saw seen guess maybe perhaps sure thing well then okay hello dear sir bro
  plan plans entry drive frame round step way point idea option chance question answer problem issue reason difference rest lot bit few couple several many much lots some any anyone everybody somebody nobody
  u ur r ya yeah yep nope nah umm um uh er hmm oh ah hey guys folks friend friends buddy mate man dude asap fast quick quickly now today share shared definitely probably certainly interesting interested excited
  big small huge little great nice awesome amazing cool best better good bad easy hard simple difficult important main major minor whole entire real really very quite pretty too also even ever never always often
  sometimes usually again once twice here there where anywhere somewhere everywhere near nearby around inside outside online offline people someone something nothing everything stuff things
  want wants wanted need needs needed like likes liked love loves hope hoping wish plan planning trying try tried going gonna get gets got getting give gives gave take takes took make makes made come comes came
  see sees saw look looks looked find finds found know knows knew tell tells told ask asks show shows showed let lets keep kept put use used work works worked start started stop stopped move moved
  stay remain remains announce announced announcement added adding posted post listed scheduled arranged arrange organising organizing happening
  school home class grade hours hour minutes minute long short old young age study studying exam exams holiday vacation free busy available ready sure fine okay alright right wrong true false yes no not
  ${WEEKDAYS.join(' ')} sun mon tue tues wed thu thur thurs fri sat ${MONTHS.join(' ')} jan feb mar apr jun jul aug sep sept oct nov dec`).split(/\s+/).filter(Boolean).map(stem));

// ---- dates (club-local) ---------------------------------------------------------------------
const clock = (now) => { const l = new Date(now.getTime() + OFFSET_MS); return { today: l.toISOString().slice(0, 10), dow: l.getUTCDay(), y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate() }; };
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const localDay = (iso) => new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 10);
const parts = (day) => { const d = new Date(day + 'T00:00:00Z'); return { wd: d.getUTCDay(), d: d.getUTCDate(), m: d.getUTCMonth(), y: d.getUTCFullYear() }; };
const ymd = (y, m, d) => (y >= 1970 && y <= 9998 && m >= 0 && m <= 11 && d >= 1 && d <= 31 && new Date(Date.UTC(y, m, d)).getUTCDate() === d ? new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10) : null);   // null = no such date (31 November)
// `year`: the current year is left out of short dates; any other year is always shown.
function fmtDay(day, { long = false, year = null } = {}) {
  const p = parts(day), y = year === null || p.y !== year ? ' ' + p.y : '';
  return long ? `${WDL[p.wd]} ${p.d} ${MOL[p.m]}${y}` : `${WD[p.wd]} ${p.d} ${MO[p.m]}${y}`;
}
function fmtTime(iso) {
  const d = new Date(Date.parse(iso) + OFFSET_MS); let h = d.getUTCHours();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(d.getUTCMinutes()).padStart(2, '0')} ${ap}`;
}
const fmtWhen = (iso, c) => `${fmtDay(localDay(iso), { year: c.y })}, ${fmtTime(iso)}`;
const fmtWhenLong = (iso) => `${fmtDay(localDay(iso), { long: true })} at ${fmtTime(iso)}`;
function fmtRange(from, to, c) {
  if (!from) return '';
  if (!to || to === from) return fmtDay(from, { year: c.y });
  const a = parts(from), b = parts(to), y = b.y !== c.y ? ' ' + b.y : '';
  return a.m === b.m && a.y === b.y ? `${a.d}–${b.d} ${MO[b.m]}${y}` : `${a.d} ${MO[a.m]}${a.y !== b.y ? ' ' + a.y : ''} – ${b.d} ${MO[b.m]}${y}`;
}
const span = (from, to, c) => (from === to ? fmtDay(from, { year: c.y }) : `${fmtDay(from, { year: c.y })} – ${fmtDay(to, { year: c.y })}`);
const UNITS = { day: 1, week: 7, month: 30 }, NUMS = { a: 1, one: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7 };
const TIME_HELP = 'I can look at: today, tomorrow, this week, next week, this weekend, this month, next month, a weekday, a date such as 21 October or 2026-10-21, a month, a year, or a range such as 20 to 30 November. I cannot filter by time of day.';

// A time phrase -> an inclusive range of club-local days. Weeks run Sunday to Saturday; the weekend is Friday and Saturday.
// `unclear` is set when the question plainly talks about time in a way none of the rules below can read: it is
// better to say so than to answer for a different period.
const RELATIVE = `(?:${DAY_RE}|today|tomorrow|yesterday|tonight|(?:this |next |last |the )?(?:week|weekend|month|year)|noon|midnight|\\d{1,2} ?(?:am|pm))`;
function parseTime(raw, now) {
  const c = clock(now), t = c.today, out = { range: null, upcoming: false, past: false, next: false, all: false, unclear: false };
  const named = (from, to, name) => { if (!out.range) out.range = { from, to, label: `${name} (${span(from, to, c)})` }; };
  const plain = (from, to, label) => { if (!out.range) out.range = { from, to, label }; };
  const one = (day) => (day ? plain(day, day, `on ${fmtDay(day, { year: c.y })}`) : (out.unclear = true));
  const sunday = addDays(t, -c.dow), pastCue = /\b(happened|took place|ago|previously)\b|\b(was|were) held\b|\b(what|which|any)( events?| fests?)? (was|were)\b|\bwere there\b/.test(raw);
  const stated = (raw.match(/\b((?:19|20)\d\d)\b/) || [])[1];
  const mi = (w) => MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3))), di = (w) => WEEKDAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));
  const yearFor = (m) => (stated ? +stated : m >= c.m || pastCue || m >= c.m - 2 ? c.y : c.y + 1);   // "January", asked in October, is next January; "what was on in June" is last June
  const month = (y, m) => [ymd(y, m, 1), new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)];
  const date = (d, mon) => ymd(yearFor(mi(mon)), mi(mon), +d);
  const between = (a, b) => (a && b && a <= b ? plain(a, b, `between ${fmtDay(a, { year: c.y })} and ${fmtDay(b, { year: c.y })}`) : (out.unclear = true));
  const R = (src, flags) => new RegExp(src, flags);
  let m;
  if (/\bday after tomorrow\b/.test(raw)) named(addDays(t, 2), addDays(t, 2), 'the day after tomorrow');
  else if (/\btoday (and|or|to|through) tomorrow\b/.test(raw)) named(t, addDays(t, 1), 'today and tomorrow');
  else if (/\bweek after next\b/.test(raw)) named(addDays(sunday, 14), addDays(sunday, 20), 'the week after next');
  else if ((m = raw.match(R(`\\b(\\d{1,2})${NTH} (?:of )?${MONTH_RE} (?:to|until|till|through|thru|and) (?:the )?(\\d{1,2})${NTH} (?:of )?${MONTH_RE}\\b`)))) between(date(m[1], m[2]), date(m[3], m[4]));   // 9 October to 12 October
  else if ((m = raw.match(R(`\\b(\\d{1,2})${NTH} (?:(?:to|and|until|till|through|thru) )?(?:the )?(\\d{1,2})${NTH} (?:of )?${MONTH_RE}\\b`)))) between(date(m[1], m[3]), date(m[2], m[3]));   // 20 to 30 November, 9-12 October
  else if ((m = raw.match(R(`\\b(before|until|till|by|after|since|from) (?:the )?(?:(\\d{1,2})${NTH} (?:of )?)?${MONTH_RE}(?: (\\d{1,2})${NTH})?\\b`)))) {
    const mon = mi(m[3]), y = yearFor(mon), dn = m[2] || m[4], kind = m[1], first = ymd(y, mon, 1), last = month(y, mon)[1], day = dn ? ymd(y, mon, +dn) : null;
    if (dn && !day) out.unclear = true;
    else if (kind === 'before') plain(t, addDays(day || first, -1), `before ${fmtDay(day || first, { year: c.y })}`);
    else if (kind === 'until' || kind === 'till' || kind === 'by') plain(t, day || last, `up to ${fmtDay(day || last, { year: c.y })}`);
    else if (kind === 'after') plain(addDays(day || last, 1), FAR, `after ${fmtDay(day || last, { year: c.y })}`);
    else plain(day || first, FAR, `from ${fmtDay(day || first, { year: c.y })} onwards`);
  } else if (R(`\\b(before|after|until|till|since|between)\\b (?:the )?${RELATIVE}\\b`).test(raw)) out.unclear = true;      // "before friday", "after this week": not computed, so not guessed
  else if (/\b(\d+|two|three|four|few|couple of) (days?|weeks?|months?|years?) (ago|from now|later|time)\b|\bin (\d+|two|three|a few|a couple of) (days?|weeks?|months?|years?)\b/.test(raw)) out.unclear = true;
  else if (/\btomorrow\b/.test(raw)) named(addDays(t, 1), addDays(t, 1), 'tomorrow');
  else if (/\byesterday\b/.test(raw)) named(addDays(t, -1), addDays(t, -1), 'yesterday');
  else if (/\b(today|tonight)\b|\bthis (morning|afternoon|evening)\b/.test(raw)) named(t, t, 'today');
  else if ((m = raw.match(/\b(?:next|coming|following|upcoming|within) (\d{1,2}|a|one|two|couple|three|few|four|five|six|seven) (?:of )?(day|week|month)s?\b/))) {
    const n = (NUMS[m[1]] || +m[1]) * UNITS[m[2]]; if (n > 0) named(t, addDays(t, n - 1), `in the next ${n === 1 ? 'day' : n + ' days'}`);
  } else if (/\bnext week\b/.test(raw)) named(addDays(sunday, 7), addDays(sunday, 13), 'next week');
  else if (/\blast week\b/.test(raw)) named(addDays(sunday, -7), addDays(sunday, -1), 'last week');
  else if (/\blast weekend\b/.test(raw)) named(addDays(sunday, -2), addDays(sunday, -1), 'last weekend');
  else if (/\bnext weekend\b/.test(raw)) named(addDays(sunday, 12), addDays(sunday, 13), 'next weekend');
  else if (/\bweekend\b/.test(raw)) named(addDays(sunday, 5), addDays(sunday, 6), 'this weekend');
  else if (/\bweek\b/.test(raw)) named(sunday, addDays(sunday, 6), 'this week');
  else if (/\bnext month\b/.test(raw)) named(...month(c.y + (c.m === 11 ? 1 : 0), (c.m + 1) % 12), 'next month');
  else if (/\blast month\b/.test(raw)) named(...month(c.y - (c.m === 0 ? 1 : 0), (c.m + 11) % 12), 'last month');
  else if (/\b(this|current) month\b|\b(end|rest) of (the )?month\b|\bmonth end\b/.test(raw)) named(...month(c.y, c.m), 'this month');
  else if (/\bnext year\b/.test(raw)) plain(`${c.y + 1}-01-01`, `${c.y + 1}-12-31`, `in ${c.y + 1}`);
  else if (/\blast year\b/.test(raw)) plain(`${c.y - 1}-01-01`, `${c.y - 1}-12-31`, `in ${c.y - 1}`);
  else if (/\bthis year\b/.test(raw)) plain(`${c.y}-01-01`, `${c.y}-12-31`, `in ${c.y}`);
  else if ((m = raw.match(/\b((?:19|20)\d\d) (\d{1,2}) (\d{1,2})\b/))) one(ymd(+m[1], +m[2] - 1, +m[3]));                       // 2026-10-21
  else if ((m = raw.match(/\b(\d{1,2}) (\d{1,2}) ((?:19|20)\d\d)\b/))) one(ymd(+m[3], +m[2] - 1, +m[1]));                       // 21/10/2026
  else if ((m = raw.match(/\b(\d{1,2}) (\d{1,2}) (\d\d)\b/))) one(ymd(2000 + +m[3], +m[2] - 1, +m[1]));                         // 21-10-26
  else {
    // a single date ("21 October", "October 21"), months, a weekday, "on the 9th", "on 21/10", a year
    let bad = false; const months = [];                                     // a date that does not exist (31 November) is never quietly read as something else
    for (const x of raw.matchAll(R(`\\b(\\d{1,2})${NTH} (?:of )?${MONTH_RE}\\b`, 'g'))) { const day = date(x[1], x[2]); if (day) one(day); else bad = true; }
    for (const x of raw.matchAll(R(`\\b${MONTH_RE} (\\d{1,2})${NTH}\\b`, 'g'))) { const day = date(x[2], x[1]); if (day) one(day); else if (!out.range) bad = true; }
    if (bad) { out.range = null; out.unclear = true; return out; }
    for (const x of raw.matchAll(R(`\\b(in |during |this |for |of |next |last )?${MONTH_RE}\\b`, 'g'))) {
      if (x[2] === 'may' && !x[1]) continue;                                                     // "may I register" is not the month
      const mon = mi(x[2]), y = x[1] === 'last ' ? c.y - (mon >= c.m ? 1 : 0) : x[1] === 'next ' ? c.y + (mon <= c.m ? 1 : 0) : yearFor(mon);
      months.push({ mon, days: month(y, mon) });
    }
    months.sort((p, q) => p.days[0].localeCompare(q.days[0]));
    if (months.length === 1) named(...months[0].days, `in ${MOL[months[0].mon]}`);
    else if (months.length > 1) named(months[0].days[0], months[months.length - 1].days[1], `from ${MOL[months[0].mon]} to ${MOL[months[months.length - 1].mon]}`);
    if (!out.range && (m = raw.match(R(`\\b(last |next |this |on |coming )?${DAY_RE}\\b`)))) {
      const d = di(m[2]), ahead = (d - c.dow + 7) % 7, back = (c.dow - d + 7) % 7 || 7;
      const n = m[1] === 'last ' || (!m[1] && pastCue) ? -back : m[1] === 'next ' && ahead === 0 ? 7 : ahead;
      plain(addDays(t, n), addDays(t, n), `on ${fmtDay(addDays(t, n), { year: c.y })}`);
    }
    if (!out.range && (m = raw.match(/\bon (?:the )?(\d{1,2})(?:st|nd|rd|th)\b(?! (grade|class|event|prize|round|place|position|year|time|day|edition|floor|session|batch|anniversary))/))) {   // "on the 9th": this month, or next month if that day has gone
      const d = +m[1], day = ymd(c.y, c.m, d), later = ymd(c.y + (c.m === 11 ? 1 : 0), (c.m + 1) % 12, d);
      one(day && (d >= c.d || pastCue) ? day : later);
    }
    if (!out.range && !out.unclear && ((m = raw.match(/\bon (\d{1,2}) (\d{1,2})\b(?! \d)/)) || (m = raw.match(/\b(\d{1,2}) (\d{1,2})$/)))) one(ymd(yearFor(+m[2] - 1), +m[2] - 1, +m[1]));   // 21/10
    if (!out.range && !out.unclear && /\b\d{1,4} \d{1,2} \d{1,4}\b/.test(raw)) out.unclear = true;                              // looks like a date, reads as none
    if (!out.range && !out.unclear && stated) plain(`${stated}-01-01`, `${stated}-12-31`, `in ${stated}`);
  }
  if (out.range) out.unclear = false;
  if (!out.range && !out.unclear && /\bnext\b|\bsoonest\b|\bearliest\b|\bnearest\b/.test(raw)) out.next = true;
  if (/\b(upcoming|coming up|coming soon|soon|future|later|ahead|planned)\b/.test(raw)) out.upcoming = true;
  if (/\b(including|include|incl|counting) (the )?(past|old|previous|ended)\b|\bin total\b|\ball time\b|\bever\b|\baltogether\b/.test(raw)) out.all = true;
  else if (/\b(past|previous|earlier|already happened|happened|finished|ended|completed|history)\b|\blast (event|events|one)\b/.test(raw)) out.past = true;
  return out;
}
function detectState(raw) {
  if (/\b(not|no longer|never) (yet |currently |still )?(open|available|accepting)\b/.test(raw)) return { state: null, stateNot: 'open' };
  if (/\bnot (yet |currently )?(full|closed|sold out)\b|\bopen\b|\bavailab\w+\b|\bcan i (still )?(register|join|sign up|enter|participate|apply)\b|\bregister for\b|\bjoinable\b|\baccepting\b|\bstill register\b|\bsign up for\b|\bseats? (left|available)\b/.test(raw)) return { state: 'open', stateNot: null };
  if (/\bfull\b|\bsold out\b|\bno seats\b|\bbooked\b/.test(raw)) return { state: 'full', stateNot: null };
  if (/\bclosed\b|\bmiss(ed)?\b/.test(raw)) return { state: 'closed', stateNot: null };
  return { state: null, stateNot: null };
}
function detectAspects(raw) {
  const found = ASPECTS.filter(([, re]) => re.test(raw)).map(([k]) => k);
  // "When does registration close?" is about the deadline, not the start time.
  const kept = /\b(max|maximum|how many|number of)\b/.test(raw) ? found.filter((a) => a !== 'rules') : found;   // "how many are allowed" is about seats, not the rule book
  return kept.includes('deadline') ? kept.filter((a) => a !== 'when') : kept;
}
// Everything a question says apart from names: when, which state, which facts, a list or a single thing.
function signals(asked, now) {
  const text = /\bfull (list|schedule|details?|info\w*|program\w*|line ?up|names?|day|time|calendar|description)\b|\bin full\b/.test(asked) ? asked.replace(/\bfull\b/g, ' ').replace(/ +/g, ' ').trim() : asked;   // "the full list" is not about seats
  const time = parseTime(text, now), aspects = detectAspects(text), listy = LIST.test(text), st = detectState(text);
  const found = MISSING.find(([re]) => re.test(text)), missing = found && !(found[1].startsWith('an end') && aspects.includes('deadline')) ? found[1] : null;
  const general = /^(what|which|show|find|list|any|anything)\b/.test(text) && /\b(open|available|happening|going on|on)\b/.test(text);
  const filters = { state: time.past ? null : st.state, stateNot: time.past ? null : st.stateNot, range: time.range, upcoming: time.upcoming, past: time.past, next: time.next, all: time.all };
  if (filters.range && aspects.includes('deadline')) filters.rangeOn = 'deadline';       // "which registrations close tomorrow" is about deadlines, not start dates
  const timed = !!(time.range || time.upcoming || time.past || time.next || time.all);
  return { time, aspects, listy, missing, filters, timed, eventWord: EVENT_WORD.test(text), followUp: (aspects.length > 0 || !!missing) && !listy && !general && !time.range && !time.next,
    listLike: listy || timed || ((!!st.state || !!st.stateNot) && !aspects.some((a) => a !== 'seats' && a !== 'register')) };
}

// ---- names in the question -> real records ---------------------------------------------------
const NAME_STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'with', 'by']);
const OPTIONAL = new Set(['drmc', 'remian']);                          // a leading "DRMC" may be left out: "Math Club" is "DRMC Math Club"
function entity(type, rec, name, dateYear) {
  const all = stems(name).filter((t) => !NAME_STOP.has(t)), nameYear = all.find(isYear) || null;
  let seq = all.filter((t) => !isYear(t));
  while (seq.length > 1 && OPTIONAL.has(seq[0])) seq = seq.slice(1);
  return { type, id: rec.id, name, rec, all, seq, year: nameYear || dateYear || null, yearInName: !!nameYear };   // year: the one in the name, else the year it takes place
}
const buildIndex = (data) => [...data.events().map((e) => entity('event', e, e.title, e.starts_at ? localDay(e.starts_at).slice(0, 4) : null)),
  ...data.fests().map((f) => entity('fest', f, f.name, f.starts_on ? String(f.starts_on).slice(0, 4) : null)), ...data.clubs().map((c) => entity('club', c, c.name, null))];
// A record is named when the words of its name appear in the question in order, next to each other. A different
// year or number after it ("Tech Carnival 2025"), or an extra word in front ("National Programming Contest"),
// means the visitor is asking about something else: that is kept as a near miss, never answered as the record.
function findNames(index, qw, all) {
  const qs = qw.map(stem), pos = qw.map((_, i) => i).filter((i) => !NAME_STOP.has(qs[i])), found = [];
  for (const e of index) {
    const n = e.seq.length; if (!n) continue;
    for (let i = 0; i + n <= pos.length; i++) {
      if (!e.seq.every((t, k) => qs[pos[i + k]] === t)) continue;
      let from = pos[i], to = pos[i + n - 1], ok = true;
      while (from > 0 && OPTIONAL.has(qs[from - 1])) from--;
      const after = qw[to + 1], last = to + 2 === qw.length;
      if (e.year && after && isYear(after)) { if (after === e.year) to++; else ok = false; }   // "Tech Carnival 2026" is this record; "Tech Carnival 2025" is not
      else if (e.year && after && /^\d\d$/.test(after) && last) { if (e.year.endsWith(after)) to++; else if (e.yearInName) ok = false; }   // "Tech Carnival 26" / "Tech Carnival 25"
      found.push({ e, from, to, ok });
    }
  }
  const inside = (a, b) => a !== b && a.from >= b.from && a.to <= b.to && (a.to - a.from < b.to - b.from);
  const kept = found.filter((a) => !found.some((b) => inside(a, b)));
  const taken = (i) => kept.some((h) => i >= h.from && i <= h.to);
  const freeYears = qw.filter((w, i) => isYear(w) && !taken(i));       // a year that is not part of a matched name says which edition is meant
  for (const h of kept) {
    if (h.ok && h.e.year && freeYears.length && !freeYears.includes(h.e.year)) h.ok = false;
    const p = h.from - 1;                                              // an unexplained word right in front of the name makes it a different name
    if (p >= 0 && !taken(p) && !VOCAB.has(qs[p]) && !MISSING_WORDS.has(qs[p]) && !/^\d+$/.test(qw[p]) && !termMatcher(qs[p], all)) { h.ok = false; h.from = p; }
  }
  return { hits: kept.filter((h) => h.ok), misses: kept.filter((h) => !h.ok) };
}
const yearOk = (e, years) => !years.length || !e.year || years.includes(e.year);
// Every word of the question's subject appears in the record's name ("the keynote" -> "Opening Keynote").
function partialNames(index, subject, years, types, asked) {
  const found = index.filter((e) => types.includes(e.type) && yearOk(e, years) && subject.every((t) => e.all.includes(t)));
  if (found.length < 2 || !asked) return found;
  const held = (e) => e.all.filter((t) => asked.includes(t)).length, best = Math.max(...found.map(held)), top = found.filter((e) => held(e) === best);
  return top.length === 1 && best > subject.length ? top : found;       // "first aid week" holds more of "RYRC First Aid Week 2026" than of "First Aid Basics"
}
const TIME_WORDS = new Set(['week', 'weekend', 'day', 'night', 'month', 'year']);
function closestNames(index, subject, types) {
  return index.filter((e) => types.includes(e.type)).map((e) => ({ e, n: e.seq.filter((t) => subject.some((s) => near(s, t))).length })).filter((x) => x.n > 0)
    .sort((a, b) => b.n / b.e.seq.length - a.n / a.e.seq.length || b.n - a.n).slice(0, 3).map((x) => ({ ...x.e, whole: x.n === x.e.seq.length }));
}
// A search word, resolved against the whole public catalogue: the visitor's own word (or an equivalent) in a title,
// category, fest name or club name; failing that, related words in titles and categories, which the answer then
// says are related rather than exact. null = the word matches nothing that is published.
const tokenCache = new WeakMap();
function tokensOf(e) {
  let t = tokenCache.get(e);
  if (!t) tokenCache.set(e, t = { name: [...stems(e.title), ...stems(e.category)], group: [...stems(e.fest_name), ...stems(e.club_name)] });
  return t;
}
function termMatcher(term, all) {
  const same = group(SAME, term) || [term], related = group(RELATED, term);
  const direct = (e) => { const t = tokensOf(e); return same.some((w) => t.name.includes(w) || t.group.includes(w)); };
  if (all.some(direct)) return { term, widened: false, test: direct };
  const loose = related && ((e) => related.some((w) => tokensOf(e).name.includes(w)));
  return loose && all.some(loose) ? { term, widened: true, test: loose } : null;
}
const didYouMean = (word, all) => { for (const e of all) for (const w of words(`${e.title} ${e.category} ${e.fest_name} ${e.club_name}`)) if (stem(w) !== word && near(stem(w), word)) return w; return null; };
// A venue is recognised as a phrase ("seminar hall", "computer lab 1", "the auditorium"), so its number is kept and
// a word like "workshop" or "art" is not mistaken for "Workshop Bay" or "Art Gallery Hall".
const atVenue = (e, phrase) => ` ${norm(e.venue)} `.includes(` ${phrase} `);
function findVenue(rw, all) {
  for (let n = Math.min(4, rw.length); n >= 1; n--) for (let i = 0; i + n <= rw.length; i++) {
    const gram = rw.slice(i, i + n);
    if (NAME_STOP.has(gram[0]) || NAME_STOP.has(gram[n - 1]) || /^\d+$/.test(gram[0])) continue;
    if (n === 1 && (VOCAB.has(stem(gram[0])) || termMatcher(stem(gram[0]), all))) continue;
    const phrase = gram.join(' ');
    if (all.some((e) => e.venue && atVenue(e, phrase))) return { phrase, from: i, to: i + n - 1 };
  }
  return null;
}

// ---- question -> query ----------------------------------------------------------------------
// The query is a small, closed description of what to look up. The optional AI helper produces the same shape
// (see fromModel), so whichever route understood the question, the answer is built by `execute` from real records.
const REFUSE = { kind: 'refuse' };
function interpret(text, data, now, ctx = {}) {
  const raw = norm(text);
  if (!/[a-z0-9]/.test(raw)) return { kind: 'unknown' };          // empty, or a script the rules below cannot read
  if (INJECTION.test(raw) || SQLISH.test(raw)) return REFUSE;
  if (PRIVACY_Q.test(raw)) return { kind: 'privacy' };
  const mine = FIRST_PERSON.test(raw) && !COLLECTIVE.test(raw);
  if (asksForPeople(raw, mine)) return REFUSE;
  if (ACCOUNT_Q.test(raw)) return { kind: 'howto_register', account: true };
  if (HELP.test(raw)) return { kind: 'help' };

  const qw = raw.split(' '), index = buildIndex(data), all = data.events(), { hits, misses } = findNames(index, qw, all);
  // Words that belong to a matched name are not question words: "Open Source Week" is not asking what is open this week.
  const afterNames = qw.filter((_, i) => !hits.some((h) => i >= h.from && i <= h.to)), venue = findVenue(afterNames, all);
  const restWords = venue ? afterNames.filter((_, i) => i < venue.from || i > venue.to) : afterNames, rest = restWords.join(' ');
  // "sql", "token" and friends are refused unless the word is part of a real published name (an "SQL Workshop" event) or plainly a topic.
  if (HARD_SECRETS.test(rest) || (SOFT_SECRETS.test(rest) && (SOFT_ACCESS.test(rest) || !TOPIC_NOUN.test(rest)))) return REFUSE;

  const originals = (set, digits) => String(text).split(/[^\p{L}\p{N}\p{M}]+/u).filter((w) => w && (set.has(stem(norm(w))) || (digits && /^\d+$/.test(w)))).join(' ').slice(0, 60);
  // The visitor's own words from the first to the last word that matched a name: "web in a day workshop".
  const stretch = (set) => { const w = String(text).split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean), on = w.map((x) => set.has(stem(norm(x)))), a = on.indexOf(true), b = on.lastIndexOf(true); return a < 0 ? '' : b - a < 6 ? w.slice(a, b + 1).join(' ').slice(0, 60) : w.filter((_, i) => on[i]).join(' ').slice(0, 60); };
  if (!hits.length && misses.length) {                              // right name, wrong year or an extra word: not that record
    const h = misses[0], said = new Set(qw.slice(h.from, h.to + 1).map(stem));
    return { kind: 'not_found', label: originals(said, true), subject: h.e.seq, closest: [...new Map(misses.map((x) => [x.e.type + x.e.id, { ...x.e, whole: true }])).values()].slice(0, 3) };
  }
  const E = hits.filter((h) => h.e.type === 'event').map((h) => h.e), F = hits.filter((h) => h.e.type === 'fest').map((h) => h.e), C = hits.filter((h) => h.e.type === 'club').map((h) => h.e);
  const years = restWords.filter(isYear), sig = signals(rest, now), { aspects, missing, filters, listy } = sig, asked = restWords.map(stem);
  if (venue) { filters.venue = venue.phrase; sig.listLike = true; }
  const subject = [...new Set(restWords.filter((w) => !/^\d+(st|nd|rd|th)?$/.test(w)).map(stem).filter((t) => !VOCAB.has(t) && !(missing && MISSING_WORDS.has(t))))];
  const label = originals(new Set(subject), years.length > 0);
  const ctxEvent = ctx.event && data.events().some((e) => e.id === ctx.event) ? ctx.event : null;
  const ctxFest = ctx.fest && data.fests().some((f) => f.id === ctx.fest) ? ctx.fest : null;
  // Search words: the ones that match something published are used; the rest are reported back, never silently dropped.
  const known = subject.filter((t) => termMatcher(t, all)), unknown = subject.filter((t) => !known.includes(t));
  const dropped = unknown.length ? { words: originals(new Set(unknown), false), hint: unknown.map((w) => didYouMean(w, all)).find(Boolean) || null } : null;
  const knownLabel = originals(new Set(known), false), scoped = (s) => ({ ...s.filters, terms: known });
  const festQuery = (id, s, extra = {}) => ({ kind: 'fest', id, aspects: s.aspects, missing: s.missing, events: s.eventWord || s.timed || !!(s.filters.state || s.filters.stateNot || s.filters.venue) || known.length > 0, filters: scoped(s), dropped, label: knownLabel, ...extra });

  if (FOR_ME.test(rest)) return { kind: 'readonly', register: true, eventId: E.length === 1 ? E[0].id : ctxEvent };
  if (WRITE.test(rest)) return mine && /\b(registrations?|pass|passes|seat|spot)\b/.test(rest) ? { kind: 'howto_pass' } : { kind: 'readonly' };
  if (/\bvolunteer\w*\b/.test(rest)) return { kind: 'volunteer' };
  if (MY_OWN.test(rest) && !missing && !(hits.length && !/\b(my|mine)\b/.test(rest))) return { kind: 'howto_pass' };

  // Part of a name ("the keynote", "red crescent"): answered, but the reply says which record it took that to mean.
  const named = (types) => {
    if (!subject.length) return null;
    const found = partialNames(index, subject, years, types, asked);
    if (found.length > 1) return found.every((f) => f.type === 'event') ? { kind: 'events', filters: { ids: found.map((f) => f.id) }, lead: 'matches' } : { kind: 'matches', items: found };
    if (!found.length) return null;
    const f = found[0], s = signals(restWords.filter((w) => !f.all.includes(stem(w))).join(' '), now), took = { said: stretch(new Set(f.all.filter((t) => asked.includes(t)))) || label, name: f.name };
    return f.type === 'event' ? { kind: 'event', id: f.id, aspects: s.aspects, missing: s.missing, took } : f.type === 'fest' ? { kind: 'fest', id: f.id, aspects: s.aspects, missing: s.missing, events: s.eventWord, filters: s.filters, took } : { kind: 'club', id: f.id, filters: s.filters, filtered: s.timed || !!(s.filters.state || s.filters.stateNot), took };
  };
  // "sports week", "web in a day": the time word is part of a name here, so the name is tried before the calendar.
  const nameWithTimeWord = () => {
    if (!subject.length || hits.length) return null;
    const found = partialNames(index, subject, years, ['event', 'fest', 'club'], asked);
    return found.length === 1 && found[0].all.some((t) => TIME_WORDS.has(t) && asked.includes(t)) ? named(['event', 'fest', 'club']) : null;
  };
  if (E.length === 1) return { kind: 'event', id: E[0].id, aspects, missing, notIn: F.length && F[0].id !== E[0].rec.fest_id ? F[0].name : null };
  if (E.length > 1) return { kind: 'events', filters: { ids: E.map((e) => e.id) }, lead: 'matches' };
  const viaName = sig.timed || sig.time.unclear ? nameWithTimeWord() : null;
  if (viaName) return viaName;
  if (sig.time.unclear) return { kind: 'time_unclear' };
  if (F.length === 1) return festQuery(F[0].id, sig);
  if (F.length > 1) return { kind: 'matches', items: F };
  if (C.length === 1) return { kind: 'club', id: C[0].id, filters: scoped(sig), filtered: sig.timed || !!(filters.state || filters.stateNot || filters.venue) || known.length > 0, dropped, label: knownLabel };
  if (C.length > 1) return { kind: 'matches', items: C };
  if (HOWTO_REGISTER.test(rest)) return { kind: 'howto_register' };

  const show = FEST_WORD.test(rest) ? 'fest' : CLUB_WORD.test(rest) ? 'club' : null;      // "which fest has coding events": each line says which
  const notFound = () => ({ kind: 'not_found', label, subject, closest: closestNames(index, subject, ['event', 'fest', 'club']) });

  if (THIS_FEST.test(rest) && !unknown.length) return ctxFest ? festQuery(ctxFest, sig, { events: sig.eventWord || known.length > 0 || !aspects.some((x) => x === 'when' || x === 'where') }) : { kind: 'fests', which: true };
  if (FEST_WORD.test(rest)) {
    const hit = named(['fest']), several = /\b(fests|festivals|carnivals)\b/.test(rest);
    if (hit) return hit.kind === 'fest' && sig.eventWord ? { ...hit, events: true } : hit;
    if (!/\bevents?\b/.test(rest) && !subject.length) return { kind: 'fests', status: /\b(live|ongoing|right now|happening now)\b/.test(rest) ? 'live' : sig.time.past ? 'past' : sig.time.upcoming || sig.time.next ? 'upcoming' : null, range: sig.time.range };
    if (unknown.length && !several) return notFound();              // a fest was named, and no fest has that name
  }
  if (CLUB_WORD.test(rest)) {
    const hit = named(['club']), several = /\b(clubs|organi[sz]ations|societies)\b/.test(rest);
    if (hit) return hit;
    if (!/\bevents?\b/.test(rest) && !subject.length) return { kind: 'clubs' };
    if (unknown.length && !several) return notFound();
  }
  if (subject.length) {
    // "Tech Carnival 2025" is not "Tech Carnival 2026": a right name with a wrong year is reported as not found.
    const otherYear = years.length ? partialNames(index, subject, [], ['event', 'fest', 'club']).filter((e) => e.year && !years.includes(e.year)) : [];
    if (otherYear.length) return { kind: 'not_found', label, subject, closest: otherYear.slice(0, 3).map((e) => ({ ...e, whole: true })) };
    if (!listy && !sig.timed) {                                     // a question about one thing, by a name that is not a published name
      const hit = named(['event', 'fest', 'club']);
      if (hit) return hit;
      if (missing) return ctxEvent && sig.followUp ? { kind: 'event', id: ctxEvent, aspects, missing } : { kind: 'missing', missing };
      return unknown.length ? notFound() : { kind: 'events', filters: { ...filters, terms: known }, label, subject, wordSearch: true, show };
    }
    // A list question. Words that match nothing cannot be used to filter: with nothing else to go on that is "not found".
    if (!known.length && !sig.timed && !filters.state && !filters.stateNot) return notFound();
    return { kind: 'events', filters: { ...filters, terms: known }, label: knownLabel, subject, dropped, missingNote: missing, show };
  }
  // No name in the question: a follow-up about the event or fest on screen, or a general list.
  if (ctxEvent && !listy && (sig.followUp || MORE.test(rest) || (REFERS.test(rest) && (aspects.length || filters.range)))) return { kind: 'event', id: ctxEvent, aspects: filters.range && !aspects.length ? ['when'] : aspects, missing };
  if (sig.followUp && ctxFest && aspects.length && aspects.every((a) => a === 'when' || a === 'where')) return festQuery(ctxFest, sig, { events: false });
  if (ctxFest && !ctxEvent && (REFERS.test(rest) || /\b(ones|them|these|those)\b/.test(rest))) return festQuery(ctxFest, sig, { events: true });
  if (missing && !sig.listLike) return { kind: 'missing', missing };
  if (sig.listLike) {
    const closing = aspects.includes('deadline');                   // "closing soon" only makes sense for events you can still register for
    return { kind: 'events', filters: closing && !filters.range && !filters.state && !filters.stateNot && !filters.past ? { ...filters, state: 'open' } : filters, emphasis: closing ? 'deadline' : null, missingNote: missing };
  }
  if (aspects.includes('form') && !ctxEvent) return { kind: 'howto_register' };          // "do I have to give my phone number?": the general answer; each event's own questions are on its page
  if (aspects.includes('deadline')) return { kind: 'events', filters: { state: 'open' }, emphasis: 'deadline', ask: true };
  if (aspects.length) return { kind: 'events', filters: { upcoming: true }, ask: true };
  if (GREET.test(raw)) return { kind: 'greeting' };
  if (THANKS.test(raw)) return { kind: 'thanks' };
  return { kind: 'unknown' };
}

// ---- query -> reply -------------------------------------------------------------------------
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const eventSource = (e) => ({ type: 'event', id: e.id, title: e.title, href: `/events/${e.id}`, starts_at: e.starts_at, venue: e.venue || '', registration_state: e.registration_state, remaining: e.remaining, capacity: e.capacity, fest: e.fest_name });
const festSource = (f) => ({ type: 'fest', id: f.id, title: f.name, href: `/fests/${f.id}`, starts_on: f.starts_on, ends_on: f.ends_on, venue: f.venue || '', status: f.status });
const clubSource = (c) => ({ type: 'club', id: c.id, title: c.name, href: `/clubs/${c.id}` });
const recordSource = (e) => (e.type === 'event' ? eventSource(e.rec) : e.type === 'fest' ? festSource(e.rec) : clubSource(e.rec));
const page = (title, href) => ({ type: 'page', title, href });
const reply = (intent, message, sources = [], extra = {}) => ({ intent, message, sources, suggestions: [], ...extra });
const NOT_IN_DATA = "I couldn't find that information in the club's event data.";
const FEST_STATUS = { live: 'live now', upcoming: 'upcoming', past: 'past' };
const STATE_PHRASE = { open: 'open for registration', full: 'full', closed: 'closed for registration' };
const STARTERS = ["What's open for registration?", "What's happening this week?", 'When is the next event?'];
const tookLine = (t) => (t ? `Taking "${t.said}" to mean ${t.name}.\n` : '');
const droppedLine = (d) => (d ? `Nothing in the event data matches "${d.words}"${d.hint ? ` (did you mean "${d.hint}"?)` : ''}, so that part is left out.\n` : '');
const missingLine = (m) => (m ? `The event data doesn't record ${m}.\n` : '');

const seatNote = (e) => (e.registration_state === 'open' ? `${plural(e.remaining, 'seat')} left` : e.registration_state === 'full' ? 'full' : e.registration_state === 'closed' ? 'registration closed' : 'ended');
function eventLine(e, c, emphasis, show) {
  const when = e.starts_at ? fmtWhen(e.starts_at, c) : 'date not published', owner = show === 'fest' ? e.fest_name : show === 'club' ? e.club_name : '';
  if (owner) return `• ${e.title} — ${[owner, when, seatNote(e)].filter(Boolean).join(' · ')}`;
  if (emphasis === 'deadline') return `• ${e.title} — ${e.deadline ? `${e.deadline_passed ? 'closed' : 'closes'} ${fmtWhen(e.deadline, c)}` : 'no deadline published'} · ${seatNote(e)}`;
  return `• ${e.title} — ${[when, e.venue, seatNote(e)].filter(Boolean).join(' · ')}`;
}
function registrationLine(e, named = false) {
  const taken = `${e.taken} of ${plural(e.capacity, 'seat')} taken`, t = e.title;
  if (e.registration_state === 'open') return `${named ? `Registration for ${t}` : 'Registration'} is open: ${plural(e.remaining, 'seat')} left (${taken}).${e.deadline ? ` It closes on ${fmtWhenLong(e.deadline)}.` : ''}`;
  if (e.registration_state === 'full') return `${named ? t : 'It'} is full: all ${plural(e.capacity, 'seat')} are taken.`;
  if (e.registration_state === 'closed') return `${named ? `Registration for ${t}` : 'Registration'} is closed${e.deadline ? `: it closed on ${fmtWhenLong(e.deadline)}` : ''}. ${taken[0].toUpperCase() + taken.slice(1)}.`;
  return `${named ? t : 'This event'} has already taken place, so registration is over.`;
}
function eventReply(e, q) {
  const past = e.ended, lines = [], aspects = q.aspects || [];
  const when = e.starts_at ? `${e.title} ${past ? 'took place' : 'is'} on ${fmtWhenLong(e.starts_at)}.` : `No date is published for ${e.title} yet.`;
  const where = e.venue ? `${e.title} ${past ? 'was held' : 'is'} at ${e.venue}.` : `No venue is published for ${e.title} yet.`;
  const formFields = (e.form_schema || []).map((f) => f.label + (f.required ? '' : ' (optional)'));
  const form = `The registration form for ${e.title} asks for your name and email${formFields.length ? `, plus: ${formFields.join(', ')}` : ''}.`;
  if (q.notIn) lines.push(`${e.title} is not part of ${q.notIn}: it is in ${e.fest_name}.`);
  if (q.missing) lines.push(`${NOT_IN_DATA} It doesn't record ${q.missing} for ${e.title}.`);
  if (aspects.includes('when')) lines.push(q.missing && q.missing.startsWith('an end') ? (e.starts_at ? `It ${past ? 'started' : 'starts'} on ${fmtWhenLong(e.starts_at)}.` : 'No start time is published either.') : when);
  if (aspects.includes('where')) lines.push(aspects.includes('when') ? (e.venue ? `Venue: ${e.venue}.` : 'No venue is published yet.') : where);
  if (aspects.includes('seats') || aspects.includes('register')) lines.push(registrationLine(e, !lines.length));
  else if (aspects.includes('deadline')) lines.push(e.deadline ? `Registration for ${e.title} ${e.deadline_passed ? 'closed' : 'closes'} on ${fmtWhenLong(e.deadline)}.${e.registration_state === 'full' ? ' It is already full.' : ''}` : `No registration deadline is published for ${e.title}.`);
  if (aspects.includes('register') && e.registration_state === 'open') lines.push(`To register, open the event page and press Register. ${e.auto_confirm ? 'Registrations are confirmed straight away.' : 'An organizer approves each registration.'}`);
  if (aspects.includes('form')) lines.push(form);
  if (aspects.includes('rules')) lines.push(e.rules ? `Rules for ${e.title}: ${e.rules}` : `No rules are published for ${e.title}.`);
  if (aspects.includes('host')) lines.push(`${e.title} is part of ${e.fest_name}${e.club_name ? `, run by ${e.club_name}` : ''}.`);
  if (lines.length === (q.notIn ? 1 : 0) + (q.missing ? 1 : 0)) {    // nothing specific was asked (or only something the data lacks): the whole card
    if (q.missing) lines.push('What it does have:');
    else lines.push(`${e.title}${e.category ? ` — ${e.category}` : ''}, part of ${e.fest_name}${e.club_name ? ` (${e.club_name})` : ''}.`);
    if (e.description && !q.missing) lines.push(e.description);
    lines.push(`When: ${e.starts_at ? fmtWhenLong(e.starts_at) : 'not published yet'}`, `Where: ${e.venue || 'not published yet'}`, registrationLine(e));
  }
  const more = [aspects.includes('seats') || aspects.includes('register') ? null : 'How many seats are left?', aspects.includes('deadline') || past ? null : 'When does registration close?', aspects.includes('where') ? null : 'Where is it?', `What else is in ${e.fest_name}?`];
  return reply('event', tookLine(q.took) + lines.join('\n'), [eventSource(e), ...(aspects.includes('host') || q.notIn ? [{ type: 'fest', id: e.fest_id, title: e.fest_name, href: `/fests/${e.fest_id}` }] : [])],
    { focus: { event: e.id }, suggestions: more.filter(Boolean).slice(0, 3) });
}

function selectEvents(f, data) {
  const all = data.events(); let list = all, widened = false;
  if (f.ids) list = list.filter((e) => f.ids.includes(e.id));
  if (f.festId) list = list.filter((e) => e.fest_id === f.festId);
  if (f.clubId) list = list.filter((e) => e.club_id === f.clubId);
  if (f.category) list = list.filter((e) => e.category === f.category);
  if (f.venue) list = list.filter((e) => e.venue && atVenue(e, f.venue));
  for (const term of f.terms || []) { const m = termMatcher(term, all); list = m ? list.filter(m.test) : []; widened = widened || !!(m && m.widened); }
  const dayOf = (e) => (f.rangeOn === 'deadline' ? e.deadline : e.starts_at);
  if (f.range) list = list.filter((e) => dayOf(e) && localDay(dayOf(e)) >= f.range.from && localDay(dayOf(e)) <= f.range.to);
  if (f.state) list = list.filter((e) => e.registration_state === f.state);
  if (f.stateNot) list = list.filter((e) => e.registration_state !== f.stateNot && !e.ended);
  if (f.past) return { list: list.filter((e) => e.ended).reverse(), hiddenPast: 0, widened };
  // By default a list is about what you can still go to; a fest's programme, a named date range and "in total" show everything.
  const everything = f.all || ((f.range || f.festId || f.ids || f.state || f.stateNot) && !f.upcoming && !f.next);   // a venue or keyword alone still means "what is coming up"
  if (everything) return { list, hiddenPast: 0, widened };
  const ahead = list.filter((e) => !e.ended);
  return { list: ahead, hiddenPast: list.length - ahead.length, pastList: list.filter((e) => e.ended).reverse(), widened };
}
function eventsReply(q, data, now) {
  const c = clock(now), f = q.filters || {}, scope = q.scope || null;   // scope = { type, name } of a fest or club
  let { list, hiddenPast, pastList, widened } = selectEvents(f, data);
  const terms = f.terms && f.terms.length ? `"${q.label || f.terms.join(' ')}"` : '';
  const what = terms ? (widened ? ` related to ${terms}` : ` matching ${terms}`) : '';
  const halls = f.venue ? [...new Set(data.events().filter((e) => e.venue && atVenue(e, f.venue)).map((e) => e.venue))] : [];
  const where = (scope ? (scope.type === 'fest' ? ` in ${scope.name}` : ` from ${scope.name}`) : '') + (f.venue ? ` at ${halls.length && halls.length <= 2 ? halls.join(' or ') : `venues named "${f.venue}"`}` : '');
  const when = f.range ? (f.rangeOn === 'deadline' ? ` with a registration deadline ${f.range.label}` : ` ${f.range.label}`) : '';
  const stateText = f.state ? STATE_PHRASE[f.state] : f.stateNot ? 'not open for registration (full or closed)' : '';
  const notes = droppedLine(q.dropped) + missingLine(q.missingNote);
  const browse = f.clubId ? page('All events from this club', `/events?club=${f.clubId}`) : f.state === 'open' ? page('All open events', '/events?state=open') : f.category ? page(`All ${f.category} events`, `/events?category=${encodeURIComponent(f.category)}`) : page('Browse all events', '/events');
  const next = data.events().find((e) => !e.ended);
  const general = [...(q.dropped && q.dropped.hint ? [`Find ${q.dropped.hint} events`] : []), ...STARTERS.filter((x, i) => !(i === 0 && f.state === 'open') && !(i === 1 && f.range && f.range.label.startsWith('this week')))];

  if (!list.length) {
    if (hiddenPast && !f.next) return reply('events', `${notes}No upcoming events${what || (f.category ? ` in the ${f.category} category` : '')}${where}${when}, but ${plural(hiddenPast, 'past event')} did:\n${pastList.slice(0, LIST_CAP).map((e) => eventLine(e, c)).join('\n')}`, [...pastList.slice(0, LIST_CAP).map(eventSource), browse], { total: 0, suggestions: general.slice(0, 2) });
    if (q.wordSearch) return null;                                  // nothing by that word: handled as "not found"
    const none = !data.events().length ? 'There are no published events yet.'
      : (f.next || f.upcoming) && !what && !where && !when && !stateText ? 'There are no upcoming events in the club\'s event data right now.'
      : `I couldn't find any ${f.next || f.upcoming ? 'upcoming ' : ''}events${what}${where}${when}${stateText ? ` that are ${stateText}` : ''}${f.past ? ' that have already taken place' : ''} in the club's event data.`;
    const hint = next && !scope && (f.range || f.state) ? `\nThe next event is ${next.title} on ${fmtWhenLong(next.starts_at)}.` : '';
    return reply('events', notes + none + hint, hint ? [eventSource(next), browse] : [browse], { total: 0, suggestions: general.slice(0, 2) });
  }
  if (f.next) {
    const e = list[0];
    return reply('event', `${notes}The next event${what}${where}${stateText ? ` that is ${stateText}` : ''} is ${e.title}, on ${fmtWhenLong(e.starts_at)}${e.venue ? ` at ${e.venue}` : ''}.\n${registrationLine(e)}`, [eventSource(e)],
      { focus: { event: e.id }, suggestions: ['Where is it?', `What else is in ${e.fest_name}?`, "What's happening this week?"] });
  }
  if (q.emphasis === 'deadline') list = [...list].sort((a, b) => String(a.deadline || '9').localeCompare(String(b.deadline || '9')));

  const cap = f.festId ? FEST_CAP : LIST_CAP, shown = list.slice(0, cap), n = list.length, are = n === 1 ? 'is' : 'are';
  const plainOnly = (k) => !what && !f.category && !f.venue && !f.stateNot && !f.all && ['state', 'range', 'upcoming', 'past', 'next'].every((x) => x === k || !f[x]);
  let lead;
  if (q.ask) lead = q.emphasis === 'deadline' ? 'Each event has its own registration deadline. These close soonest:' : 'Which event do you mean? These are coming up next:';
  else if (q.lead === 'matches') lead = `${plural(n, 'event')} ${n === 1 ? 'matches' : 'match'} that name:`;
  else if (q.lead) lead = q.lead;
  else if (q.wordSearch) lead = `${plural(n, 'upcoming event')} ${n === 1 ? 'has' : 'have'} ${terms} in ${n === 1 ? 'its' : 'their'} name, category or venue${widened ? ' (or a related word)' : ''}:`;
  else if (q.emphasis === 'deadline') lead = f.range ? `Registration ${f.range.to < c.today ? 'closed' : 'closes'} ${f.range.label} for ${plural(n, f.state === 'open' ? 'open event' : 'event')}${what}${where}:` : `Registration deadlines for ${plural(n, f.state === 'open' ? 'open event' : 'event')}${what}${where}, soonest first:`;
  else if (!scope && plainOnly('state') && f.state === 'open') lead = `${plural(n, 'event')} ${are} open for registration right now${n > cap ? `. The next ${cap}:` : ':'}`;
  else if (!scope && plainOnly('upcoming')) lead = n > cap ? `There are ${n} upcoming events. The next ${cap}:` : `${plural(n, 'upcoming event')}:`;
  else if (!scope && plainOnly('range') && f.range) lead = `${plural(n, 'event')} ${f.range.to < c.today ? 'took place' : `${are} ${f.range.from > c.today ? 'coming up' : 'happening'}`} ${f.range.label}:`;
  else if (scope && scope.type === 'fest' && !what && !when && !stateText && !f.past && !f.upcoming && !f.venue) lead = `${scope.name} has ${plural(n, 'event')}:`;
  else {
    const sort = f.past ? 'past event' : !f.all && (f.upcoming || !(f.range || f.festId || f.ids || f.state || f.stateNot)) ? 'upcoming event' : 'event';
    lead = `Found ${plural(n, sort)}${f.all ? ' (past ones included)' : ''}${f.category ? ` in the ${f.category} category` : what}${where}${when}${stateText ? ` that ${are} ${stateText}` : ''}${n > cap ? `. The first ${cap}:` : ':'}`;
  }
  const tail = n > shown.length ? `\n…and ${n - shown.length} more.` : '';
  return reply('events', `${notes}${lead}\n${shown.map((e) => eventLine(e, c, q.emphasis, q.show)).join('\n')}${tail}`, [...shown.map(eventSource), ...(scope && scope.type === 'fest' ? [] : [browse])],
    { total: n, suggestions: general.slice(0, 2) });
}

function festReply(fest, q, data, now) {
  const c = clock(now), dates = fmtRange(fest.starts_on, fest.ends_on, c), aspects = (q.aspects || []).filter((a) => a === 'when' || a === 'where'), lines = [];
  const focus = { fest: fest.id }, src = festSource(fest), took = tookLine(q.took);
  if (q.missing) return reply('fest', `${took}${NOT_IN_DATA} It doesn't record ${q.missing} for ${fest.name}.`, [src], { focus });
  if (aspects.length && !q.events) {
    if (aspects.includes('when')) lines.push(fest.starts_on ? `${fest.name} ${fest.status === 'past' ? 'ran' : 'runs'} ${fest.starts_on === fest.ends_on || !fest.ends_on ? 'on ' + fmtDay(fest.starts_on, { long: true }) : `from ${fmtDay(fest.starts_on, { long: true })} to ${fmtDay(fest.ends_on, { long: true })}`} (${FEST_STATUS[fest.status]}).` : `No dates are published for ${fest.name} yet.`);
    if (aspects.includes('where')) lines.push(fest.venue ? `${fest.name} ${fest.status === 'past' ? 'was held' : 'is'} at ${fest.venue}.` : `No venue is published for ${fest.name} yet.`);
    return reply('fest', took + lines.join('\n'), [src], { focus, suggestions: [`What events are in ${fest.name}?`] });
  }
  const f = q.filters || {};
  const list = eventsReply({ filters: { ...f, festId: fest.id }, scope: { type: 'fest', name: fest.name }, dropped: q.dropped, label: q.label }, data, now);
  if (list.intent === 'event') return { ...list, message: took + list.message };                // "the next event in <fest>"
  if (q.events) return { ...list, intent: 'fest', message: took + list.message, sources: [...list.sources, src], focus, suggestions: [`When is ${fest.name}?`, "What's open for registration?"] };
  const head = `${fest.name}${fest.club_name ? ` — ${fest.club_name}` : ''} (${FEST_STATUS[fest.status]}).${fest.description ? '\n' + fest.description : ''}\nDates: ${dates || 'not published yet'}\nVenue: ${fest.venue || 'not published yet'}`;
  return { ...list, intent: 'fest', message: `${took}${head}\n${list.total ? list.message : 'No events are published for this fest yet.'}`, sources: [src, ...list.sources], focus, suggestions: ["What's open for registration?", 'When is the next event?'] };
}
function festsReply(q, data, now) {
  const c = clock(now), all = data.fests();
  const rank = { live: 0, upcoming: 1, past: 2 };
  let list = q.status ? all.filter((f) => f.status === q.status) : q.range ? all : all.filter((f) => f.status !== 'past');
  if (q.range) list = list.filter((f) => f.starts_on && f.starts_on <= q.range.to && (f.ends_on || f.starts_on) >= q.range.from);
  list = [...list].sort((a, b) => rank[a.status] - rank[b.status] || String(a.starts_on).localeCompare(String(b.starts_on)) * (a.status === 'past' ? -1 : 1));
  const line = (f) => `• ${f.name} — ${[fmtRange(f.starts_on, f.ends_on, c), f.venue, f.club_name, plural(f.event_count, 'event'), FEST_STATUS[f.status]].filter(Boolean).join(' · ')}`;
  if (!list.length) {
    const past = all.filter((f) => f.status === 'past').length;
    return reply('fests', !all.length ? 'There are no published fests yet.' : `I couldn't find any ${q.status ? FEST_STATUS[q.status].replace(' now', '') + ' ' : ''}fests${q.range ? ' ' + q.range.label : ''} in the club's event data.${!q.status && !q.range && past ? ` ${plural(past, 'past fest')} ${past === 1 ? 'is' : 'are'} on record.` : ''}`, [page('Browse clubs', '/clubs')], { total: 0 });
  }
  const shown = list.slice(0, LIST_CAP), n = list.length;
  const lead = q.which ? 'Which fest do you mean? These are live or coming up:' : q.status ? `${plural(n, FEST_STATUS[q.status].replace(' now', '') + ' fest')}${q.range ? ' ' + q.range.label : ''}:` : q.range ? `${plural(n, 'fest')} ${q.range.label}:` : `${plural(n, 'fest')} ${n === 1 ? 'is' : 'are'} live or coming up${n > shown.length ? `. The first ${shown.length}:` : ':'}`;
  return reply('fests', `${lead}\n${shown.map(line).join('\n')}${n > shown.length ? `\n…and ${n - shown.length} more.` : ''}`, [...shown.map(festSource), page('Browse clubs', '/clubs')], { total: n, suggestions: [`What events are in ${shown[0].name}?`, "What's open for registration?"] });
}
function clubReply(club, q, data, now) {
  const f = q.filters || {}, filtered = !!q.filtered;
  const list = eventsReply({ filters: { ...f, clubId: club.id, upcoming: f.upcoming || !filtered }, scope: { type: 'club', name: club.name }, lead: filtered ? null : 'Coming up:', dropped: q.dropped, label: q.label }, data, now);
  const fests = data.fests().filter((x) => x.club_id === club.id), took = tookLine(q.took);
  const pick = fests.find((x) => x.status === 'live') || fests.find((x) => x.status === 'upcoming') || fests[0];
  if (list.intent === 'event') return { ...list, message: took + list.message };
  const head = `${club.name}${club.description ? `: ${club.description}` : '.'}\nIt has ${plural(fests.length, 'fest')} and ${plural(club.event_count, 'event')} published.`;
  return { ...list, intent: 'club', message: took + (filtered ? list.message : `${head}\n${list.total ? list.message : 'It has no upcoming events right now.'}`), sources: [clubSource(club), ...fests.slice(0, 3).map(festSource), ...list.sources.filter((s) => s.type === 'event')],
    suggestions: pick ? [`What events are in ${pick.name}?`, "What's open for registration?"] : ["What's open for registration?"] };
}
function clubsReply(data) {
  const clubs = data.clubs();
  if (!clubs.length) return reply('clubs', 'There are no clubs published yet.', [], { total: 0 });
  return reply('clubs', `${plural(clubs.length, 'club')} ${clubs.length === 1 ? 'is' : 'are'} on the platform:\n${clubs.map((x) => `• ${x.name} — ${plural(x.event_count, 'event')}`).join('\n')}`, [...clubs.slice(0, LIST_CAP).map(clubSource), page('All clubs', '/clubs')],
    { total: clubs.length, suggestions: [`What does ${clubs[0].name} do?`, "What's open for registration?"] });
}
const matchesReply = (items) => reply('matches', `More than one thing in the club's data matches that:\n${items.slice(0, LIST_CAP).map((e) => `• ${e.name} (${e.type})`).join('\n')}\nWhich one do you mean?`,
  items.slice(0, LIST_CAP).map(recordSource), { suggestions: items.slice(0, 2).map((e) => `Tell me about ${e.name}`) });
function notFoundReply(q) {
  const name = q.label ? `"${q.label}"` : 'that';
  const whole = (q.closest || []).filter((e) => e.whole), closest = whole.length === 1 ? whole : q.closest || [];   // every word of one name is there, give or take a typo
  const guess = whole.length === 1 ? `\nDid you mean ${closest[0].name} (${closest[0].type})?` : closest.length ? `\nThe closest names I do have:\n${closest.map((e) => `• ${e.name} (${e.type})`).join('\n')}` : '';
  return reply('not_found', `I couldn't find anything about ${name} in the club's event data, so I can't tell you about it.${guess}`, [...closest.map(recordSource), page('Browse all events', '/events')],
    { suggestions: closest.length ? closest.slice(0, 2).map((e) => `Tell me about ${e.name}`) : ["What's open for registration?", 'Show me upcoming events'] });
}

const REFUSAL = "I can't help with that. I only answer from the club's public event information, so participant details, organizer access and anything internal are off limits.\nI can tell you about events, fests, dates, venues, seats and deadlines.";
const HELP_TEXT = "I'm Tech Guide, the club's event assistant. I answer from the live event data: what's open for registration, what's on this week, when and where an event is, seats left, deadlines, rules, which events are in a fest, and how to register or volunteer.";

function execute(q, data, now) {
  const event = (id) => data.events().find((e) => e.id === id), fest = (id) => data.fests().find((f) => f.id === id), club = (id) => data.clubs().find((x) => x.id === id);
  switch (q.kind) {
    case 'refuse': return reply('refused', REFUSAL, [], { suggestions: STARTERS.slice(0, 2) });
    case 'privacy': return reply('how_to', 'What you enter when you register (name, email and your answers) can only be read in the organizer area, which needs the organizer key. The public pages and this assistant never show who registered or anything they entered.', [], { suggestions: ['How do I register?'] });
    case 'readonly': {
      const e = q.eventId && event(q.eventId);
      if (q.register) return reply('read_only', `I can't register for you: I can only look things up.${!e ? ' Open an event from the Events page and press Register.' : e.registration_state === 'open' ? ` To join ${e.title}, open its page and press Register. ${registrationLine(e)}` : ` ${registrationLine(e, true)}`}`, e ? [eventSource(e)] : [page('Browse events', '/events')], e ? { focus: { event: e.id } } : {});
      return reply('read_only', "I can't change anything: I can only look things up. To view or cancel your own registration, use My registrations. Organizers manage events and fests from the organizer area.", [page('My registrations', '/my-registrations')]);
    }
    case 'help': case 'greeting': return reply('help', (q.kind === 'greeting' ? 'Hi! ' : '') + HELP_TEXT, [], { suggestions: STARTERS });
    case 'thanks': return reply('help', "You're welcome. Ask me anything else about the club's events.", [], { suggestions: STARTERS.slice(0, 2) });
    case 'volunteer': return reply('volunteer', `You can apply to volunteer with the club in one of these areas: ${DOMAINS.join(', ')}. The form asks for your name, class, roll, phone, email and why you'd like to help.`, [page('Volunteer form', '/volunteer')]);
    case 'howto_register': return reply('how_to', `${q.account ? 'No account or password is needed. ' : ''}To register: open an event, press Register, and fill in your name, email and the event's own questions. Some events confirm you straight away; others need an organizer to approve you first. Once confirmed you get a QR pass for the entrance.`, [page('Browse events', '/events'), page('My registrations', '/my-registrations')], { suggestions: ["What's open for registration?"] });
    case 'howto_pass': return reply('how_to', 'Your registrations, their status and your QR passes are on the My registrations page of the device you registered from. You can also cancel a registration there before the event starts. I can\'t look up individual registrations.', [page('My registrations', '/my-registrations')]);
    case 'missing': return reply('not_in_data', `${NOT_IN_DATA} It doesn't record ${q.missing}. It does have each event's date, venue, seats, deadline and rules.`, [page('Browse all events', '/events')], { suggestions: STARTERS.slice(0, 2) });
    case 'time_unclear': return reply('unclear', `I couldn't work out the dates in that question, so I haven't guessed. ${TIME_HELP}`, [page('Browse all events', '/events')], { suggestions: ["What's happening this week?", 'Show me upcoming events'] });
    case 'event': { const e = event(q.id); return e ? eventReply(e, q) : null; }
    case 'fest': { const f = fest(q.id); return f ? festReply(f, q, data, now) : null; }
    case 'club': { const x = club(q.id); return x ? clubReply(x, q, data, now) : null; }
    case 'fests': return festsReply(q, data, now);
    case 'clubs': return clubsReply(data);
    case 'matches': return matchesReply(q.items);
    case 'not_found': return notFoundReply(q);
    case 'events': return eventsReply(q, data, now);
    default: return null;
  }
}
// What to say when nothing above produced an answer.
function fallback(ai) {
  const note = ai === 'unavailable' || ai === 'off' ? "\nAI help with free-form wording isn't available right now, so I work from the question types below." : '';
  return reply('unknown', `I couldn't work out an answer to that from the club's event data. I can help with events, fests, clubs, dates, venues, seats, deadlines and how to register.${note}`, [page('Browse all events', '/events')], { suggestions: STARTERS });
}

// One call for the service: the deterministic answer, plus `miss` when the rules could not understand the question
// ('unknown') or found nothing under the words used ('not_found'). Those are the only two cases the AI helper is asked about.
function answer(text, data, now, ctx) {
  let q = interpret(text, data, now, ctx), out = execute(q, data, now);
  if (!out && q.kind === 'events' && q.subject) { q = { kind: 'not_found', label: q.label, subject: q.subject, closest: closestNames(buildIndex(data), q.subject, ['event', 'fest', 'club']) }; out = execute(q, data, now); }
  return { reply: out, miss: !out || q.kind === 'unknown' ? 'unknown' : q.kind === 'not_found' ? 'not_found' : null, label: q.label || '' };
}

// ---- optional AI helper ---------------------------------------------------------------------
// The model never writes the answer. It may only fill in this closed query, and every value is checked here against
// the real public catalogue: an unknown kind, state, date word, category, name or search word is dropped, never trusted.
// So the only words of the model's that can reach a visitor are ones already published on the site.
const MODEL_KINDS = ['events', 'event', 'fest', 'fests', 'club', 'clubs', 'register_help', 'pass_help', 'volunteer', 'help', 'none'];
const MODEL_WHEN = new Map(Object.entries({ today: 'today', tomorrow: 'tomorrow', this_week: 'this week', next_week: 'next week', weekend: 'this weekend', this_month: 'this month', next_month: 'next month' }));
const vocabulary = (data) => ({ events: data.events().map((e) => e.title), fests: data.fests().map((f) => f.name), clubs: data.clubs().map((c) => c.name), categories: [...new Set(data.events().map((e) => e.category).filter(Boolean))] });
function fromModel(m, data, now, { related = false, label = '' } = {}) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.kind !== 'string' || !MODEL_KINDS.includes(m.kind) || m.kind === 'none') return null;
  const same = (a, b) => typeof a === 'string' && norm(a) === norm(b), all = data.events();
  const event = all.find((e) => same(m.event, e.title)), fest = data.fests().find((f) => same(m.fest, f.name)), club = data.clubs().find((c) => same(m.club, c.name));
  const aspects = (Array.isArray(m.aspects) ? m.aspects : []).filter((a) => typeof a === 'string' && ASPECTS.some(([k]) => k === a));
  const category = [...new Set(all.map((e) => e.category))].find((c) => c && same(m.category, c)) || null;
  const terms = [...new Set((Array.isArray(m.keywords) ? m.keywords : []).filter((k) => typeof k === 'string' && /^[\p{L}\p{N}]{2,30}$/u.test(k)).map((k) => stem(norm(k))).filter((k) => termMatcher(k, all)))].slice(0, 3);
  const time = typeof m.when === 'string' && MODEL_WHEN.has(m.when) ? parseTime(MODEL_WHEN.get(m.when), now) : { range: null };
  const filters = { state: ['open', 'full', 'closed'].includes(m.state) ? m.state : null, range: time.range, upcoming: m.when === 'upcoming', past: m.when === 'past', category, terms: category ? [] : terms };
  let q;
  if (related) {                                               // the rules found nothing by name: only ever offer a list of related real events
    if (event) q = { kind: 'events', filters: { ids: [event.id] } };
    else if (fest) q = { kind: 'events', filters: { festId: fest.id }, scope: { type: 'fest', name: fest.name } };
    else if (category || terms.length) q = { kind: 'events', filters };
    else return null;
    q.lead = `Nothing in the club's event data is called ${label ? `"${label}"` : 'that'}, but these real events look related:`;
  } else if (m.kind === 'event') q = event ? { kind: 'event', id: event.id, aspects } : null;
  else if (m.kind === 'fest') q = fest ? { kind: 'fest', id: fest.id, aspects, events: !aspects.length, filters } : null;
  else if (m.kind === 'club') q = club ? { kind: 'club', id: club.id, filters, filtered: !!(filters.state || filters.range || filters.past || terms.length) } : null;
  else if (m.kind === 'events') q = { kind: 'events', filters, ...(fest ? { filters: { ...filters, festId: fest.id }, scope: { type: 'fest', name: fest.name } } : club ? { filters: { ...filters, clubId: club.id }, scope: { type: 'club', name: club.name } } : {}) };
  else q = { kind: { register_help: 'howto_register', pass_help: 'howto_pass' }[m.kind] || m.kind };
  const out = q && execute(q, data, now);
  return out && (!related || out.total > 0) ? out : null;
}

// Suggested first questions, built from what is actually published so every one of them has an answer.
function starters(data, now) {
  const all = data.events(), events = all.filter((e) => !e.ended), fests = data.fests();
  const fest = fests.find((f) => f.status === 'live' && f.event_count) || fests.filter((f) => f.status === 'upcoming' && f.event_count).sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)))[0];
  const open = events.find((e) => e.registration_state === 'open'), category = open && open.category && stems(open.category).length === 1 ? open.category : null;
  const offered = ["What's open for registration?", "What's happening this week?", fest && `Which events are in ${fest.name}?`, open && `When is ${open.title}?`, category && `Find ${category} events`, 'How do I register?'].filter(Boolean);
  // Belt and braces: a suggestion is only shown if the assistant itself can answer it right now.
  return offered.filter((q) => { const r = answer(q, data, now).reply; return r && !['unknown', 'not_found', 'refused', 'matches', 'unclear'].includes(r.intent); }).slice(0, 6);
}

module.exports = { parseRequest, answer, interpret, execute, fallback, fromModel, vocabulary, starters, MAX_MESSAGE, norm };
