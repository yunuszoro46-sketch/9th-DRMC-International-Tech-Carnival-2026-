import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import { ACTIONS } from "../../lib/registrationAdmin.js";
import Modal from "../common/Modal.jsx";
import Button from "../common/Button.jsx";
import Icon from "../common/Icon.jsx";
import { useToast } from "../common/Toast.jsx";

const send = (action, reg) => (action === "checkin" ? api.admin.checkInRegistration(reg.id) : api.admin.setStatus(reg.id, ACTIONS[action].to));
// The server refused because the registration (or its seat) changed underneath us: the screen is stale and must re-read.
const isStale = (e) => [403, 404, 409].includes(e?.status);

// One place for every organizer action on a registration. Nothing is changed locally: the server is asked, and
// `onSettled(reg)` then tells the page to re-read (after success, and after a refusal that means our copy was stale).
// Actions with a `confirm` block open a confirmation dialog first; `busyId` is the registration being changed.
export function useRegistrationActions({ onSettled }) {
  const toast = useToast();
  const [request, setRequest] = useState(null);            // { action, reg } waiting for confirmation
  const [busyId, setBusyId] = useState(null), [error, setError] = useState(null);
  const alive = useRef(true), dismissed = useRef(false), settled = useRef(onSettled); settled.current = onSettled;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const execute = useCallback(async (action, reg, { inDialog = false } = {}) => {
    if (busyId != null) return;
    setBusyId(reg.id); setError(null);
    try {
      await send(action, reg);
      toast.success(ACTIONS[action].done);
      if (alive.current) setRequest(null);
      settled.current?.(reg);
    } catch (e) {
      if (e?.status !== 401) {                             // 401: the layout is already sending the organizer to sign in
        // Esc can close the native dialog while the request is still running; then the answer goes to a toast instead.
        if (inDialog && alive.current && !dismissed.current) setError(e); else toast.error(e?.message || "That didn't work. Please try again.");
        if (isStale(e)) settled.current?.(reg);
      }
    } finally {
      if (alive.current) { setBusyId(null); if (dismissed.current) setRequest(null); }
      dismissed.current = false;
    }
  }, [busyId, toast]);

  const start = useCallback((action, reg) => {
    if (ACTIONS[action].confirm) { setError(null); setRequest({ action, reg }); } else execute(action, reg);
  }, [execute]);

  const c = request ? ACTIONS[request.action].confirm : null, busy = busyId != null;
  const close = () => { if (busy) dismissed.current = true; else setRequest(null); };
  const dialog = (
    <Modal open={!!request} onClose={close} title={c ? c.title : "Confirm"}
      footer={request && <><Button variant="secondary" onClick={close} disabled={busy}>Keep as it is</Button>
        <Button variant={ACTIONS[request.action].variant === "danger" ? "danger" : "primary"} onClick={() => execute(request.action, request.reg, { inDialog: true })} disabled={busy}>{busy ? c.busy : c.yes}</Button></>}>
      {request && <>
        <p><strong>{request.reg.name}</strong> · {request.reg.event_title}</p>
        <p className="flush">{c.body}</p>
        {error && <div className="alert alert-bad spaced-top" role="alert"><Icon name="alert" /><div>{error.message}{isStale(error) ? " The details behind this dialog have been refreshed." : ""}</div></div>}
      </>}
    </Modal>
  );
  return { start, busyId, dialog };
}
