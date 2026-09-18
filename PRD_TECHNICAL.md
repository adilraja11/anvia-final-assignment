# AsliSegini? — Product Requirements Document (Part 2 of 2)

[← Part 1: Product Requirements](PRD.md)

This document specifies the intended valuation contract; it does not assert that the current client-only mock or legacy API/agent stages implement it.

## 10. Deterministic Valuation
### 10.1 Separation of responsibilities
- AI may identify, normalize, match, categorize, and explain.
- Application code validates evidence and calculates all prices.
- The model cannot modify the calculation or substitute a price.
- The seller does not supply a target, asking, or original price. The application derives its new-reference price and market evidence from Blibli.
### 10.2 Calculation
1. Split validated Blibli evidence into an explicitly new `new_reference` set and an explicitly used `used_market` set. Both sets must pass schema, exact identity, price, currency, lifecycle, and duplication checks. The used set is condition-agnostic: it does not require a listing condition comparable to the submitted item.
2. For each set with at least four records, calculate `Q1`, `Q3`, and `IQR = Q3 - Q1`; remove prices outside `Q1 - 1.5 × IQR` and `Q3 + 1.5 × IQR`. Do not apply IQR exclusion to a three-record `new_reference` set.
3. Require at least three accepted new-reference listings and at least five accepted used-market listings after filtering.
4. Calculate `P₀` as the median price of the accepted new-reference set. `P₀` is an unverified Blibli new-price reference, not an official or historical original price.
5. Calculate `t` in years. The seller may optionally supply exactly one of: a purchase month/year or an approximate age band. A purchase month/year is converted to complete elapsed months at valuation time and divided by 12; it must resolve to an age from zero through 240 whole months. Age bands map to fixed month values: `<6 bulan = 3`, `6–12 bulan = 9`, `1–2 tahun = 18`, `2–3 tahun = 30`, `3–5 tahun = 48`, and `>5 tahun = 72`. When no age input is supplied, use the versioned category default: computer `24` months, gaming console `24`, handphone `18`, tablet `24`, and camera `36`.
6. Select the versioned, application-owned annual depreciation rate `d`: computer `0.25`, gaming console `0.20`, handphone `0.35`, tablet `0.30`, and camera `0.20`. AI cannot select or alter a rate.
7. Select the deterministic condition multiplier `C`: `Seperti baru = 0.95`, `Baik = 0.825`, `Cukup = 0.675`, and `Rusak = 0.50`. A missing or unknown condition returns `MORE_INFORMATION_REQUIRED`.
8. Calculate the pre-market baseline: `B = P₀ × (1 − d)^t × C`.
9. Calculate the advertised-market adjustment: `M = clamp(median(used_market.price_idr) / B, 0.85, 1.15)`. Record the unclamped and applied values. `M` is an advertised-market proxy, not a completed-sales or demand measurement.
10. Calculate the suggested price: `Price_suggested = P₀ × (1 − d)^t × C × M × L`, where `L = 1.0` for this MVP. The liquidity/urgency factor is not a seller input.
11. Calculate the observed market range as the unweighted P25–P75 range of accepted used-market prices. It is a condition-agnostic current Blibli market range and does not represent the submitted item's condition.
12. Round every displayed price using deterministic half-up rounding to the nearest Rp1.000.
### 10.3 Confidence
- `HIGH`: at least three accepted new-reference listings and at least 15 accepted used-market listings.
- `MEDIUM`: at least three accepted new-reference listings and five through 14 accepted used-market listings.
- `INSUFFICIENT_EVIDENCE`: fewer than three accepted new-reference listings or fewer than five accepted used-market listings remain after filtering.
- A valuation using a category-default age cannot receive `HIGH` confidence.
The UI explains both evidence counts, whether it used a supplied or default age, and the single-source limitation behind the confidence level.
## 11. Results Screen
A successful result displays:

- Confirmed product identity and condition.
- Condition-adjusted suggested listing price.
- An observed market range labeled **"Rentang harga pasar saat ini di Blibli (berbagai kondisi)"**.
- Confidence level and its reason.
- A grounded explanation of the listing-price recommendation.
- Relevant pros and cons.
- The statement **"Estimasi hanya mencakup harga barang."**
- A limitation notice that the result does not verify authenticity, ownership, safety, or hidden physical condition.
- A disclosure that **"Harga referensi barang baru dari Blibli"** is an advertised reference, not an official or historical original price.
### 11.1 Evidence transparency
The evidence section displays:

- Accepted new-reference and used-market counts.
- Evidence retrieval timestamp in Indonesian local time.
- Three to five representative accepted listings.
- Marketplace, evidence purpose, listing title, item price, condition, and city when available.
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
- If Blibli succeeds but fewer than three new references or five used-market listings remain, return `INSUFFICIENT_EVIDENCE`.
- Malformed responses and timeouts never become pricing evidence.

## 13. Cost and Abuse Controls
The MVP is freely accessible without authentication, subject to these controls:

- Maximum of five valuations per anonymous user or client per day.
- No paid actor run before the user confirms identity and condition.
- Maximum of two normal Blibli actor runs, one `new_reference` and one `used_market`, plus one retry per failed purpose per valuation.
- Maximum of three query variants per purpose and ten results per query, for at most 30 results per purpose.
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
- The agent may call only the approved Blibli actor integration for the two fixed retrieval purposes.
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
- Accepted new-reference and used-market evidence counts.
- Blibli purpose success, failure, retry, and estimated usage cost.
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
2. **Explain two price views:** Show a condition-adjusted suggestion separately from the mixed-condition observed market range.
3. **Require exact identity:** Do not compare materially different variants.
4. **Use current evidence:** Ground prices in approved marketplace listings.
5. **Calculate deterministically:** Keep valuation mathematics outside the language model.
6. **Expose uncertainty:** Show new-reference and used-market evidence counts, confidence, and missing information.
7. **Separate sources:** Distinguish visible observations, user-provided details, marketplace evidence, and unknowns.
8. **Do not claim authenticity or condition:** Image analysis and listing text cannot guarantee either.
9. **Protect privacy:** Minimize image retention and avoid collecting seller personal information.
10. **Fail honestly:** Distinguish unsupported products, missing identity, insufficient evidence, provider failures, and usage limits.
