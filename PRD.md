# AsliSegini? — Product Requirements Document (Part 1 of 2)

[Part 2: Valuation and Operations](PRD_TECHNICAL.md)

## 1. Document Context
This document defines the requirements for a two-week demo MVP. The goal is to demonstrate a complete, evidence-grounded valuation workflow; it is not a claim of production readiness or production-grade market accuracy.
The product interface and generated responses will use Bahasa Indonesia. Internal status codes and technical identifiers may remain in English.
This is the intended product contract. The current client-only mock and legacy API/agent stages do not yet implement every requirement in this document and must not be presented as if they do.

## 2. Product Summary
AsliSegini? is an AI-assisted listing-price evaluator for people in Indonesia selling second-hand consumer electronics that they own on an online marketplace. The MVP is intended for individual sellers, not stores, resellers, or professional refurbishers. It does not verify ownership. A user uploads a product image, confirms the product identity and condition, and optionally provides listing details, age information, and a city or region.
The application retrieves current Blibli evidence in separate new-reference and used-market sets, filters it for relevance, and uses deterministic application logic to produce:

- An evidence-based listing-price range.
- A suggested listing price for a balanced sale.
- A confidence level.
- A grounded explanation and relevant pros and cons.
- A transparent summary of the marketplace evidence used.
The AI may identify products, normalize search terms, filter evidence, and explain results. It must not invent marketplace evidence or determine the final price mathematically.

## 3. Problem Statement
Individual sellers often cannot tell what price to list a second-hand electronic product for. Prices vary materially by exact model, specification, condition, warranty, included accessories, defects, and location. Manually finding and comparing equivalent listings is slow, and superficially similar products may have very different values.
AsliSegini? reduces that effort by combining image-assisted identification, user-confirmed product details, current comparable listings, and a deterministic valuation method. When the product cannot be identified precisely enough or there is not enough usable evidence, the application must refuse to recommend a listing price rather than guess.

## 4. Goals and Success Criteria
### 4.1 MVP goals
- Demonstrate an end-to-end listing-price recommendation flow for supported second-hand electronics.
- Ground every price result in current Blibli listings.
- Make uncertainty and evidence coverage visible.
- Prevent the AI from inventing prices, sources, product details, or tool results.
- Keep the anonymous public demo within explicit storage, latency, and paid-tool limits.
### 4.2 Demo success criteria
- At least 80% of valid, supported submissions finish within 90 seconds.
- Fewer than 5% of submissions end in `SERVICE_FAILURE`.
- Completion, unsupported-category, insufficient-evidence, title-correction, new-reference and used-market evidence counts, and latency metrics can be measured by category.
- No confirmed case invents a marketplace source or price.
- At least 27 of 30 automated evaluation cases pass.
- All safety and permission evaluation cases pass; any failure in this category blocks demo readiness.
The MVP will not include a user feedback prompt or claim that automated evals prove production-level usefulness or accuracy.

## 5. Target Users
The primary users are people in Indonesia who want to sell a supported second-hand electronic product that they own through an online marketplace. They may be unfamiliar with the product's current value and want a quick, evidence-based reference before creating a listing. The MVP is not intended for stores, resellers, or professional refurbishers, and it does not verify that a seller owns an item.
Typical needs include:

- Choosing a defensible listing price and price range.
- Understanding the evidence, age assumption, condition, and market adjustment behind the suggested listing price.
- Understanding which product and listing details materially affect the comparison.
- Seeing the evidence and limitations behind the estimate.

## 6. MVP Scope
### 6.1 Supported categories
The MVP supports only second-hand:

- Computers, including laptops, desktop PCs, and all-in-ones.
- Handphones.
- Tablets.
- Gaming consoles.
- Cameras.
The MVP explicitly rejects:

- New products.
- Components and accessories.
- TVs and monitors.
- Audio equipment.
- Home appliances.
- Repair-only or parts-only listings.
- Bundles containing multiple primary products.
- Any other category not listed as supported.
Unsupported products return `UNSUPPORTED_CATEGORY`; the application must not attempt a generic low-confidence valuation.
### 6.2 Minimum product identity
Paid marketplace searches must not begin until the user confirms the minimum price-critical identity:

- Handphone or tablet: brand, exact model, storage capacity, and connectivity variant when relevant.
- Computer: form factor, brand/model, CPU, RAM, storage, dedicated GPU when applicable, and included display or peripherals when those affect the price.
- Gaming console: generation/model, edition such as digital or disc, storage, and bundle contents.
- Camera: body brand/model and whether a lens is included; included lens, bundle, and other price-critical details when applicable.
The AI proposes these values from the uploaded image and user text. The user can correct them through the editable product title and details. If a required value remains unknown, return `MORE_INFORMATION_REQUIRED` and explain what must be added.
### 6.3 Price scope
The recommendation covers the item price only. It excludes:

- Shipping or delivery.
- Marketplace or payment-service fees.
- Personalized vouchers and payment-method promotions.
- Future repair costs.
Accessories are included only when equivalent accessories are present in both the submitted item and its comparable listing. The results screen must state: **"Estimasi hanya mencakup harga barang."**

## 7. User Experience
### 7.1 Primary flow
1. The user uploads exactly one product image.
2. The system validates and sanitizes the image.
3. AI determines whether the image contains a supported, identifiable product.
4. AI generates an editable product title and proposed price-critical identity.
5. The user confirms or corrects the identity.
6. The user selects a required condition: `Seperti baru`, `Baik`, `Cukup`, or `Rusak`.
7. The user optionally selects either a purchase month/year or an approximate age band. If neither is supplied, the application applies and discloses a category default age.
8. The user optionally adds listing details such as defects, warranty, repairs, and included accessories.
9. The user optionally enters the city or region where they intend to list the item.
10. The application confirms that minimum identity requirements are satisfied.
11. The user starts the analysis.
12. The application creates one idempotent valuation job and displays progress.
13. The application retrieves, validates, and filters marketplace evidence.
14. Deterministic application code calculates the result.
15. AI produces a Bahasa Indonesia explanation grounded in the calculated result and accepted evidence.
16. The results screen displays the listing-price recommendation, confidence, evidence summary, and applicable limitations.
### 7.2 Progress states
The interface displays these localized stages:

- Identifying product: **"Mengidentifikasi produk"**.
- Finding comparables: **"Mencari produk pembanding"**.
- Calculating price: **"Menghitung estimasi harga"**.
- Preparing explanation: **"Menyiapkan penjelasan"**.
Refreshing the page or double-clicking the submission control must reuse the existing job rather than start duplicate paid actor runs.
### 7.3 Outcome statuses
The following internal statuses are distinct and must not be collapsed into a generic error:

| Internal status | Bahasa Indonesia presentation | Meaning |
| --- | --- | --- |
| `VALUATED` | Result and recommendation | A deterministic listing-price recommendation was produced. |
| `UNSUPPORTED_CATEGORY` | Kategori produk belum didukung | The product is outside the five supported categories or is not second-hand. |
| `MORE_INFORMATION_REQUIRED` | Informasi produk perlu dilengkapi | A price-critical identity field is missing. |
| `INSUFFICIENT_EVIDENCE` | Bukti harga belum cukup | Blibli worked, but fewer than three usable new references or fewer than five usable used-market listings remained. |
| `SERVICE_FAILURE` | Layanan sedang bermasalah | Blibli failed after its bounded retry or the valuation job could not complete. |
| `RATE_LIMITED` | Batas penggunaan tercapai | A user or global usage limit prevented a new paid run. |

## 8. Image Upload and Storage
### 8.1 Upload acceptance criteria
- Exactly one image per valuation.
- JPEG, PNG, or WebP only.
- Maximum file size of 10 MB.
- Minimum dimensions of 300 × 300 pixels.
- Maximum decoded size of 25 megapixels.
- Animated images are rejected.
- Validation uses file signatures and successful decoding, not only filename extensions or declared MIME types.
- Accepted images are re-encoded during sanitization.
- Object keys are random and never use the original filename.
- Validation errors are shown in Bahasa Indonesia.
### 8.2 R2 quarantine and sanitization flow
1. The server creates a short-lived presigned `PUT` URL for one random object key in a private Cloudflare R2 `quarantine/` prefix.
2. The browser uploads directly to that object.
3. The backend validates the actual file type, size, dimensions, and decodability.
4. The backend re-encodes the image to remove EXIF and other metadata.
5. The sanitized image is stored under a separate random key.
6. The quarantined original is deleted immediately.
7. AI receives access only to the sanitized image through short-lived, scoped access.
8. The sanitized image is deleted after analysis and no later than 24 hours by application-controlled cleanup.
9. A one-day R2 lifecycle rule acts as a cleanup backstop, not as the sole deletion mechanism.
The R2 bucket must remain private. Presigned URLs are treated as bearer credentials and must be short-lived, operation-specific, and object-specific. CORS permits only the required methods, headers, and application origins.

## 9. Marketplace Evidence
### 9.1 Approved evidence provider
The MVP uses only `fanndev/blibli-product-price-monitor`. It may perform a maximum of two normal actor runs per valuation, one for each fixed application-owned purpose:

1. `new_reference`, which finds explicitly new identity-matched Blibli listings for the retail reference price (`P₀`).
2. `used_market`, which finds explicitly used identity-matched Blibli listings for the market adjustment and observed market range.

Blibli is approved as a source of pricing evidence only; AsliSegini? does not publish a listing and its recommendation may be used on any Indonesian online marketplace. All evidence represents advertised asking prices. The system must not describe them as official prices, historical original prices, or completed transactions.
Marketplace data collection is limited to publicly visible listing data obtained through approved third-party providers and remains subject to legal, terms-of-service, privacy, and data-retention review. Use of Apify alone must not be described as marketplace authorization.
### 9.2 Evidence retrieval
- AI generates normalized Bahasa Indonesia search terms while preserving official brand and model names.
- The application, not the model, selects the fixed actor ID, retrieval purpose, lifecycle terms, and parameters.
- An optional city or region is used to prefer geographically relevant evidence. If it is omitted, the search is nationwide.
- If too few local results are available, nationwide evidence may be used and the wider coverage must be disclosed.
- Location affects evidence selection only; the AI must not invent a regional price adjustment.
- Each purpose may use at most three application-owned normalized query variants. `MAX_ITEMS_PER_QUERY` is always 10, so each purpose returns no more than 30 records before validation.
- Each failed purpose may be retried once within the job time budget.
- Successful evidence is cached for six hours by purpose, normalized product identity, and region.
- A normal in-date cache hit may be reused to avoid a duplicate paid run.
- Expired cache data is not used as a hidden fallback when Blibli fails.
- The live presentation does not substitute hard-coded or fabricated marketplace prices.
### 9.3 Normalized evidence schema
Every comparable considered by the valuation engine uses this normalized structure:
```text
source
purpose
listing_id
listing_url
title
price_idr
condition
lifecycle
city
seller_type
product_attributes
listing_status
posted_at
scraped_at
match_score
exclusion_reason
```
Seller names, profile links, phone numbers, and other unnecessary personal information are not stored.
### 9.4 Validation and filtering
Before valuation, the application must:

- Validate actor output against a strict schema.
- Accept only numeric IDR item prices.
- Accept evidence links only from approved Blibli domains.
- Reject accessories, components, repair-only products, and unrelated listings.
- Reject wrong models, material specification mismatches, and irrelevant bundles.
- Reject misleading minimum variant prices when the matched variant has another price.
- Reject duplicates across repeated queries and purposes.
- Require the confirmed brand, exact model, and every price-critical variant after safe normalization. A similar product family, incompatible variant, or ambiguous model is not evidence.
- Use title and normalized attributes as the primary identity evidence. Bounded product-detail descriptions may corroborate a match but cannot override a missing or contradictory identity field.
- Include a listing only when its lifecycle is explicit: new listings belong only to `new_reference`; used listings belong only to `used_market`. Exclude all unclear lifecycle records with `LIFECYCLE_UNCLASSIFIED`.
- Do not reject an explicitly used listing merely because its condition category differs from the submitted item. Submitted condition affects the deterministic condition multiplier only.
- Remove statistical price outliers after identity and lifecycle filtering.
- Preserve a machine-readable exclusion reason for every rejected result.
User text and scraped content are untrusted data. Instructions embedded in titles or descriptions must never change system behavior, actor selection, tool limits, or the valuation formula.
