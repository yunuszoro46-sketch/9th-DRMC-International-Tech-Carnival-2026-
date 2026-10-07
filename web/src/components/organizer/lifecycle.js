// What each lifecycle action says and calls. The rules themselves live in the backend (services/club.js):
//   archive / restore: always allowed for an existing record;  delete: refused with 409 while anything would be lost
//   (an event with any registration, a fest with any event) and the server's reason is shown as-is.
import { api } from "../../lib/api.js";

export const eventActions = (e) => ({
  archive: { title: "Archive this event?", subject: e.title, yes: "Archive event", busyText: "Archiving…", done: "Event archived.",
    body: "It disappears from the public site and nobody new can register. Its registrations and passes are kept, and you can restore it at any time.",
    run: () => api.admin.archiveEvent(e.id) },
  restore: { title: "Restore this event?", subject: e.title, yes: "Restore event", busyText: "Restoring…", done: "Event restored.",
    body: "It returns to the public site. Whether people can register again depends on its deadline and seats, as before.",
    run: () => api.admin.restoreEvent(e.id) },
  remove: { title: "Delete this event?", subject: e.title, yes: "Delete permanently", busyText: "Deleting…", done: "Event deleted.", danger: true,
    body: "This removes the event completely and can't be undone. An event that has any registration can't be deleted; archive it instead.",
    ack: "I understand this event will be permanently deleted.",
    run: () => api.admin.deleteEvent(e.id) },
});
export const festActions = (f) => ({
  archive: { title: "Archive this fest?", subject: f.name, yes: "Archive fest", busyText: "Archiving…", done: "Fest archived.",
    body: "The fest and all of its events disappear from the public site, and no new events can be added to it. Nothing is deleted, and you can restore it at any time.",
    run: () => api.admin.archiveFest(f.id) },
  restore: { title: "Restore this fest?", subject: f.name, yes: "Restore fest", busyText: "Restoring…", done: "Fest restored.",
    body: "The fest and its events return to the public site. Events that were archived on their own stay archived.",
    run: () => api.admin.restoreFest(f.id) },
  remove: { title: "Delete this fest?", subject: f.name, yes: "Delete permanently", busyText: "Deleting…", done: "Fest deleted.", danger: true,
    body: "This removes the fest completely and can't be undone. A fest that still has events, including archived ones, can't be deleted; archive it instead.",
    ack: "I understand this fest will be permanently deleted.",
    run: () => api.admin.deleteFest(f.id) },
});
