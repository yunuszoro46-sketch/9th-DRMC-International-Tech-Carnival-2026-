// Transport-agnostic domain errors. `kind` maps to an HTTP status in the router; `code` is the stable,
// machine-readable identifier clients branch on (e.g. "event_full"); `message` is safe to show to people.
class DomainError extends Error {
  constructor(kind, code, message, extra) { super(message); this.kind = kind; this.code = code; this.extra = extra; }
}
const fail = (kind, code, message, extra) => new DomainError(kind, code, message, extra);
const invalid = (message, field) => fail('validation', 'validation_failed', message, field ? { field } : undefined);
module.exports = { DomainError, fail, invalid };
