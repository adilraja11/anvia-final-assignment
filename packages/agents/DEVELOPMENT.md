# AsliSegini? Agent Development Plan

## Purpose

`packages/agents` is the agent foundation for AsliSegini?, an Indonesian marketplace
price-evaluation product. The current milestone focuses on the second, more complex
valuation agent and its real marketplace integrations. The image-identification agent,
full application workflow, persistent job processing, and final UI integration come later.

All user-facing agent output must use Bahasa Indonesia. Internal identifiers, status codes,
schema values, and tool names may remain in English.

## Milestone scope

Implement and manually validate:

- A standalone product-valuation agent.
- `src/tools/blibli-search.ts`.
- `src/tools/facebook-search.ts`.
- Real Apify integration through `apify-client`.
- Studio registration for the valuation agent and both marketplace tools.
- A Markdown integration guide at `packages/agents/APIFY_INTEGRATION.md`.
- Provider-specific normalization into a common evidence shape inside each tool file; see
  `packages/agents/APIFY_INTEGRATION.md`.
- Tool limits, retries, response validation, URL allowlists, and safe failure envelopes; see
  `packages/agents/APIFY_INTEGRATION.md`.

Do not add separate evidence, valuation, or Apify helper source files in this milestone.
Private helpers may remain inside the two provider tool files. Existing example-agent files
may be rewritten for AsliSegini?; the handbook behavior is no longer the product scope.

## Agent responsibilities

The valuation agent remains independent from the future image-identification agent.

The agent may:

- Validate whether the provided product identity has the required fields.
- Generate normalized marketplace search terms while preserving official brand and model names.
- Call the fixed Blibli and Facebook Marketplace tools when applicable.
- Reference accepted evidence IDs.
- Produce grounded Bahasa Indonesia explanations, pros, and cons.

The agent must not:

- Select actor IDs, endpoints, or arbitrary tools.
- Change result limits, retry counts, proxy settings, or cache policy.
- Invent marketplace listings, prices, URLs, product attributes, or source coverage.
- Calculate quartiles, weighted percentiles, confidence, negotiation targets, or verdicts.
- Treat asking prices as completed-sale prices.

The eventual application-owned workflow is:

1. The agent generates normalized search terms.
2. Guarded application/tool code retrieves marketplace evidence.
3. Application code validates, filters, deduplicates, and calculates the valuation.
4. The agent receives the frozen calculation and accepted evidence and writes the explanation.

The model must never be the authority for final numeric results.

## Product input contract

The valuation input contains:

- Product category: smartphone, laptop, tablet, or gaming console.
- Confirmed price-critical identity.
- Condition: `Baru`, `Seperti baru`, `Baik`, `Cukup`, `Rusak`, or `Tidak diketahui`.
- Seller asking price in IDR.
- Optional listing details such as defects, warranty, repairs, and included accessories.
- Optional city or region.

Required identity fields follow the PRD:

- Smartphone/tablet: brand, exact model, storage, and relevant connectivity variant.
- Laptop: brand/model, CPU, RAM, storage, and dedicated GPU when applicable.
- Console: generation/model, edition, storage, and bundle contents.

Missing price-critical identity must produce `MORE_INFORMATION_REQUIRED`. Unsupported
categories must produce `UNSUPPORTED_CATEGORY`.

## Marketplace tools

Use two separate model-callable tools with fixed actor IDs:

- `blibliSearch` using `fanndev/blibli-product-price-monitor`.
- `facebookMarketplaceSearch` using `curious_coder/facebook-marketplace`.

Both tools accept only this bounded input shape:

```ts
{
  searchTerms: string[]; // 1–5 terms, each 1–160 characters
  condition: Condition;
  evidenceRole?: "CONDITION_COMPARABLE" | "RETAIL_ANCHOR";
  region?: "Indonesia"; // defaults to "Indonesia"
}
```

`Condition` is one of `Baru`, `Seperti baru`, `Baik`, `Cukup`, `Rusak`, or
`Tidak diketahui`. The tools normalize and validate their own inputs with Zod before
calling Apify.

`evidenceRole` defaults to `CONDITION_COMPARABLE`. Such evidence must match the requested
product condition. `RETAIL_ANCHOR` is supported by Blibli only and is a separate new/retail
reference population; it must never be treated as a comparable listing for a used or damaged
product. The tool output includes this role on both the envelope and every evidence record.
Facebook Marketplace rejects `RETAIL_ANCHOR` requests.

The tools must not accept actor IDs, arbitrary URLs, `maxItemsPerQuery`, `maxItems`, pagination,
proxy options, credentials, or raw actor configuration from the model.

### Blibli query guidance

Blibli receives the submitted `searchTerms` without a condition filter. The tested Actor input
uses `fetchProductDetails: false`, `includeOutOfStock: true`, `maxItemsPerQuery: 10`,
`sortBy: "relevance"`, `maxConcurrency: 8`, and Apify Residential proxies in Indonesia. The
Actor response does not provide a listing condition, so its records cannot establish `Seperti
baru`, `Baik`, `Cukup`, or `Rusak` comparability. A successful result with empty `evidence` and
empty `rejected` is an actor-level empty dataset, before local title or availability validation
ran.

For a used or damaged product, call Blibli separately as a `RETAIL_ANCHOR`: use an identity-only
query such as `PS5 Fat Disc`, and retain the user's product condition in the tool input. The
tool labels the available retail results as an anchor; it must not relabel them as condition-
comparable used or damaged evidence.
Call Facebook Marketplace as `CONDITION_COMPARABLE` with a condition-specific first query such
as `PS5 Fat Disc rusak`. Present the resulting populations separately. The current agent may
explain the difference but must not calculate a numeric adjustment, blended estimate, or
verdict from the two roles.

Generate short, title-like search terms and order them by expected usefulness.
`maxItemsPerQuery: 10` caps each submitted Blibli query, so a long list of alternatives can
increase retrieval and validation work. For damaged products, use the core
identity plus a concise damage cue, for example `PS5 Fat Disc rusak`; add `Jepang` only when
that market variant is price-critical. Do not include incidental symptoms such as `safe mode`
or bundle omissions such as `tanpa stik` unless they are essential to the comparison. Every
token of at least one submitted term must occur in an accepted listing title, so terms must be
plausible title fragments rather than full narrative descriptions.

Blibli search results are retrieval candidates, not price evidence by themselves. Broad console
queries commonly include accessories (stands, holders, docks, dust plugs, and console covers)
and empty `dus`/`kardus` listings, while a missing provider condition cannot establish
comparability with `Rusak`.
Reject those records and do not estimate a damaged-item price from the remaining new or
unknown-condition retail listings. Treat `PS5`, `PS 5`, and `PlayStation 5` as the same
identity alias during title matching, while retaining all other price-critical tokens.

Use `APIFY_API_TOKEN` server-side. Actor IDs and limits are constants in code. Never expose
credentials or raw Apify responses to the model, browser, or logs.

### Provider selection

- `Baru`: Blibli only. Treat an `AVAILABLE` Blibli result with no explicit condition as a
  new/retail result for this request, and retain the request context in its normalized condition.
- `Seperti baru`, `Baik`, `Cukup`, `Rusak`: a separate Blibli `RETAIL_ANCHOR` and a
  Facebook Marketplace `CONDITION_COMPARABLE` search.
- `Tidak diketahui`: Facebook Marketplace supplies second-hand `CONDITION_COMPARABLE`
  evidence. Blibli may be called only as a separately labeled `RETAIL_ANCHOR`, never as
  condition-comparable evidence. A future deterministic valuation engine must cap confidence at
  `MEDIUM`; the current agent does not calculate confidence.

## Studio and manual validation

Studio exposes `createValuationAgent` with both marketplace tools and disables production
tracing for local use. The existing handbook support agent is no longer registered by Studio.

The valuation agent uses temperature `0`, `maxTurns: 6`, and `maxTokens: 1,500` so it has
room for tool calls and grounded Indonesian output. `createAgent` always registers both
marketplace tools; web tools are opt-in through `includeWebTools` and are not registered by
Studio.

The product input and final valuation result are currently prompt-level contracts. Runtime
Zod validation is implemented at the marketplace-tool boundary, but there is not yet an
exported product-input schema, deterministic valuation schema, or application-owned workflow
around the agent.

This milestone is complete when the package builds, typechecks, Studio starts, and live manual
tests can run with valid Apify credentials. Manually verify at least:

- A successful Blibli search.
- A successful Facebook Marketplace search.
- A successful empty result.
- A provider failure or malformed response.
- A record rejected for invalid price, URL, status, or condition.

Automated eval cases are intentionally deferred for now. The PRD’s 30-case evaluation gate is a
later milestone and must not be claimed as satisfied by Studio testing.

Provider request defaults, normalization, evidence validation, safety rules, retries, and
the currently implemented process-local caches are documented in
`packages/agents/APIFY_INTEGRATION.md`.

## Deferred work

- Image-identification and supported-product validation agent.
- User confirmation workflow between identification and valuation.
- Deterministic valuation engine and final numeric result schema.
- Asynchronous idempotent jobs, persistent cache, rate limits, and spending circuit breaker.
- R2 image upload/sanitization and application UI integration.
- Automated behavioral eval expansion and release gates.
