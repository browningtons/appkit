// What api/ writes to Vercel's logs, and the only place it writes from:
// eslint.config.js refuses console and process output anywhere else in api/.
// Ported from our-family-lizard's api/_lib/log.ts (its R18, A-LG1).
//
// Why: a Checkout Session id is a bearer credential in the kit. The checkout
// redirect's `#session_id=cs_…` goes to GET /api/verify-purchase, and a
// settled Pro session answers `{ verified: true }` on any device
// (src/kit/auth/useAuth.ts). Stripe's error messages quote the id a call
// failed on ("No such checkout.session: cs_live_…"), a webhook signature
// failure carries the whole event body (a paid session, id and email) in
// its `payload`, and a database error can quote the row it refused. So every
// line goes through `log`, which cuts any id out of every text field, and a
// caught error goes through `errorLogFields` first.
//
// Files prefixed with `_` are not Vercel routes.

// What a log line may carry: flat values, never an object. A Stripe error's
// `raw` repeats its message, id and all, alongside every response header.
export type LogFields = Record<string, string | number | boolean | null | undefined>;

// A Checkout Session id inside any text: its mode prefix, then everything up
// to a space, a quote, or the `;` `,` `)` Stripe puts after one. Wider than
// the [A-Za-z0-9_] of today's ids on purpose: Stripe may change the format,
// and cutting a trailing path costs a log line nothing, while a new character
// must not leave the rest of an id behind.
const SESSION_ID_IN_TEXT = /cs_(live|test)_[^\s'";,)]+/g;

// `text` with every Checkout Session id cut to its mode.
export function redactSessionIds(text: string): string {
  return text.replace(SESSION_ID_IN_TEXT, 'cs_$1_…[redacted]');
}

// The fields as written: text cut of any session id, other flat values as
// they are. Anything else is dropped; the type already refuses it, this is
// the backstop for a value that got past the type. A `fields` that isn't a
// plain object (a string cast to LogFields would be walked one character at a
// time, too short to match) writes nothing, and keys are cut like values.
function safeFields(fields: LogFields): LogFields {
  const logged: LogFields = {};
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return logged;
  for (const [key, value] of Object.entries(fields)) {
    const safeKey = redactSessionIds(key);
    if (typeof value === 'string') logged[safeKey] = redactSessionIds(value);
    else if (value == null || typeof value === 'number' || typeof value === 'boolean') logged[safeKey] = value;
  }
  return logged;
}

// One line per event: a fixed name, then flat fields.
export const log = {
  error: (event: string, fields: LogFields = {}): void =>
    console.error(redactSessionIds(event), safeFields(fields)),
  warn: (event: string, fields: LogFields = {}): void =>
    console.warn(redactSessionIds(event), safeFields(fields)),
  info: (event: string, fields: LogFields = {}): void =>
    console.info(redactSessionIds(event), safeFields(fields)),
};

// Why a caught error failed the request, as flat fields. Stripe's type, code
// and HTTP status tell an expired key from a missing permission from an
// outage. Its request id, and the link to that call in Stripe's logs, lead to
// the full request behind Stripe's login. Only text (redacted) and numbers:
// never `raw`, `headers`, or a signature error's `payload` and `header`.
export function errorLogFields(err: unknown): Record<string, string | number> {
  const e = (typeof err === 'object' && err !== null ? err : { message: String(err) }) as {
    type?: unknown;
    code?: unknown;
    statusCode?: unknown;
    param?: unknown;
    requestId?: unknown;
    raw?: { request_log_url?: unknown; exception?: unknown } | null;
    message?: unknown;
    detail?: unknown;
    stack?: unknown;
  };
  const fields = {
    type: e.type,
    code: e.code,
    statusCode: e.statusCode,
    param: e.param,
    stripeRequestId: e.requestId,
    stripeRequestLogUrl: e.raw?.request_log_url,
    message: e.message,
    detail: causeText(e.detail) ?? causeText(e.raw?.exception),
    // An error Stripe didn't send is a bug of ours, and its stack finds it.
    // A Stripe error's stack is the SDK's frames, repeating the message.
    stack: e.type === undefined ? e.stack : undefined,
  };
  const logged: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') logged[key] = redactSessionIds(value);
    else if (typeof value === 'number') logged[key] = value;
  }
  return logged;
}

// The cause the SDK keeps beside its own message: a connection error's, in
// `detail` (the network, or a key Node refuses as a header), or, in
// `raw.exception`, the parse error of an answer that wasn't JSON.
function causeText(cause: unknown): string | undefined {
  if (typeof cause === 'string') return cause;
  const c = cause as { code?: unknown; message?: unknown } | null | undefined;
  if (typeof c?.message !== 'string') return undefined;
  return typeof c.code === 'string' ? `${c.code}: ${c.message}` : c.message;
}
