const { route, json, paging } = require('../router');
const id = (m) => Number(m[1]);
const intParam = (url, k) => { const n = parseInt(url.searchParams.get(k), 10); return Number.isNaN(n) ? null : n; };

module.exports = (svc) => [
  route('GET', /^\/api\/health$/, () => ({ ok: true })),
  route('GET', /^\/api\/clubs$/, () => svc.listClubs()),
  route('GET', /^\/api\/clubs\/(\d+)$/, ({ m }) => svc.getClub(id(m))),
  route('GET', /^\/api\/fests$/, ({ url }) => svc.listFests(intParam(url, 'club'))),
  route('GET', /^\/api\/fests\/(\d+)$/, ({ m }) => svc.getFest(id(m))),
  route('GET', /^\/api\/events$/, ({ url }) => {
    const s = url.searchParams, [limit, offset] = paging(url, 100, 200);
    return svc.listEvents({ q: s.get('q'), category: s.get('category'), fest: intParam(url, 'fest'), club: intParam(url, 'club'), limit, offset });
  }),
  route('GET', /^\/api\/events\/(\d+)$/, ({ m }) => svc.getEvent(id(m))),
  route('POST', /^\/api\/events\/(\d+)\/register$/, ({ m, body }) => json(svc.register(id(m), body), 201)),
  route('POST', /^\/api\/volunteers$/, ({ body }) => json(svc.applyVolunteer(body), 201)),
  route('GET', /^\/api\/assistant$/, () => svc.assistantStarters()),
  route('POST', /^\/api\/assistant$/, ({ body }) => svc.assistantAsk(body), { limit: 'assistant' }),   // read-only; own rate-limit bucket
  route('GET', /^\/api\/registrations\/([\w-]+)$/, ({ m }) => svc.getRegistration(m[1])),
  route('POST', /^\/api\/registrations\/([\w-]+)\/cancel$/, ({ m }) => svc.cancelRegistration(m[1])),
];
