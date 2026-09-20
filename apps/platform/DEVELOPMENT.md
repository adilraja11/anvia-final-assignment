# Platform UI development plan

## Current development scope

The platform is a Bahasa Indonesia prototype of the AsliSegini? listing-price recommendation
journey for individual sellers of second-hand electronics. It defaults to deterministic mock mode
and can explicitly use the synchronous local agent API during Vite development. It uses local
session state and no browser storage.

Implemented user journey:

1. Upload one JPG, PNG, or WebP image with browser preflight and authoritative local-server
   validation when local mode is enabled.
2. Confirm the proposed identity, one allowed second-hand condition, optional details, and a visibly
   deferred listing location.
3. See labelled simulated progress in mock mode or a truthful indeterminate state in local mode.
4. Review either a clearly labelled mock result or a local result containing only fields returned
   by the API.
5. Recover from unsupported category, missing information, insufficient evidence, service failure,
   and the future rate-limit outcome without fabricated prices.

The reference screens guide the visual direction: a light canvas, centered cards, violet accent,
compact header, and a clear three-stage journey. The result content follows the seller-first PRD
rather than copying unsupported sources or buyer-oriented pricing framing.

## Why this is a useful first increment

- It makes the core seller flow testable before backend contracts exist.
- Required PRD fields and outcome language are visible early, reducing integration rework.
- Mock evidence is explicitly labelled, so the prototype does not imply live marketplace data.
- The UI is responsive and keyboard-accessible with native form controls and labels.

## Remaining implementation sequence

1. **Complete the server workflow** - add secure upload, persistent idempotent jobs, access control,
   usage limits, and safe representative evidence.
2. **Integrate browser-ready jobs** - key the result route by opaque `jobId` and render only
   server-reported progress.
3. **Render approved evidence** - add representative Blibli listing fields only after the response
   contract exists.
4. **Test and harden** - add component and end-to-end tests for every outcome, focus management,
   cancellation, refresh recovery, and duplicate submission protection.

## Local adapter

Set `VITE_VALUATION_MODE=local-api` in the root `.env` and run `pnpm dev`. The Vite server proxies
relative `/api` requests to `http://127.0.0.1:$PORT` (default `8000`). Do not add a `VITE_*` API base
URL. Production builds fail closed if `local-api` is selected. Use `mock` or omit the variable for
the labelled deterministic demo. `production-api` explicitly enables the currently implemented
server routes in a production build. Those routes use an API-issued HttpOnly cookie for temporary,
same-browser valuation continuity; the browser never reads or stores an ownership identifier. It
remains an operator-enabled local-demo stage until its rate-limit and secure-upload requirements
are implemented.

## Integration guardrails

- The browser must never calculate or invent the median-based suggestion, observed market range,
  or confidence; it only renders the deterministic result returned by the application.
- Show only approved Blibli evidence in live mode and label all values as advertised asking prices.
- Keep the statement “Estimasi hanya mencakup harga barang.” and the authenticity/ownership/hidden-condition limitation on every successful result.
- Do not turn the mock evidence into a hidden fallback when providers fail.
- Maintain Bahasa Indonesia for all user-facing text.
- In API modes, describe retained summaries only as temporary history for the current browser.
  Clearing cookies, private browsing, or changing browsers starts a new history and cannot recover
  prior valuations.

## Review questions

Before backend work, please confirm whether the proposed default product (PS5 Slim Disc 1TB), result density, and evidence-card layout are the desired demo direction. The next design pass should add the distinct failure/insufficient-evidence screens once their exact copy is approved.
