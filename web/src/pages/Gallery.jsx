import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePageTitle } from "../router.jsx";
import PageContainer from "../components/common/PageContainer.jsx";
import TechHero from "../components/visual/TechHero.jsx";
import Icon from "../components/common/Icon.jsx";
import Button from "../components/common/Button.jsx";
import { EmptyState } from "../components/common/States.jsx";
import { ALBUMS } from "../gallery/albums.js";

// Content comes from gallery/albums.js (see the instructions at the top of that file). Albums are flattened into one
// running order; each photo keeps its album title as the label shown with it.
const photos = ALBUMS.flatMap((a) => a.photos.map((p) => ({ ...p, album: a.title })));
const INTERVAL_MS = 6000;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
// Keys typed into a field (the Tech Guide box, a form) or pressed while a dialog is open are not slideshow commands.
const typingOrDialog = (e) => e.ctrlKey || e.metaKey || e.altKey || !!e.target.closest?.("input, textarea, select, [contenteditable='true'], dialog[open]");

export default function Gallery() {
  usePageTitle("Gallery");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => photos.length > 1 && !reducedMotion());   // no auto-advance for people who asked for less motion
  const [full, setFull] = useState(false);
  const [held, setHeld] = useState(false);                // a mouse is over the slideshow: don't change the photo under it
  const touchX = useRef(null), fullBtn = useRef(null), toggled = useRef(false);
  const n = photos.length, current = photos[index];
  const next = () => setIndex((i) => (i + 1) % n);
  const prev = () => setIndex((i) => (i - 1 + n) % n);

  useEffect(() => {
    if (!playing || held || n < 2) return undefined;
    const id = window.setInterval(() => { if (!document.hidden) setIndex((i) => (i + 1) % n); }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, held, n]);

  useEffect(() => {
    if (n === 0) return undefined;
    const onKey = (e) => {
      if (typingOrDialog(e)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setIndex((i) => (i + 1) % n); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setIndex((i) => (i - 1 + n) % n); }
      else if (e.key === " " && !e.target.closest?.("button, a")) { e.preventDefault(); setPlaying((v) => !v); }   // Space on a button still presses that button
      else if (e.key.toLowerCase() === "f") setFull((v) => !v);
      else if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  // Fullscreen: the page behind must not scroll, and focus stays on the control that toggled it (the stage is re-mounted).
  useEffect(() => {
    document.documentElement.classList.toggle("scroll-lock", full);
    if (toggled.current) fullBtn.current?.focus({ preventScroll: true });
    toggled.current = true;
    return () => document.documentElement.classList.remove("scroll-lock");
  }, [full]);

  if (n === 0) return (
    <PageContainer>
      <TechHero compact eyebrow="CLUB ARCHIVE" title="Gallery" lead="Moments from DRMC IT Club workshops, contests and fests." />
      <EmptyState icon="image" title="No photos yet" message="Photos from club events will appear here." />
    </PageContainer>
  );

  const stage = (
    <section className={`gallery-stage${full ? " gallery-full" : ""}`} aria-roledescription="carousel" aria-label="DRMC IT Club photos"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHeld(true); }} onPointerLeave={() => setHeld(false)}>
      <figure className="gallery-figure">
        <div className="gallery-feature"
          onTouchStart={(e) => { touchX.current = e.changedTouches[0].clientX; }}
          onTouchEnd={(e) => { if (touchX.current == null) return; const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null; if (Math.abs(dx) > 45) (dx < 0 ? next : prev)(); }}>
          <img key={current.id} src={current.src} alt={current.alt} className="gallery-feature-img" width={current.width} height={current.height} draggable="false" decoding="async" />
          {n > 1 && <>
            <button type="button" className="gallery-arrow gallery-prev" onClick={prev} aria-label="Previous photo"><Icon name="chevL" /></button>
            <button type="button" className="gallery-arrow gallery-next" onClick={next} aria-label="Next photo"><Icon name="chevR" /></button>
          </>}
          <p className="gallery-count" aria-live={playing ? "off" : "polite"}>Photo {index + 1} of {n}</p>
        </div>
        <figcaption className="gallery-bar">
          <div className="gallery-caption"><span className="tech-pill">{current.album}</span>{current.caption && <p>{current.caption}</p>}</div>
          <div className="gallery-tools">
            {n > 1 && <Button size="sm" variant="secondary" onClick={() => setPlaying((v) => !v)} aria-label={playing ? "Pause slideshow" : "Play slideshow"}><Icon name={playing ? "pause" : "play"} /> {playing ? "Pause" : "Play"}</Button>}
            <button type="button" ref={fullBtn} className="btn btn-secondary btn-sm" onClick={() => setFull((v) => !v)} aria-pressed={full}><Icon name={full ? "x" : "expand"} /> {full ? "Exit fullscreen" : "Fullscreen"}</button>
          </div>
        </figcaption>
      </figure>
      {n > 1 && (
        <ul className="gallery-thumbs" aria-label="Choose a photo">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" className={`gallery-thumb${i === index ? " is-active" : ""}`} aria-current={i === index ? "true" : undefined} aria-label={`Show photo ${i + 1} of ${n}: ${p.alt}`} onClick={() => setIndex(i)}>
                <img src={p.src} alt="" width={p.width} height={p.height} loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {n > 1 && <p className="gallery-hint muted small">Arrow keys change the photo, Space pauses or plays, F toggles fullscreen. Swipe on a phone.</p>}
    </section>
  );

  return (
    <PageContainer>
      <TechHero compact eyebrow="CLUB ARCHIVE" title="Gallery" lead="A living visual archive of DRMC IT Club workshops, contests and fests." />
      {/* In fullscreen the stage is rendered on <body>: inside the page it would be positioned against the animated page container, not the screen. */}
      {full ? createPortal(stage, document.body) : stage}
    </PageContainer>
  );
}
