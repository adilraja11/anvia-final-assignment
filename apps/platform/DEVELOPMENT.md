# Platform UI development plan

## Current demo scope

The platform is a client-only, Bahasa Indonesia prototype of the AsliSegini? listing-price
recommendation journey for individual sellers of second-hand electronics. It intentionally uses
local state and deterministic mock data only: no API calls, network uploads, browser storage, or
marketplace requests are made.

Implemented user journey:

1. Upload one JPG, PNG, or WebP image (validated in the browser for type and 10 MB limit).
2. Confirm the AI-proposed product identity, second-hand condition, notes, and optional listing
   location.
3. See the four PRD progress states in sequence.
4. Review a mock listing-price result with a median-based suggested price, separately labeled
   Blibli market range, confidence, limitations, and transparent sample evidence.

The reference screens guide the visual direction: a light canvas, centered cards, violet accent,
compact header, and a clear three-stage journey. The result content follows the seller-first PRD
rather than copying unsupported sources or buyer-oriented pricing framing.

## Why this is a useful first increment

- It makes the core seller flow testable before backend contracts exist.
- Required PRD fields and outcome language are visible early, reducing integration rework.
- Mock evidence is explicitly labelled, so the prototype does not imply live marketplace data.
- The UI is responsive and keyboard-accessible with native form controls and labels.

## Proposed implementation sequence

1. **Confirm UX and copy** — review this prototype's fields, result hierarchy, and error/outcome screens with product/design.
2. **Define contracts** — agree on typed endpoints for image upload, identity proposal, job creation/status, and seller listing-price result. Keep the UI model separate from API response models.
3. **Integrate upload safely** — replace only the local preview with the presigned-upload, validation, sanitization, and deletion flow defined in the PRD. Do not retain the original filename or image metadata.
4. **Integrate idempotent jobs** — persist a job ID in the route and poll or subscribe to status. Map the four UI progress labels to backend job stages; duplicate submissions must reuse the same job.
5. **Render live results** — replace `mock` values with deterministic backend result fields, display actual approved-source links, and preserve evidence counts, timestamps, exclusions, and confidence reasons.
6. **Add all honest outcome states** — implement distinct screens for `UNSUPPORTED_CATEGORY`, `MORE_INFORMATION_REQUIRED`, `INSUFFICIENT_EVIDENCE`, `SERVICE_FAILURE`, and `RATE_LIMITED`.
7. **Test and harden** — add component tests for validation, status mapping, evidence disclosure, focus management, mobile layouts, and no-duplicate submission behavior.

## Integration guardrails

- The browser must never calculate or invent the median-based suggestion, observed market range,
  or confidence; it only renders the deterministic result returned by the application.
- Show only approved Blibli evidence in live mode and label all values as advertised asking prices.
- Keep the statement “Estimasi hanya mencakup harga barang.” and the authenticity/ownership/hidden-condition limitation on every successful result.
- Do not turn the mock evidence into a hidden fallback when providers fail.
- Maintain Bahasa Indonesia for all user-facing text.

## Review questions

Before backend work, please confirm whether the proposed default product (PS5 Slim Disc 1TB), result density, and evidence-card layout are the desired demo direction. The next design pass should add the distinct failure/insufficient-evidence screens once their exact copy is approved.
