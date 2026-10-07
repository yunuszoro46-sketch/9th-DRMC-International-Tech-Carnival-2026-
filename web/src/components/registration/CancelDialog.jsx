import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import Modal from "../common/Modal.jsx";
import Button from "../common/Button.jsx";
import Icon from "../common/Icon.jsx";
import { useToast } from "../common/Toast.jsx";

// Confirmation before cancelling. Whether cancelling is allowed is the backend's call (`can_cancel`); the dialog is only
// opened for registrations that report it, and a refusal from the server (e.g. the event has just started) is shown here.
export default function CancelDialog({ open, onClose, token, eventTitle, onDone, onStale }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  useEffect(() => { if (open) { setError(null); setBusy(false); } }, [open]);
  async function confirm() {
    setBusy(true); setError(null);
    try { await api.cancelRegistration(token); toast.success("Registration cancelled."); onClose(); onDone?.(); }
    catch (e) { setError(e); if (e.status === 409 || e.status === 404) onStale?.(); }   // the server refused: refresh so the page shows the real state
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Cancel this registration?"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Keep registration</Button><Button variant="danger" onClick={confirm} disabled={busy}>{busy ? "Cancelling…" : "Yes, cancel registration"}</Button></>}>
      <p>You are about to give up your place{eventTitle ? <> in <strong>{eventTitle}</strong></> : null}. Your pass will stop working and this can't be undone. You would have to register again, if seats are still available.</p>
      {error && <div className="alert alert-bad" role="alert"><Icon name="alert" /><div>{error.message}</div></div>}
    </Modal>
  );
}
