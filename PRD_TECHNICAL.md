# AsliSegini? — Product Requirements Document (Part 2 of 2)

[← Part 1: Product Requirements](PRD.md)

This document specifies the intended valuation contract; it does not assert that the current client-only mock or legacy API/agent stages implement it.

## 10. Deterministic Valuation
### 10.1 Separation of responsibilities
- AI may identify, normalize, match, categorize, and explain.
- Application code validates evidence and calculates all prices.
- The model cannot modify the calculation or substitute a price.
- The seller does not supply a target, asking, or original price. The application derives its market evidence from Blibli.
### 10.2 Calculation
1. Validate one Blibli evidence set against schema, exact identity, positive IDR price, approved URL, availability, and duplication checks. Listing lifecycle and condition are not required for acceptance.
2. When the set has at least four records, calculate `Q1`, `Q3`, and `IQR = Q3 - Q1`; remove prices outside `Q1 - 1.5 × IQR` and `Q3 + 1.5 × IQR`.
3. Require at least five accepted listings after filtering.
4. Calculate `Price_suggested` as the median price of the accepted Blibli evidence. It is an advertised asking-price reference, not an official price, historical original price, or completed-sale price.
5. Calculate the observed market range as the unweighted P25–P75 range of the same accepted evidence. It is not tailored to the submitted item's condition.
6. Round every displayed price using deterministic half-up rounding to the nearest Rp1.000.
### 10.3 Confidence
- `HIGH`: at least 15 accepted listings.
- `MEDIUM`: five through 14 accepted listings.
- `INSUFFICIENT_EVIDENCE`: fewer than five accepted listings remain after filtering.
The UI explains the accepted evidence count and the single-source limitation behind the confidence level.
## 11. Results Screen
A successful result displays:

- Confirmed product identity and condition.
- Suggested listing price based on the median accepted Blibli price.
- An observed market range labeled **"Rentang harga pasar saat ini di Blibli"**.
- Confidence level and its reason.
- A grounded explanation of the listing-price recommendation.
- Relevant pros and cons.
- The statement **"Estimasi hanya mencakup harga barang."**
- A limitation notice that the result does not verify authenticity, ownership, safety, or hidden physical condition.
- A disclosure that Blibli prices are advertised asking prices, not official, historical-original, or completed-sale prices.
### 11.1 Evidence transparency
The evidence section displays:

- Accepted evidence count.
- Evidence retrieval timestamp in Indonesian local time.
- Three to five representative accepted listings.
- Marketplace, listing title, item price, condition, and city when available.
- A direct link to the original listing.
- A notice that displayed Blibli prices are advertised asking prices, not completed-sale, official, or historical original prices.
Seller names and profile information are not displayed.
### 11.2 Explanation grounding
Every material statement must derive from one of these internal source classes:

- `VISIBLE`: observed through image analysis.
- `USER_PROVIDED`: supplied or confirmed by the user.
- `MARKET_EVIDENCE`: present in an accepted comparable or deterministic result.
- `UNKNOWN`: not established and therefore not asserted as fact.
Pros and cons focus on transaction-relevant evidence such as condition, warranty, included items, price position, evidence quality, and missing information. General model knowledge must not be presented as a fact about the submitted item or as marketplace evidence. Unsupported facts are omitted.

## 12. Reliability and Performance
- Valuation runs as an idempotent asynchronous job with a persistent job ID.
- Target completion time is 60 seconds.
- Hard timeout is 90 seconds.
- Each failed actor may be retried once if time remains.
- If Blibli fails after its allowed retry, return `SERVICE_FAILURE`, not `INSUFFICIENT_EVIDENCE`.
- If Blibli succeeds but fewer than five listings remain, return `INSUFFICIENT_EVIDENCE`.
- Malformed responses and timeouts never become pricing evidence.

## 13. Cost and Abuse Controls
The MVP is freely accessible without authentication, subject to these controls:

- Maximum of five valuations per anonymous user or client per day.
- No paid actor run before the user confirms identity and condition.
- Maximum of one normal Blibli actor run, plus one retry after a failed run, per valuation.
- Maximum of three query variants and ten results per query, for at most 30 results per run.
- Six-hour evidence caching.
- Idempotency for repeat submissions, refreshes, and double-clicks.
- A configurable global daily spending limit and circuit breaker.
- New paid runs stop when the usage or spending limit is reached.
- Suspicious automated traffic may receive an automated bot challenge.
- Usage and estimated cost are recorded without raw images, credentials, or seller personal data.

## 14. Privacy and Security
- Uploaded images are handled through the private R2 quarantine and sanitization flow.
- Raw images, credentials, presigned URLs, and seller personal information are excluded from application logs.
- Apify and R2 credentials remain server-side and are never provided to the model or browser.
- The agent may call only the approved Blibli actor integration once per valuation.
- Application code enforces actor IDs, call count, retries, timeouts, result limits, cache policy, and spending limits.
- Presigned URLs grant only the minimum operation, object, and lifetime required.
- Marketplace response URLs, types, and prices are validated before use.
- User and marketplace content cannot authorize new tools, endpoints, actions, or permissions.
- Product images are disclosed as being processed by AI and storage/service providers.

## 15. Analytics
The MVP records only the anonymous operational events necessary to evaluate the demo:

- Job started, completed, failed, or rate-limited.
- Completion latency.
- Supported category.
- Title corrected or accepted.
- Outcome status and confidence.
- Accepted evidence count.
- Blibli run success, failure, retry, and estimated usage cost.
Analytics must not include raw images, user-entered free text, credentials, seller identity, or full actor responses.

## 16. Automated Evaluation Plan
The project must contain 30 automated text-input/text-expected behavioral eval cases:
| Category | Share | Cases |
| --- | ---: | ---: |
| Common valuation scenarios | 50% | 15 |
| Edge or ambiguous scenarios | 20% | 6 |
| Not-found or unsupported scenarios | 10% | 3 |
| Tool-result handling scenarios | 10% | 3 |
| Safety and permission scenarios | 10% | 3 |
Requirements:

- Use `exactMatch` only for fixed outputs such as status codes, categories, or confidence labels.
- Use relevancy evaluation for natural-language explanations and behavioral checklists.
- Tool-result cases use text representations of tool results; they test interpretation but do not prove a live actor was invoked.
- Safety cases verify that untrusted content cannot change permissions, pricing logic, or tool limits.
- The suite passes with at least 27 of 30 cases and all three safety/permission cases passing.
Because the harness supports only text input and expected text, these evals do not independently prove image-recognition accuracy, live scraper reliability, or mathematical correctness. Claims about the demo must reflect that limitation.

## 17. MVP Exclusions
- Product categories outside computers, handphones, tablets, gaming consoles, and cameras.
- New products.
- Guaranteed product authentication, ownership verification, safety verification, or physical-condition inspection.
- General-purpose web search or unapproved marketplace actors.
- Marketplace evidence providers other than the approved Blibli actor.
- User-supplied marketplace listing URLs.
- Automatic seller messaging or negotiation.
- Payments, escrow, purchasing, financing, repair estimates, shipping, or delivery.
- User accounts, saved history, and cross-device persistence.
- Multiple uploaded images.
- User feedback prompts.
- English or other interface languages.
- A presentation-only cache or fabricated fallback when live evidence is unavailable.
- Guaranteed listing-price recommendation for every supported product.

## 18. Future Considerations
- Support multiple images to improve identity and condition assessment.
- Expand supported electronic categories and add category-specific structured fields.
- Add approved evidence providers such as OLX or Carousell after reliability and compliance review.
- Accept user-supplied listing links.
- Save valuation history for authenticated users.
- Compare multiple listing-price strategies.
- Track price changes and notify users.
- Generate seller negotiation messages.
- Add structured user feedback and usability research.
- Add English and other languages.
- Build mobile applications or browser extensions.

## 19. Product Principles
> Give individual sellers a useful, evidence-based listing-price recommendation without pretending the AI knows more than it does.

1. **Seller first:** Help individual sellers price second-hand items they own for a balanced sale.
2. **Explain two price views:** Show the median-based suggestion separately from the observed market range.
3. **Require exact identity:** Do not compare materially different variants.
4. **Use current evidence:** Ground prices in approved marketplace listings.
5. **Calculate deterministically:** Keep valuation mathematics outside the language model.
6. **Expose uncertainty:** Show accepted evidence count, confidence, and missing information.
7. **Separate sources:** Distinguish visible observations, user-provided details, marketplace evidence, and unknowns.
8. **Do not claim authenticity or condition:** Image analysis and listing text cannot guarantee either.
9. **Protect privacy:** Minimize image retention and avoid collecting seller personal information.
10. **Fail honestly:** Distinguish unsupported products, missing identity, insufficient evidence, provider failures, and usage limits.
