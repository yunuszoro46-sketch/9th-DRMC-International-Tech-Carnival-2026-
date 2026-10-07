import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../common/Modal.jsx";
import Button from "../common/Button.jsx";
import Icon from "../common/Icon.jsx";
import { useToast } from "../common/Toast.jsx";

// Confirmation dialog for organizer lifecycle actions (archive, restore, delete). `ask(request)` opens it:
//   { title, body, yes, busyText, danger?, ack?, run: () => Promise, done: "toast text", onDone?: (result) => void }
// `ack` is a sentence the organizer must tick before a destructive action is enabled. Nothing changes locally: `run`
// calls the API, a refusal is shown inside the dialog exactly as the server worded it, and onDone re-reads the page.
export function useConfirmAction() {
  const toast = useToast();
  const [request, setRequest] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(null), [acked, setAcked] = useState(false);
  const alive = useRef(true), dismissed = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const ask = useCallback((r) => { setError(null); setAcked(false); setRequest(r); }, []);
  const close = () => { if (busy) dismissed.current = true; else setRequest(null); };
  async function confirm() {
    if (busy || !request || (request.ack && !acked)) return;
    setBusy(true); setError(null);
    try {
      const result = await request.run();
      toast.success(request.done);
      if (alive.current) setRequest(null);
      request.onDone?.(result);
    } catch (e) {
      if (e?.status !== 401) { if (alive.current && !dismissed.current) setError(e); else toast.error(e?.message || "That didn't work. Please try again."); }
    } finally {
      if (alive.current) { setBusy(false); if (dismissed.current) setRequest(null); }
      dismissed.current = false;
    }
  }
  const dialog = (
    <Modal open={!!request} onClose={close} title={request ? request.title : "Confirm"}
      footer={request && <><Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
        <Button variant={request.danger ? "danger" : "primary"} onClick={confirm} disabled={busy || (!!request.ack && !acked)}>{busy ? request.busyText : request.yes}</Button></>}>
      {request && <>
        {request.subject && <p><strong>{request.subject}</strong></p>}
        <p className={request.ack ? undefined : "flush"}>{request.body}</p>
        {request.ack && <label className="check-row"><input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} disabled={busy} /><span>{request.ack}</span></label>}
        {error && <div className="alert alert-bad spaced-top" role="alert"><Icon name="alert" /><div>{error.message}</div></div>}
      </>}
    </Modal>
  );
  return { ask, dialog, busy };
}
