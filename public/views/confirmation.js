// Registration confirmation: status, event summary and (once confirmed) the QR pass.
import { api, toast } from '../api.js';
import { $, esc, fmt, crumbs, store } from '../ui.js';

const COPY = {
  CONFIRMED: ['You’re registered', 'Your pass is ready. Show the QR code at the gate.'],
  PENDING: ['Request received', 'An organizer will review your registration. Your QR pass appears here and under “My registrations” once it is confirmed.'],
  REJECTED: ['Registration not approved', 'The organizers could not approve this registration. You can look for other events.'],
  CANCELLED: ['Registration cancelled', 'This registration was cancelled and the seat was released.'],
};
export async function confirmed({ view, params }) {
  const r = await api('/registrations/' + params[0]), [title, text] = COPY[r.status] || COPY.PENDING, ok = r.status === 'CONFIRMED';
  store.add(params[0], r.title);   // make sure this device remembers it
  const step = (done, label) => `<li class="${done ? 'done' : ''}"><span aria-hidden="true">${done ? '✓' : '·'}</span>${label}</li>`;
  view.innerHTML = `${crumbs([['Directory', '#/'], ['Event', '#/event/' + r.event_id], ['Confirmation']])}
    <section class="glass confirm"><div class="confirm-head ${ok ? 'ok' : r.status === 'PENDING' ? 'wait' : 'no'}"><h1>${title}</h1><p>${text}</p><span class="badge ${r.status}">${r.status}</span></div>
      <ol class="steps" aria-label="Progress">${step(1, 'Fest selected')}${step(1, 'Event chosen')}${step(1, 'Form submitted')}${step(ok, ok ? 'Pass issued' : 'Awaiting pass')}</ol>
      <div class="confirm-body"><div><h2>${esc(r.title)}</h2><dl class="reginfo"><div><dt>Date &amp; time</dt><dd>${fmt(r.starts_at)}</dd></div><div><dt>Venue</dt><dd>${esc(r.venue)}</dd></div>
        <div><dt>Name</dt><dd>${esc(r.name)}</dd></div><div><dt>Email</dt><dd>${esc(r.email)}</dd></div></dl></div>
        ${r.pass_token ? `<div class="pass-box"><div class="qr big">${window.QR.svg(r.pass_token)}</div><p class="mute small">One scan only</p><details><summary class="mute small">Can’t scan? Use the code</summary><p><code>${esc(r.pass_token)}</code></p><button class="btn" id="copy">Copy code</button></details></div>` : ''}</div>
      <div class="actions"><a class="btn primary" href="#/mine">My registrations</a><a class="btn" href="#/fest/${r.fest_id}">Back to fest</a><a class="btn ghost" href="#/">Browse more events</a></div></section>`;
  const c = $('#copy'); if (c) c.onclick = () => navigator.clipboard.writeText(r.pass_token).then(() => toast('Code copied', 'success'), () => toast('Copy failed. Select the code manually.', 'warn'));
}
