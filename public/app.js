// View router + app initialisation.
import { toast } from './api.js';
import { $$, esc, closeModal } from './ui.js';
import { directory } from './views/directory.js';
import { fest } from './views/fest.js';
import { eventPage } from './views/event.js';
import { confirmed } from './views/confirmation.js';
import { myRegistrations } from './views/my-registrations.js';
import { organizer } from './views/organizer.js';

const view = document.getElementById('view');
const routes = { home: directory, fest, event: eventPage, confirmed, mine: myRegistrations, organizer };
const PATHS = [[/^#\/fest\/(\d+)/, 'fest'], [/^#\/event\/(\d+)/, 'event'], [/^#\/confirmed\/([\w-]+)/, 'confirmed'], [/^#\/mine/, 'mine'], [/^#\/organizer/, 'organizer']];
let nav = 0, cleanups = [], booted = false;

async function route() {
  closeModal();                                                                       // never leave an overlay open across views
  cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } });                  // stop timers/cameras of the previous view
  const id = ++nav, mine = (cleanups = []);
  const hit = PATHS.map(([re, name]) => [location.hash.match(re), name]).find(([m]) => m), r = hit ? hit[1] : 'home', params = hit ? hit[0].slice(1) : [];
  $$('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === (r === 'mine' || r === 'organizer' ? r : 'home')));
  view.classList.remove('enter');
  try { await routes[r]({ view, params, onCleanup: (f) => (id === nav ? mine.push(f) : f()) }); }
  catch (e) { if (id === nav) { view.innerHTML = `<div class="empty glass"><b>Something went wrong</b>${esc(e.message)}<div class="actions"><button class="btn primary" id="retry">Try again</button></div></div>`; document.getElementById('retry').onclick = route; toast(e.message, 'error'); } }
  if (id !== nav) return;
  void view.offsetWidth; view.classList.add('enter');
  if (booted) { window.scrollTo({ top: 0 }); view.focus({ preventScroll: true }); }
  booted = true;
}

addEventListener('hashchange', route);
addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.name === 'AbortError') return; e.preventDefault(); toast((e.reason && e.reason.message) || 'Something went wrong', 'error'); });
addEventListener('offline', () => toast('You are offline. Changes will not save.', 'warn'));
addEventListener('online', () => toast('Back online', 'success'));
route();
