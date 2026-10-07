import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import { Link, useRouter } from "../../router.jsx";
import Icon from "../common/Icon.jsx";

// The event assistant. It only displays what POST /api/assistant returns: every fact, link and suggested question
// comes from the backend, which answers from the public event data. Nothing here knows about events.
const GREETING = "Hi! I'm Tech Guide. Ask me about the club's events: what's open, when and where something is, seats left, deadlines and more. I answer from the live event data.";
const FALLBACK_STARTERS = ["What's open for registration?", "What's happening this week?", "When is the next event?", "How do I register?"];
const UNREACHABLE = "Sorry, I couldn't reach the event assistant right now. Please try again.";
const MAX_LENGTH = 300, KEEP = 40;
// "How many seats are left?" on an event page is about that event.
const pageContext = (path) => { const m = /^\/(events|fests)\/(\d+)/.exec(path || ""); return m ? { [m[1] === "events" ? "event" : "fest"]: Number(m[2]) } : null; };
let seq = 0;

// "• " lines become a real list, so screen readers announce "list, 5 items" and long lines wrap under their own bullet.
function Body({ text }) {
  const blocks = [];
  String(text || "").split("\n").forEach((line) => {
    const last = blocks[blocks.length - 1];
    if (line.startsWith("• ")) { if (last?.items) last.items.push(line.slice(2)); else blocks.push({ items: [line.slice(2)] }); }
    else if (line.trim()) blocks.push({ line });
  });
  return blocks.map((b, i) => (b.items ? <ul key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul> : <p key={i}>{b.line}</p>));
}

export default function AssistantWidget() {
  const { path } = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [starters, setStarters] = useState(null);
  const [messages, setMessages] = useState([{ id: 0, role: "assistant", text: GREETING }]);
  const input = useRef(null), fab = useRef(null), log = useRef(null), focus = useRef(null), pending = useRef(null);

  useEffect(() => () => pending.current?.abort(), []);                       // leaving the public site cancels a question in flight
  useEffect(() => {                                                          // suggested questions are built by the backend from what is published
    if (!open || starters) return undefined;
    const ctrl = new AbortController();
    api.assistantStarters({ signal: ctrl.signal }).then((d) => setStarters(d?.suggestions?.length ? d.suggestions : FALLBACK_STARTERS), (e) => { if (e.name !== "AbortError") setStarters(FALLBACK_STARTERS); });
    return () => ctrl.abort();
  }, [open, starters]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (pageContext(path)) focus.current = null; }, [path]);   // opening another event or fest page makes that page the subject
  useEffect(() => {                                                          // keep the question at the top so a long answer is read from its first line
    const el = log.current; if (!el) return;
    const asked = el.querySelectorAll(".assistant-msg.user"), q = asked[asked.length - 1];
    el.scrollTop = q && !busy ? q.offsetTop - 10 : el.scrollHeight;
  }, [messages, busy, open]);

  const close = () => { setOpen(false); fab.current?.focus(); };
  const push = (m) => setMessages((list) => [...list, { id: ++seq, ...m }].slice(-KEEP));

  async function send(question, { echo = true } = {}) {
    if (busy) return;                                                        // one question at a time
    setBusy(true);
    if (echo) push({ role: "user", text: question });
    const ctrl = new AbortController(); pending.current = ctrl;
    try {
      const data = await api.assistant(question, focus.current || pageContext(path), { signal: ctrl.signal });
      focus.current = data.focus || null;                                    // follow-ups refer to the event or fest just discussed
      push({ role: "assistant", text: data.message, sources: data.sources || [], suggestions: data.suggestions || [] });
    } catch (e) {
      if (e.name === "AbortError") return;
      const typed = e.status === 400 || e.status === 429;                    // those messages are written for people; anything else gets one calm line
      push({ role: "assistant", error: true, text: typed ? e.message : UNREACHABLE, retry: e.status === 400 ? null : question });
    } finally { if (pending.current === ctrl) { pending.current = null; setBusy(false); } }
  }
  const ask = (value) => { const question = String(value ?? text).trim(); if (!question || busy) return; setText(""); send(question); };
  const retry = (m) => { setMessages((list) => list.filter((x) => x.id !== m.id)); send(m.retry, { echo: false }); };
  const followLink = () => { if (window.matchMedia?.("(max-width: 600px)").matches) setOpen(false); };   // on a phone the page you asked for should not stay hidden behind the panel

  const last = messages[messages.length - 1];
  const chips = busy ? [] : messages.length === 1 ? (starters || []) : last.role === "assistant" && !last.error ? last.suggestions || [] : [];

  return (
    <>
      {open && (
        <section id="assistant-panel" className="assistant-panel" role="dialog" aria-label="Tech Guide, the event assistant" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <header className="assistant-head">
            <span className="assistant-orb" aria-hidden="true"><Icon name="bot" /></span>
            <div className="min0"><h2>Tech Guide</h2><p className="assistant-kicker">Answers from live event data</p></div>
            <button type="button" className="icon-btn" onClick={close} aria-label="Close assistant"><Icon name="x" /></button>
          </header>
          <div className="assistant-messages" ref={log} role="log" aria-live="polite" aria-label="Conversation" tabIndex={0}>
            {messages.map((m) => (
              <div key={m.id} className={`assistant-msg ${m.role}${m.error ? " error" : ""}`}>
                <span className="sr-only">{m.role === "user" ? "You: " : "Tech Guide: "}</span>
                <Body text={m.text} />
                {m.sources?.length > 0 && <ul className="assistant-links" aria-label="Open in the site">{m.sources.map((s) => <li key={s.href}><Link to={s.href} onClick={followLink}>{s.title} <Icon name="arrow" /></Link></li>)}</ul>}
                {m.retry && m === last && !busy && <button type="button" className="btn btn-secondary btn-sm assistant-retry" onClick={() => retry(m)}><Icon name="refresh" /> Try again</button>}
              </div>
            ))}
            {busy && <div className="assistant-msg assistant assistant-wait" role="status"><span className="assistant-dots" aria-hidden="true"><i /><i /><i /></span>Checking the club's event data…</div>}
            {chips.length > 0 && <div className="assistant-starters" role="group" aria-label="Suggested questions">{chips.map((x) => <button key={x} type="button" onClick={() => ask(x)}>{x}</button>)}</div>}
          </div>
          <form className="assistant-form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_LENGTH} placeholder="Ask about events…" aria-label="Ask the assistant" autoComplete="off" enterKeyHint="send" />
            <button type="submit" className="btn btn-primary assistant-send" disabled={busy || !text.trim()} aria-label="Send question"><Icon name="arrow" /></button>
          </form>
        </section>
      )}
      <button ref={fab} type="button" className="assistant-fab" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} aria-controls="assistant-panel" aria-label="Ask Tech Guide">
        <span className="assistant-orb" aria-hidden="true"><Icon name={open ? "x" : "bot"} /></span><span className="assistant-fab-label">Ask Tech Guide</span>
      </button>
    </>
  );
}
