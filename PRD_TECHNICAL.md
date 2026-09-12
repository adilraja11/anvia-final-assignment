# AsliSegini? — Product Requirements Document (Part 2 of 2)

[← Part 1: Product Requirements](PRD.md)

## 10. Deterministic Valuation
### 10.1 Separation of responsibilities
- AI may identify, normalize, match, categorize, and explain.
- Application code validates evidence and calculates all prices.
- The model cannot modify the calculation or substitute a price.
- The seller's asking price is never used to calculate the fair-price distribution.
### 10.2 Calculation
1. Begin with listings that pass schema, identity, variant, condition, currency, and duplication checks.
2. Calculate the first and third quartiles (`Q1` and `Q3`) of comparable prices.
3. Calculate `IQR = Q3 - Q1` and remove prices outside `Q1 - 1.5 × IQR` and `Q3 + 1.5 × IQR`.
4. Require at least ten accepted comparables after filtering.
5. When both sources contribute evidence, give each source 50% of the total distribution weight and divide that source's weight equally among its accepted listings. When one source contributes, it receives 100% of the weight.
6. Calculate weighted percentiles from the accepted evidence:
   - Recommended minimum: weighted 25th percentile.
   - Recommended maximum: weighted 75th percentile.
   - Comparable median: weighted 50th percentile.
7. Calculate the negotiation target as the lower of the seller's asking price and the recommended minimum.
8. Round and format all displayed values consistently as Indonesian rupiah.
### 10.3 Confidence
- `HIGH`: at least ten accepted comparables, including at least three from Tokopedia and three from Facebook Marketplace.
- `MEDIUM`: at least ten accepted comparables, but the `HIGH` cross-source requirement is not met.
- `INSUFFICIENT_EVIDENCE`: fewer than ten accepted comparables remain after filtering.
An item with condition `Tidak diketahui` cannot receive `HIGH` confidence.
The UI explains the evidence count and source coverage behind the confidence level.
### 10.4 Verdict

| Condition | Internal verdict | Bahasa Indonesia label |
| --- | --- | --- |
| Asking price below the recommended minimum | `GREAT_PRICE` | Harga bagus |
| Asking price within the recommended range | `FAIR_PRICE` | Harga wajar |
| Asking price above the recommended maximum | `ABOVE_MARKET` | Di atas harga pasar |
The MVP does not add a special warning, safety flag, or alternate verdict solely because an asking price is far below the comparable median.

## 11. Results Screen
A successful result displays:

- Confirmed product identity and condition.
- Seller's asking price.
- Recommended minimum and maximum item price.
- Negotiation target.
- Verdict.
- Confidence level and its reason.
- A grounded explanation of the valuation.
- Relevant pros and cons.
- The statement **"Estimasi hanya mencakup harga barang."**
- A limitation notice that the result does not verify authenticity, ownership, safety, or hidden physical condition.
### 11.1 Evidence transparency
The evidence section displays:

- Total accepted comparable count.
- Accepted count from each marketplace.
- Evidence retrieval timestamp in Indonesian local time.
- Three to five representative accepted listings.
- Marketplace, listing title, item price, condition, and city when available.
- A direct link to the original listing.
- A notice that displayed marketplace prices are asking prices unless a completed-sale status was verified.
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
- If one provider fails but at least ten accepted comparables remain, return `MEDIUM` confidence.
- If both providers fail, return `SERVICE_FAILURE`, not `INSUFFICIENT_EVIDENCE`.
- If providers succeed but fewer than ten comparables remain, return `INSUFFICIENT_EVIDENCE`.
- Malformed responses and timeouts never become pricing evidence.

## 13. Cost and Abuse Controls
The MVP is freely accessible without authentication, subject to these controls:

- Maximum of five valuations per anonymous user or client per day.
- No paid actor run before the user confirms identity, condition, and asking price.
- Maximum of two normal actor runs and one retry per failed actor per valuation.
- Maximum result count of 30 per actor.
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
- The agent may call only the two approved actor integrations.
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
- Accepted evidence count and source coverage.
- Actor success, failure, retry, and estimated usage cost.
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
- Product categories outside smartphones, laptops, tablets, and gaming consoles.
- Guaranteed product authentication, ownership verification, safety verification, or physical-condition inspection.
- General-purpose web search or unapproved marketplace actors.
- More than the two approved marketplace evidence providers.
- User-supplied marketplace listing URLs.
- Automatic seller messaging or negotiation.
- Payments, escrow, purchasing, financing, repair estimates, shipping, or delivery.
- User accounts, saved history, and cross-device persistence.
- Multiple uploaded images.
- User feedback prompts.
- English or other interface languages.
- A presentation-only cache or fabricated fallback when live evidence is unavailable.
- Guaranteed valuation for every supported product.

## 18. Future Considerations
- Support multiple images to improve identity and condition assessment.
- Expand supported electronic categories and add category-specific structured fields.
- Add approved evidence providers such as OLX or Carousell after reliability and compliance review.
- Accept user-supplied listing links.
- Save valuation history for authenticated users.
- Compare multiple target listings.
- Track price changes and notify users.
- Generate seller negotiation messages.
- Add structured user feedback and usability research.
- Add English and other languages.
- Build mobile applications or browser extensions.

## 19. Product Principles
> Give buyers a useful, evidence-based price range without pretending the AI knows more than it does.

1. **Buyer first:** Help buyers evaluate and negotiate purchases.
2. **Use ranges:** Avoid false precision.
3. **Require exact identity:** Do not compare materially different variants.
4. **Use current evidence:** Ground prices in approved marketplace listings.
5. **Calculate deterministically:** Keep valuation mathematics outside the language model.
6. **Expose uncertainty:** Show evidence count, source coverage, confidence, and missing information.
7. **Separate sources:** Distinguish visible observations, user-provided details, marketplace evidence, and unknowns.
8. **Do not claim authenticity or condition:** Image analysis and listing text cannot guarantee either.
9. **Protect privacy:** Minimize image retention and avoid collecting seller personal information.
10. **Fail honestly:** Distinguish unsupported products, missing identity, insufficient evidence, provider failures, and usage limits.
