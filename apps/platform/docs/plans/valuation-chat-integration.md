# Platform valuation chat integration plan

Status: proposed; not implemented.

## Goal and references

Add an accessible, refresh-recoverable chat to successful persistent valuation results. Follow the
[platform valuation chat contract](../contract/valuation-chat-integration.md) for UI and controller
behavior and the [API valuation chat contract](../../../api/docs/contracts/valuation-chat-api.md)
for routes and protocol semantics.

This work must not change valuation calculation, evidence rendering, result polling, or mock-mode
truthfulness.

## Current state

- `/result/$valuationId` renders `PersistentValuationResultPage` and polls the persistent valuation
  endpoint until completion.
- A `VALUATED` result renders the server's deterministic fields and separately loads accepted
  evidence.
- The platform already depends on `@anvia/client`, `@anvia/react`, and `@anvia/react-ui`, but it has
  no active chat gateway or result-page chat component.
- The existing server `/api/chat*` route is not valuation-scoped and must not be used as the
  frontend contract.

## Phase 1 - Chat gateway and strict decoding

1. Add focused valuation-chat types for the session envelope, history response, projected messages,
   and safe error codes.
2. Add `createOrRecoverSession`, `readSession`, and `deleteSession` functions alongside other API
   adapters, keeping Hono selectors and `decodeResponse` details out of UI components.
3. Add a transport factory for the nested message endpoint with `format: "jsonl"`.
4. Validate session IDs, matching valuation IDs, timestamps, message roles, message IDs, and allowed
   text parts at the browser boundary.
5. Do not serialize the already-loaded result or evidence into session or message requests.
6. Preserve abort signals and distinguish chat errors from valuation read/evidence errors.

Exit: gateway checks cover every success response and safe error without rendering React UI.

## Phase 2 - Controller hook and session recovery

1. Add a focused hook that owns closed, creating, restoring, ready, streaming, cancelled, and error
   states for one valuation ID.
2. Initialize lazily when the user opens chat or selects a suggested question.
3. Create or recover the session, load its history, then construct one `useChat` controller for the
   returned session.
4. Avoid overlapping initialization requests and ignore stale completions after route changes.
5. On refresh, recover the same server-side session from the valuation ID; do not require browser
   storage and do not put the session ID in the route.
6. Abort fetches and stop an active stream on unmount. Do not delete session history implicitly.

Exit: opening, closing, navigating away, and refreshing cannot create duplicate sessions or attach
messages to the wrong valuation.

## Phase 3 - Result-page chat component

1. Render the chat only inside the persistent `VALUATED` outcome. Keep mock and all non-valued
   outcomes unchanged.
2. Place the section after the explanation and required disclosures without replacing the existing
   evidence panel.
3. Add the required heading, boundary description, labelled composer, stop control, retry behavior,
   and explicit clear action from the contract.
4. Render only text message parts. Use application styles or editable headless primitives; do not
   depend on a package stylesheet or raw model HTML.
5. Add visible local suggested-question buttons that submit exactly their displayed text.
6. Keep the result usable when chat is closed, initializing, unavailable, rate-limited, or failed.

Exit: chat is additive to the result and no chat state hides or mutates valuation content.

## Phase 4 - Interaction and accessibility hardening

1. Prevent double submit, disable invalid actions, and show an accessible submitted/streaming state.
2. Add a visible stop action whose copy does not imply deletion or valuation cancellation.
3. Preserve reading position unless the user is near the newest message; handle incremental text
   without excessive live-region announcements.
4. Confirm before clearing non-empty history and restore focus intentionally afterward.
5. Verify keyboard order, labels, error associations, focus visibility, reduced motion, small-screen
   composer access, and long unbroken Indonesian text.
6. Handle cancellation, offline transitions, malformed streams, server-safe errors, expiration, and
   retry without automatic duplicate sends.

Exit: the entire chat can be operated and understood with keyboard and assistive technology, and
the valuation remains available during every chat failure.

## Phase 5 - Verification

Cover at minimum:

- chat absent for mock mode and every non-`VALUATED` state;
- lazy create/recover and no model-triggering request before the user opens chat;
- matching JSONL transport endpoint and correct valuation/session parameter encoding;
- history hydration, refresh recovery, route changes, and stale-request cancellation;
- normal send, suggested question, incremental response, stop, explicit retry, and clear;
- double-submit prevention and no automatic resend after ambiguous failure;
- independent valuation, evidence, and chat errors;
- safe rendering of text only, with no raw HTML or arbitrary linkification;
- `CHAT_RESULT_NOT_AVAILABLE`, `CHAT_TURN_IN_PROGRESS`, `CHAT_RATE_LIMITED`, not found, unavailable,
  malformed response, and malformed stream behavior;
- labels, focus, live regions, keyboard controls, reduced motion, and responsive layout; and
- analytics payloads containing no user or assistant text, valuation data, or evidence content.

Run after implementation:

```sh
pnpm --filter @repo/platform typecheck
pnpm --filter @repo/platform build
pnpm check
```

Use `pnpm dev`, including the API and worker dependencies required by the valuation result, for a
manual create -> poll -> result -> chat check. Confirm stream cancellation and proxy buffering in
the actual development topology.

## Delivery order and dependency

The API contract must be implemented and source-verified before enabling the platform chat. The
platform may land disabled gateway/component code earlier, but it must fail closed and must not use
the legacy general chat route as a temporary fallback.

## Public release gate

Keep valuation chat labelled and restricted to local development until server authentication and
owner scope, production CORS, abuse limits, retention, redacted observability, and deployed JSONL
streaming have passed review. Frontend controls are usability defenses, not security boundaries.
