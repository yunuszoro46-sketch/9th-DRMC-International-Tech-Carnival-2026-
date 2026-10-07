// Participant ticket passes (capability tokens kept on this device) with a QR overlay modal.
import { api, toast } from '../api.js';
import { $$, esc, fmt, openModal, confirmDialog, store, ic } from '../ui.js';

export async function myRegistrations({ view }) {
  const saved = store.get();
  const res = await Promise.allSettled(saved.map(async (m) => ({ ...(await api('/registrations/' + m.token)), token: m.token })));
  res.forEach((r, i) => { if (r.status === 'rejected' && r.reason.status === 404) store.remove(saved[i].token); });   // forget tokens the server no longer knows
  const regs = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (res.some((r) => r.status === 'rejected' && r.reason.network)) toast('Some registrations could not be loaded (offline?).', 'warn');

  const ticket = (r) => {
    const used = r.pass_status === 'CHECKED_IN', stub = r.pass_token
      ? `<button class="qr" data-pass="${esc(r.token)}" aria-label="Enlarge pass QR code for ${esc(r.title)}">${window.QR.svg(r.pass_token)}</button>`
      : `<div class="locked">${r.status === 'PENDING' ? 'Pass appears once confirmed' : 'No active pass'}</div>`;
    return `<article class="ticket glass"><div class="ticket-main"><div><span class="badge ${r.status}">${r.status}</span> ${used ? '<span class="badge CHECKED_IN">Checked in</span>' : ''}</div>
      <h3>${esc(r.title)}</h3><div class="mute small">${ic('cal')} ${fmt(r.starts_at)}<br>${ic('pin')} ${esc(r.venue)}<br>${ic('user')} ${esc(r.name)}</div>
      <div class="actions">${r.pass_token ? `<button class="btn" data-pass="${esc(r.token)}">Show pass</button>` : ''}${r.status !== 'CANCELLED' && !used ? `<button class="btn ghost" data-cancel="${esc(r.token)}">Cancel</button>` : ''}</div></div>
      <div class="ticket-stub">${stub}</div></article>`;
  };
  view.innerHTML = `<div class="dash-head"><div><h1>My registrations</h1><p class="mute">Saved on this device. Open the same browser to see them again.</p></div><a class="btn primary" href="#/">Find events</a></div>
    <div class="tickets">${regs.map(ticket).join('') || '<div class="empty glass"><b>No registrations yet</b> Register for an event first.</div>'}</div>`;

  view.onclick = async (e) => {
    const p = e.target.closest('[data-pass]'), c = e.target.closest('[data-cancel]');
    if (p) {
      const r = regs.find((x) => x.token === p.dataset.pass);
      openModal(`<div class="modal center"><button class="icon-btn" data-close aria-label="Close">✕</button><h2>${esc(r.title)}</h2><p class="mute small">${fmt(r.starts_at)} · ${esc(r.venue)}</p>
        <div class="qr big">${window.QR.svg(r.pass_token)}</div><p class="mute small">Show this at the gate. One scan only.</p>
        <details><summary class="mute small">Can’t scan? Use the code</summary><p><code>${esc(r.pass_token)}</code></p><button class="btn" id="copy">Copy code</button></details></div>`);
      const copy = document.getElementById('copy');
      if (copy) copy.onclick = () => navigator.clipboard.writeText(r.pass_token).then(() => toast('Code copied', 'success'), () => toast('Copy failed. Select the code manually.', 'warn'));
    }
    if (c && await confirmDialog('Cancel this registration? Your seat will be released.', 'Cancel registration')) {
      try { await api(`/registrations/${c.dataset.cancel}/cancel`, { method: 'POST' }); toast('Registration cancelled', 'success'); myRegistrations({ view }); }
      catch (x) { toast(x.message, 'error'); }
    }
  };
}
