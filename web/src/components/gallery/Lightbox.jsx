import { useEffect } from "react";
import Modal from "../common/Modal.jsx";
import Icon from "../common/Icon.jsx";

// Full-size viewer on the shared <dialog> Modal (focus trap, Esc to close, focus restored to the tile). Arrow keys and the
// buttons step through the album. `index` is null when closed.
export default function Lightbox({ title, photos, index, onIndex, onClose }) {
  const open = index !== null && index !== undefined, p = open ? photos[index] : null, n = photos.length;
  const step = (d) => onIndex((index + d + n) % n);
  useEffect(() => {
    if (!open) return undefined;
    const on = (e) => { if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      {p && (
        <figure className="lightbox">
          <img src={p.src} alt={p.alt} width={p.width} height={p.height} />
          <figcaption>{p.caption}{p.placeholder && <span className="ph-tag">Placeholder</span>}</figcaption>
          <div className="lightbox-nav">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => step(-1)} disabled={n < 2}><Icon name="chevL" /> Previous</button>
            <span className="muted small" role="status" aria-live="polite">Photo {index + 1} of {n}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => step(1)} disabled={n < 2}>Next <Icon name="chevR" /></button>
          </div>
        </figure>
      )}
    </Modal>
  );
}
