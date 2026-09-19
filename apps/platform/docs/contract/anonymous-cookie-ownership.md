# Anonymous cookie ownership browser contract

Status: proposed; not implemented.

This contract defines the platform side of the API's
[anonymous cookie ownership contract](../../../api/docs/contracts/anonymous-cookie-ownership.md).
Implementation order is in the
[platform plan](../plans/anonymous-cookie-ownership.md). The existing
[API route contract](api-routes.md), [valuation integration contract](valuation-integration.md), and
[valuation chat contract](valuation-chat-integration.md) continue to govern response rendering and
product behavior.

Until both platform and API changes ship together, retained valuation summaries are a shared
local-demo collection and must not be presented as private user history.

## User-facing meaning

The cookie provides anonymous same-browser continuity only.

- The user does not create an account or sign in.
- The current browser can see its own non-expired valuations for up to the server's 24-hour
  retention window.
- Clearing cookies, private browsing, another browser, or another device starts a new anonymous
  session; previous valuations cannot be recovered there.
- The platform must not call this identity an account, profile, login, permanent history, or
  cross-device synchronization.

The UI may describe the list as **"Valuasi terbaru di browser ini"**. If explanatory copy is
needed, use: **"Riwayat sementara tersimpan untuk browser ini dan dapat hilang jika cookie
dihapus."**

## Browser trust boundary

The anonymous credential is an API-issued `HttpOnly` cookie. Platform code must not:

- generate a user ID;
- read or write the ownership cookie;
- mirror it into `localStorage`, `sessionStorage`, IndexedDB, React state, URLs, headers, logs, or
  analytics;
- accept an owner ID from a route parameter or form; or
- filter a shared API response and treat that as authorization.

The browser cookie jar handles the credential. The API is solely responsible for issuance,
validation, hashing, persistence, and resource scoping.

## Credential transport

All valuation and valuation-chat requests must include browser credentials. Configure this once in
the shared API boundary rather than separately in components:

```ts
fetch(url, {
	...init,
	credentials: "include",
});
```

This requirement covers list, create, polling, evidence, chat-session creation/history/deletion,
and the JSONL chat message transport. It is acceptable for same-origin requests even though the
browser default would already send same-origin cookies; explicit configuration prevents drift when
local development uses another configured origin.

Use a relative same-origin `/api` path in production where possible. When the configured API origin
differs in local development, it must be an exact API-approved origin and the API must return
credentialed CORS headers. Platform code cannot work around a rejected origin, `Secure` mismatch,
or browser cookie policy.

## Anonymous-session handshake

A safe read establishes the cookie without exposing an identifier:

1. The home route loads `GET /api/valuations` with credentials.
2. On a first visit, the API sets the HttpOnly cookie and returns an empty collection.
3. Later valuation and chat requests send the cookie automatically.

A user may navigate directly to creation before the bootstrap read. When a mutation returns
`428 ANONYMOUS_SESSION_REQUIRED`, its gateway may retry exactly once after the response has been
processed by the browser cookie jar:

- reuse the identical valuation idempotency key and request body;
- retry only this explicit 428 precondition, not an ambiguous network failure or arbitrary 5xx;
- never loop; and
- if the second attempt returns 428, show a cookie-required error and do not imply that analysis
  started.

The same rule applies before creating a chat session or starting a streamed chat turn. A 428 has no
server side effect, so the one deliberate retry is safe. Chat deletion also retries only when the
user's original action is still current.

## Navigation and state behavior

| Situation | Platform behavior |
| --- | --- |
| First visit | Render an empty retained-valuations state after the list response establishes the cookie |
| Same browser | Render only summaries returned by the owner-scoped API |
| Direct result URL with another/missing cookie | Treat API `404` as unavailable; do not reveal whether the ID exists |
| Cookie cleared | Start a new empty anonymous history; do not attempt local recovery by valuation ID |
| Cookies blocked | Stop after one 428 retry and explain that browser cookies are required |
| Valuation expired | Show the existing unavailable/expired state; cookie presence does not extend retention |
| Chat ownership failure | Keep the valuation UI safe and show chat as unavailable without exposing mismatch detail |

Recommended cookie-blocked copy:

> Cookie browser diperlukan untuk menyimpan dan membuka hasil valuasi sementara. Aktifkan cookie
> untuk situs ini, lalu coba lagi.

Do not claim that enabling cookies will recover a valuation created under another or deleted
credential.

## Gateway behavior

Cookie and retry behavior belongs in `src/utils/api`, alongside response validation and error
mapping. Route and presentation components consume domain results and intentional error categories;
they do not manipulate transport credentials.

- Preserve `AbortSignal` through the credential-aware fetch wrapper and retry.
- Do not retry after cancellation or when a newer submission supersedes the request.
- Keep the same idempotency key across the explicit 428 retry and normal uncertain-request recovery.
- Validate all successful and error envelopes as before; `Set-Cookie` is intentionally unreadable
  from JavaScript.
- Configure the Anvia JSONL transport to include credentials independently if it does not use the
  shared Hono client fetch implementation.
- Never add an `X-User-Id`, owner query parameter, or request-body identity field.

## Privacy and analytics

Permitted analytics remain operational and anonymous: empty-history load, valuation submission,
safe API failure category, chat lifecycle, and latency. Do not record cookie presence/value, an
owner key, valuation IDs as a proxy identity, request headers, product free text, chat text, or
evidence data.

Consent/banner requirements depend on the deployment's legal and privacy review. The platform must
accurately disclose this cookie's same-browser continuity and retention purpose; this engineering
contract does not determine whether a consent banner is legally required.

## Verification requirements

Browser and gateway tests must cover:

- first list request establishes a cookie while JavaScript has no access to it;
- all valuation and chat requests use `credentials: "include"`;
- a 428 mutation retries once with the same idempotency key and never loops;
- blocked-cookie behavior starts no visible progress and shows the approved explanation;
- two isolated browser contexts display disjoint valuation lists and cannot open each other's URLs;
- refresh restores owned polling/result/chat while retained, with no browser storage identity;
- clearing the cookie produces an empty history and makes old result URLs unavailable;
- cancellation prevents retry and stale UI updates; and
- analytics and client logs contain no cookie, owner, header, or local-storage identifier.
