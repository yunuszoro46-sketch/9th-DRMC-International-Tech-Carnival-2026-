// Event page: description, date & time, venue, registration information and the registration form.
import { api, toast } from '../api.js';
import { $, esc, fmt, hydrate, crumbs, pctOf, tone, evLabel, store, ic } from '../ui.js';

const until = (iso) => { const ms = new Date(iso) - Date.now(), d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5); return ms <= 0 ? 'closed' : d >= 1 ? `in ${d} day${d === 1 ? '' : 's'}` : `in ${h}h`; };

export async function eventPage({ view, params }) {
  const e = await api('/events/' + params[0]), pct = pctOf(e.taken, e.capacity), t = tone(pct, e.closed);
  const field = (f) => `<label for="a_${esc(f.key)}">${esc(f.label)}${f.required ? ' *' : ''}</label>${f.type === 'select'
    ? `<select id="a_${esc(f.key)}" name="a_${esc(f.key)}" ${f.required ? 'required' : ''}><option value="">Choose…</option>${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
    : `<input id="a_${esc(f.key)}" name="a_${esc(f.key)}" ${f.required ? 'required' : ''}>`}`;
  const info = (k, v) => `<div class="tile"><span class="mute small">${k}</span><b>${v}</b></div>`;
  view.innerHTML = `${crumbs([['Directory', '#/'], [e.club_name || 'Club', '#/'], [e.fest_name, '#/fest/' + e.fest_id], [e.title]])}
    <div class="event-layout"><div class="event-main">
      <section class="page-head glass"><span class="chip">${esc(e.category)}</span><h1>${esc(e.title)}</h1>
        <div class="facts"><span class="badge ${e.closed ? 'bad' : t}">${esc(evLabel(e))}</span><span>${esc(e.club_name || '')} · ${esc(e.fest_name)}</span></div></section>
      <section class="glass panel"><h2>Event description</h2><p class="body-text">${esc(e.description)}</p></section>
      <section class="tiles"><div class="tile glass">${info(ic('cal') + 'Date &amp; time', fmt(e.starts_at))}</div><div class="tile glass">${info(ic('pin') + 'Venue', esc(e.venue))}</div></section>
      <section class="glass panel"><h2>Registration information</h2>
        <dl class="reginfo"><div><dt>Status</dt><dd><span class="badge ${e.closed ? 'bad' : t}">${e.deadline_passed ? 'Registration closed' : e.full ? 'Event full' : 'Open'}</span></dd></div>
          <div><dt>Deadline</dt><dd>${fmt(e.deadline)} <span class="mute small">(${until(e.deadline)})</span></dd></div>
          <div><dt>Confirmation</dt><dd>${e.auto_confirm ? 'Instant. Your QR pass is issued right away.' : 'An organizer reviews each request before your pass is issued.'}</dd></div>
          <div><dt>Seats</dt><dd>${e.taken} of ${e.capacity} taken · <b>${e.remaining} left</b></dd></div></dl>
        <div class="meter"><i class="${t}" data-meter="${pct}"></i></div></section>
    </div><aside class="event-side"><section class="glass panel sticky"><h2>Registration form</h2>
      ${e.closed ? `<p class="err">${e.deadline_passed ? 'Registration for this event has closed.' : 'This event is full.'}</p><div class="actions"><a class="btn" href="#/fest/${e.fest_id}">See other events in ${esc(e.fest_name)}</a></div>`
        : `<form id="rf" novalidate><label for="rn">Full name *</label><input id="rn" name="name" required autocomplete="name"><label for="re">Email *</label><input id="re" name="email" type="email" required autocomplete="email">
        ${e.form_schema.map(field).join('')}<p class="err" id="err" role="alert"></p><div class="actions"><button class="btn primary block" id="go">Submit registration</button></div></form>`}
    </section></aside></div>`;
  hydrate(view);
  const f = $('#rf'); if (!f) return;
  f.onsubmit = async (ev) => {
    ev.preventDefault(); const d = new FormData(f), answers = {}, go = $('#go'); $('#err').textContent = '';
    if (!f.checkValidity()) { f.reportValidity(); return; }
    e.form_schema.forEach((s) => { answers[s.key] = d.get('a_' + s.key); });
    go.disabled = true; go.textContent = 'Submitting…';
    try {
      const r = await api(`/events/${e.id}/register`, { method: 'POST', body: { name: d.get('name'), email: d.get('email'), answers } });
      store.add(r.manage_token, e.title); toast(r.status === 'CONFIRMED' ? 'Registered! Your pass is ready.' : 'Request sent. Awaiting approval.', 'success');
      location.hash = '#/confirmed/' + r.manage_token;
    } catch (x) { $('#err').textContent = x.message; toast(x.message, 'error'); go.disabled = false; go.textContent = 'Submit registration'; }
  };
}
