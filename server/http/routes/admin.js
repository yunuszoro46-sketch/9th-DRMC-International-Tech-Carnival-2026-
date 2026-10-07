// Organizer endpoints. The router enforces the key + rate limits before any handler runs.
const { route, json, csvFile, paging } = require('../router');
const A = { admin: true };
const id = (m) => +m[1];
const intParam = (url, k) => { const n = parseInt(url.searchParams.get(k), 10); return Number.isNaN(n) ? null : n; };

module.exports = (svc) => [
  route('GET', /^\/api\/admin\/stats$/, () => svc.stats(), A),

  // fests
  route('GET', /^\/api\/admin\/fests$/, () => svc.adminListFests(), A),
  route('POST', /^\/api\/admin\/fests$/, ({ body }) => json(svc.createFest(body), 201), A),
  route('GET', /^\/api\/admin\/fests\/(\d+)$/, ({ m }) => svc.adminGetFest(id(m)), A),
  route('PATCH', /^\/api\/admin\/fests\/(\d+)$/, ({ m, body }) => svc.updateFest(id(m), body), A),
  route('DELETE', /^\/api\/admin\/fests\/(\d+)$/, ({ m }) => svc.deleteFest(id(m)), A),
  route('POST', /^\/api\/admin\/fests\/(\d+)\/archive$/, ({ m }) => svc.setFestArchived(id(m), true), A),
  route('POST', /^\/api\/admin\/fests\/(\d+)\/restore$/, ({ m }) => svc.setFestArchived(id(m), false), A),

  // events
  route('GET', /^\/api\/admin\/events$/, ({ url }) => {
    const [limit, offset] = paging(url, 200, 500);
    return svc.adminListEvents({ q: url.searchParams.get('q'), fest: intParam(url, 'fest'), club: intParam(url, 'club'), limit, offset });
  }, A),
  route('POST', /^\/api\/admin\/events$/, ({ body }) => json(svc.createEvent(body), 201), A),
  route('GET', /^\/api\/admin\/events\/(\d+)$/, ({ m }) => svc.adminGetEvent(id(m)), A),
  route('PATCH', /^\/api\/admin\/events\/(\d+)$/, ({ m, body }) => svc.updateEvent(id(m), body), A),
  route('DELETE', /^\/api\/admin\/events\/(\d+)$/, ({ m }) => svc.deleteEvent(id(m)), A),
  route('POST', /^\/api\/admin\/events\/(\d+)\/archive$/, ({ m }) => svc.setEventArchived(id(m), true), A),
  route('POST', /^\/api\/admin\/events\/(\d+)\/restore$/, ({ m }) => svc.setEventArchived(id(m), false), A),
  route('GET', /^\/api\/admin\/events\/(\d+)\/export\.csv$/, ({ m }) => csvFile(svc.exportCsv(id(m))), A),
  // kept for the classic UI: a plain array of one event's registrations
  route('GET', /^\/api\/admin\/events\/(\d+)\/registrations$/, ({ m, url }) => {
    const s = url.searchParams, [limit, offset] = paging(url, 500, 1000);
    return svc.listRegistrations({ eventId: id(m), status: s.get('status') || null, q: s.get('q'), limit, offset }).items;
  }, A),

  // registrations (any combination of event / fest / status / search, paged with a total)
  route('GET', /^\/api\/admin\/registrations$/, ({ url }) => {
    const s = url.searchParams, [limit, offset] = paging(url, 25, 200);
    return svc.listRegistrations({ eventId: intParam(url, 'event'), festId: intParam(url, 'fest'), status: s.get('status') || null, q: s.get('q'), limit, offset });
  }, A),
  route('PATCH', /^\/api\/admin\/registrations\/(\d+)$/, ({ m, body }) => svc.setRegistrationStatus(id(m), body.status), A),
  route('POST', /^\/api\/admin\/registrations\/(\d+)\/check-in$/, ({ m }) => svc.checkInRegistration(id(m)), A),

  route('POST', /^\/api\/admin\/checkin$/, ({ body }) => svc.checkIn(body.token, { eventId: body.event_id ? Number(body.event_id) : undefined }), A),
  route('GET', /^\/api\/admin\/volunteers$/, () => svc.listVolunteers(), A),
];
