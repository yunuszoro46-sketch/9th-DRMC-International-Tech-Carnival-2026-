import { useId } from "react";
import Icon from "./Icon.jsx";
// Label + control + hint + error, wired together for assistive tech. Controls: Input, Select, Textarea.
export function Field({ label, required, hint, error, children }) {
  const id = useId(), hintId = hint ? `${id}-hint` : undefined, errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}{required && <span className="sr-only"> (required)</span>}</label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? "true" : undefined, "aria-required": required || undefined })}
      {hint && <span id={hintId} className="hint">{hint}</span>}
      {error && <span id={errId} className="field-error" role="alert"><Icon name="alert" />{error}</span>}
    </div>
  );
}
export const Input = ({ className = "", ...p }) => <input className={`input ${className}`} {...p} />;
export const Textarea = ({ className = "", ...p }) => <textarea className={`textarea ${className}`} {...p} />;
export const Select = ({ className = "", children, ...p }) => <select className={`select ${className}`} {...p}>{children}</select>;
