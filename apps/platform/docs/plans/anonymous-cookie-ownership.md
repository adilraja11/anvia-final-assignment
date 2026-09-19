# Anonymous cookie ownership platform plan

Status: proposed; not implemented.

## Goal and references

Carry the API-issued anonymous ownership cookie across the existing valuation and chat gateways,
handle first-visit setup and blocked-cookie failures, and accurately present retained data as
same-browser temporary history. Browser behavior is governed by the
[anonymous cookie contract](../contract/anonymous-cookie-ownership.md); the server authority is the
[API ownership contract](../../../api/docs/contracts/anonymous-cookie-ownership.md).

Keep the existing async valuation, evidence, result, and chat behavior from the
[API route integration plan](api-route-integration.md) and
[valuation chat integration plan](valuation-chat-integration.md).

## Current state

- The Hono client is created in `src/utils/api.ts` from `VITE_API_URL` without a shared
  credential-aware fetch function.
- Valuation functions pass request options independently in `src/utils/api/valuations.ts`.
- Valuation chat uses its own gateway and JSONL transport.
- The platform never reads or writes browser storage for ownership, which should remain true.
- The API currently returns an unscoped valuation list, so the existing cards are not private
  browser history.

## Delivery sequence

### 1. Central credential transport

1. Add a small shared fetch wrapper that preserves the request and `AbortSignal` while setting
   `credentials: "include"`.
2. Configure the Hono client to use that wrapper for image/valuation calls, or apply the wrapper to
   every valuation request if the client API requires it.
3. Configure the valuation-chat JSONL transport with the same credential policy; verify it does not
   silently use a separate credential-omitting fetch.
4. Keep API URLs and credentials out of local storage and application state. Prefer same-origin
   `/api` deployment; retain only explicitly configured, API-approved local development origins.

Exit: network inspection proves every valuation and nested chat request carries the browser's
cookie when available.

### 2. Model the session-precondition error

1. Add `ANONYMOUS_SESSION_REQUIRED`/HTTP 428 to the platform's validated API error union and map it
   to a dedicated internal category.
2. Implement a gateway helper that retries an explicit 428 once after the browser processes
   `Set-Cookie`.
3. Preserve the original request body, valuation idempotency key, abort signal, and current-action
   guard across the retry.
4. Do not use this helper for timeouts, network failures, 5xx responses, malformed responses, or
   cancellations. Never perform a third attempt.
5. Make it usable by valuation creation and chat mutations/streams without placing retry logic in
   components.

Exit: a first mutation can establish a cookie safely, while blocked cookies create no loop or
visible false start.

### 3. Bootstrap and retained-history UI

1. Keep `GET /api/valuations` in the home-route load path so the first safe read establishes the
   cookie and returns only owner-scoped summaries.
2. Replace any wording that suggests a shared server list with **"Valuasi terbaru di browser
   ini"** and the temporary-history disclosure where space permits.
3. Render a normal empty state for a new or cleared cookie; do not attempt to reconstruct ownership
   from local storage, prior route IDs, or cached component state.
4. Treat detail/evidence `404` uniformly as missing, expired, or unavailable in this browser. Do
   not tell the user that another owner has the resource.
5. Preserve existing mock/API labels until the public server, upload, ownership, and usage-control
   release gates are all satisfied.

Exit: the interface truthfully describes same-browser temporary continuity and has no client-side
identity implementation.

### 4. Creation, polling, and result recovery

1. Submit valuation creation with credentials and the existing per-submission idempotency key.
2. If the gateway receives 428, retry once with the exact same key before showing analysis
   progress or navigating.
3. Start polling only after a successful `202`; polling, detail, and evidence reads all include
   credentials.
4. On refresh, use the route valuation ID plus the cookie-backed API read. Do not store the owner or
   complete result in browser storage.
5. If cookies are blocked, show the contract copy and keep the confirmed form available for a
   deliberate retry after browser settings change.

Exit: create-to-result and refresh recovery work for the same browser and fail closed elsewhere.

### 5. Chat integration

1. Include credentials when creating/recovering sessions, reading history, deleting sessions, and
   posting the JSONL stream.
2. Apply the one-time 428 retry before a chat side effect or stream starts. Do not automatically
   replay a message after an ambiguous connection or streaming failure.
3. Keep chat failures isolated from the already rendered valuation result and evidence.
4. Treat owner/session mismatch as the existing generic unavailable state; do not expose whether
   the valuation or session belongs to another browser.
5. Verify stop/cancel behavior aborts the active request and prevents a pending retry.

Exit: valuation chat has the same browser ownership boundary as its parent valuation.

### 6. Privacy, accessibility, and documentation

1. Audit client logs, error reports, analytics, and test fixtures for cookie/header/owner leakage.
2. Keep the cookie-required error in Bahasa Indonesia, associate it with the relevant form/action,
   and move focus to the error summary when submission cannot continue.
3. Ensure empty, expired, inaccessible, and cookie-blocked states are distinct without revealing
   resource ownership.
4. Update `DEVELOPMENT.md` and source-verified API-route documentation when implementation changes
   the current boundary; do not mark this proposed plan as live prematurely.
5. Coordinate any cookie/privacy notice with product/legal review without claiming this document
   settles consent requirements.

Exit: ownership transport is invisible to normal use, understandable on failure, and absent from
client telemetry.

## Test matrix

Use gateway tests plus browser integration/E2E coverage:

- shared fetch and JSONL transports set `credentials: "include"` and preserve abort signals;
- first list returns an empty state and establishes continuity;
- first create receives 428, retries once with the same idempotency key, then receives 202;
- persistent 428 shows the cookie-required message and does not enter analysis progress;
- an aborted or superseded request never retries or updates stale state;
- two browser contexts have disjoint home lists and cross-opened result URLs show unavailable;
- same-browser refresh restores polling, terminal result, evidence, and chat;
- clearing cookies resets the home list and makes prior detail/chat inaccessible;
- chat stream, stop, retry, history, and clear all preserve credential behavior; and
- mock mode remains visibly mock and does not depend on or fabricate an API cookie.

## Verification commands

Run after implementation:

```sh
pnpm --filter @repo/platform typecheck
pnpm --filter @repo/platform build
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api build
pnpm check
```

Use browser developer tools only to confirm cookie attributes and request inclusion; platform
JavaScript must remain unable to read the HttpOnly value. Perform the manual flow with two isolated
browser profiles, then clear one profile's cookie and repeat the access checks.

## Release gate

- API ownership enforcement and platform credential transport deploy together.
- Every valuation and valuation-chat request includes credentials.
- The explicit 428 handshake retries once and cannot start duplicate paid/model work.
- No owner identity exists in local storage, URLs, request bodies, custom identity headers, UI
  state, or analytics.
- Same-browser, cleared-cookie, blocked-cookie, and cross-browser behavior matches the contract.
- Public copy says temporary browser history, not account or cross-device saved history.
