# Agent API integration plan

Status: implemented for the local synchronous integration.

## Goal

Add a dedicated module under `apps/api/src/modules/` that exposes the existing image-identification
and valuation agents through narrow, validated HTTP contracts. This first integration returns the
agents' structured stage results without presenting them as the completed AsliSegini? seller
listing-price recommendation workflow.

## Current state

- `@repo/agents` already exports `createImageIdentificationAgent`, `identifyProductImage`,
  `createValuationAgent`, and `generateValuationResult` with schema-validated result types.
- `apps/api` retains the `/api/chat` module and now has typed, unauthenticated `/api/agents` routes for
  image identification and the valuation-agent stage.
- The image-identification route validates and sanitizes a bounded in-memory multipart upload. R2
  quarantine, user confirmation, persistent valuation jobs, rate limits, and browser integration
  remain unimplemented.
- The valuation route accepts confirmed product identity and a second-hand condition, plus an
  optional product description. It captures the single normalized Blibli result and passes it to
  `calculateValuation`. A `VALUATED` response contains the deterministic median suggestion,
  observed market range, confidence, and safe evidence summary; the model supplies only grounded
  explanation fields and evidence IDs.

## Accepted implementation scope

The implementation follows these accepted boundaries:

1. **Integration scope:** the implemented synchronous agent-stage API is unauthenticated for local
   demo use only. It is not the public browser-facing valuation API. Public access requires
   authentication, persistent idempotent jobs, anonymous rate limiting, and the spending circuit
   breaker required by the PRD.
2. **Image transport:** the identification endpoint will accept one multipart image and sanitize it
   in memory before invoking the agent. This gives the agent sanitized bytes but does not implement
   the PRD's future private R2 quarantine/presigned-upload lifecycle.
3. **Product calculation boundary:** the API accepts no asking or original-price input. It uses one
   Blibli evidence set and delegates all numeric fields to `calculateValuation`. The agent's
   `SUCCESS` status only permits the API to use its explanation fields; it cannot create or change
   a calculated price.
4. **Result meaning:** `VALUATED` means the local synchronous API calculated a result from accepted
   evidence. It does not make the endpoint the complete public workflow: persistent jobs, access
   controls, rate limits, evidence presentation, and the browser flow remain deferred.

Any future browser-ready end-to-end seller listing-price API must add the deferred capabilities
rather than silently treating them as live.

## HTTP contract

`agentApiRouter` is mounted at `/api/agents`. The exact requests, responses, validation rules, and
error mappings live in the focused [agent API contract](../contracts/agent-api.md). Keeping that
contract separate prevents implementation steps and public interface details from becoming stale
together.

## Implemented module layout

```text
apps/api/src/modules/agents/
├── router.ts          # Hono routes, body limits, cancellation, and response mapping
├── schema.ts          # Strict request, response, and public error schemas/types
└── services.ts        # Image sanitization, prompt serialization, agents, aborts, and tracing
```

Related changes:

- mount `agentApiRouter` from `apps/api/src/index.ts` at `/api/agents`;
- add direct API dependencies for schema validation and image decoding/re-encoding rather than
  relying on transitive packages;
- add only the safe timeout variable name and comment to `.env.example`;
- if abort propagation for image identification cannot be implemented from the current exported
  helper, make the smallest backward-compatible helper-option change in `@repo/agents`, then build
  that package before the API.

## Implementation sequence

1. Add strict API request, response, and public error schemas in `schema.ts`.
2. In `services.ts`, implement decoded-image validation, metadata stripping, and the sanitized
   `SanitizedProductImage` adapter.
3. In `services.ts`, serialize the seller-first valuation request deterministically. Keep free text
   length-bounded and visibly delimited from instructions.
4. In `services.ts`, invoke the existing structured helpers, forward cancellation where supported,
   assign safe trace names, and call `flushAgentTracing()` in `finally` blocks.
5. In `router.ts`, implement both handlers and map only intentional result fields or sanitized
   errors to JSON.
6. Mount the router without changing the existing `/api/chat` behavior.
7. Update API documentation to label these endpoints as local-only agent-stage integrations and to
   list the deferred product-workflow requirements.
8. Format and verify the affected workspaces.

## Verification

Automated tests were not added because the repository instructions require an explicit request for
automated-test work. The current change is verified with API typechecking and build, targeted Biome
checks for changed TypeScript, and `git diff --check`.

With configured provider credentials, also exercise a valid seller-first request, a request that
contains the removed asking-price field, an insufficient-evidence result, and a provider failure.
Do not log image data, free text, raw provider responses, or credentials while doing so.

## Acceptance criteria

- Both existing agents are reachable through dedicated, typed API endpoints.
- Every request is strictly validated before model or paid tool execution.
- The image agent receives exactly one validated, re-encoded image and no user text.
- The valuation agent receives only the validated seller-first payload and uses no chat memory or
  optional web tools.
- Agent business statuses remain distinct and structured.
- No endpoint returns raw streams, traces, provider data, secrets, or unreviewed agent text.
- The valuation endpoint uses `calculateValuation` for the documented median suggestion, observed
  market range, confidence, and insufficient-evidence decision. It does not imply that the PRD's
  complete seller workflow is implemented.
- Existing chat routes continue to compile and behave unchanged.

## Explicitly deferred

- Cloudflare R2 quarantine, presigned upload, lifecycle cleanup, and object authorization;
- public browser authentication/authorization and narrow production CORS;
- persistent idempotent valuation jobs, polling/progress events, retries across process restarts,
  and the 90-second job boundary;
- five-per-day anonymous limits, global spending limits, bot challenge, and persistent evidence
  cache enforcement at the application layer;
- evidence persistence and the representative-listing response required by the results screen;
- platform UI integration and client-side state;
- automated API tests and agent behavioral eval expansion.
