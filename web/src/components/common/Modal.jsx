import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";
// Built on the native <dialog>: the browser traps focus, closes on Escape, makes the page behind inert and restores focus.
// Closed dialogs render no children, so nothing hidden stays focusable. variant="drawer" slides in from the left (mobile menus).
export default function Modal({ open, onClose, title, children, footer, variant = "dialog", wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current; if (!d) return undefined;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    document.documentElement.classList.toggle("scroll-lock", open);
    return () => document.documentElement.classList.remove("scroll-lock");
  }, [open]);
  const cls = variant === "drawer" ? "modal drawer" : `modal${wide ? " modal-wide" : ""}`;
  return (
    <dialog ref={ref} className={cls} aria-label={title} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <>
          <div className="modal-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
