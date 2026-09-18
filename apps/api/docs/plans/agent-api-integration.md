# Agent API integration plan

Status: implemented on 2026-09-15.

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
  quarantine, user confirmation, persistent valuation jobs, rate limits, the full deterministic
  valuation result, and browser integration remain unimplemented.
- The valuation helper returns evidence-grounded narrative fields and evidence IDs. The API also
  derives a narrow legacy deterministic `finalRecommendation` from captured accepted comparable
  evidence; it returns a reasonable-buy price range, not the PRD's seller listing-price range,
  suggested listing price, or confidence.

## Accepted implementation scope

The implementation follows these accepted boundaries:

1. **Integration scope:** the implemented synchronous agent-stage API is unauthenticated for local
   demo use only. It is not the public browser-facing valuation API. Public access requires
   authentication, persistent idempotent jobs, anonymous rate limiting, and the spending circuit
   breaker required by the PRD.
2. **Image transport:** the identification endpoint will accept one multipart image and sanitize it
   in memory before invoking the agent. This gives the agent sanitized bytes but does not implement
   the PRD's future private R2 quarantine/presigned-upload lifecycle.
3. **Product and provider contract mismatch:** the current PRD is seller-first and second-hand-only:
   it has no asking-price input, returns a listing-price range plus a weighted-median suggested
   listing price, and names Blibli plus a different Facebook actor. The implemented valuation
   agent retains a buyer-era four-field payload, a legacy Blibli configuration, and
   `curious_coder/facebook-marketplace`. This plan connects that legacy implementation unchanged
   and does not claim PRD compliance.
4. **Result meaning:** a valuation-agent `SUCCESS` means the evidence/explanation agent stage
   completed. It must not be renamed to `VALUATED`; the API's narrow recommendation does not yet
   provide the full range, confidence, job, and evidence-presentation contract required for that
   status.

Any future browser-ready end-to-end seller listing-price API must replace this legacy design rather
than silently treating its deferred capabilities as live.

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
3. In `services.ts`, implement deterministic serialization of the four-field valuation request.
   Keep free text length-bounded and visibly delimited from instructions.
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
automated-test work. Completed verification:

- `@repo/agents` typecheck and build pass;
- `@repo/api` typecheck and build pass;
- a live mounted-server probe reaches the unauthenticated route and returns its request-validation
  envelope;
- direct route checks cover malformed JSON, unknown valuation fields, duplicate image fields,
  unsupported bytes, an oversized image, invalid dimensions, and a cancelled request;
- a valid four-field valuation request passes the strict request schema and the previous
  category/identity payload is rejected;
- live image-agent checks return structured `SUPPORTED` and `UNSUPPORTED_CATEGORY` outcomes;
- API-created agents disable provider-request logging and full tracing, and both Apify Actor call
  options disable provider log streaming;
- all changed TypeScript and JSON files pass targeted Biome checks, and `git diff --check` passes.

Repository-wide `pnpm check` remains blocked by pre-existing formatting and lint findings in the
platform UI and `finding/agents` fixtures. Those unrelated files were not changed.

## Acceptance criteria

- Both existing agents are reachable through dedicated, typed API endpoints.
- Every request is strictly validated before model or paid tool execution.
- The image agent receives exactly one validated, re-encoded image and no user text.
- The valuation agent receives only the validated four-field product payload and uses no chat memory
  or optional web tools.
- Agent business statuses remain distinct and structured.
- No endpoint returns raw streams, traces, provider data, secrets, or unreviewed agent text.
- The valuation endpoint returns only its documented legacy deterministic recommendation; it does
  not imply that the PRD's final seller listing-price calculation and workflow are implemented.
- Existing chat routes continue to compile and behave unchanged.

## Explicitly deferred

- Cloudflare R2 quarantine, presigned upload, lifecycle cleanup, and object authorization;
- public browser authentication/authorization and narrow production CORS;
- persistent idempotent valuation jobs, polling/progress events, retries across process restarts,
  and the 90-second job boundary;
- five-per-day anonymous limits, global spending limits, bot challenge, and persistent evidence
  cache enforcement at the application layer;
- the PRD's listing-price range, weighted-median suggested listing price, confidence,
  representative-listing persistence, and a final `VALUATED` response;
- evidence persistence and the representative-listing response required by the results screen;
- platform UI integration and client-side state;
- replacement of the legacy Blibli configuration and Facebook tool with PRD-compliant provider integrations;
- automated API tests and agent behavioral eval expansion.
