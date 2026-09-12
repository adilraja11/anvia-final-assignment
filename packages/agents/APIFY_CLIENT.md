# Apify JavaScript Client Setup

This guide explains how to integrate `apify-client` into `packages/agents`. Provider-specific
Actor inputs, normalization, validation, and safety rules are in
`packages/agents/APIFY_INTEGRATION.md`.

## 1. Install the package

Run this from the repository root:

```bash
pnpm --filter @repo/agents add apify-client
```

The package should be recorded in `packages/agents/package.json`. Verify the workspace lockfile
is updated, then run `pnpm --filter @repo/agents typecheck`.

## 2. Configure authentication

Create or update the repository-root, uncommitted `.env` file:

```dotenv
APIFY_API_TOKEN=your-token-from-apify-console
```

The token is available from the Integrations section of Apify Console. Do not hard-code it or
add it to `.env.example`, source files, test fixtures, Studio output, or error messages.

The repository's root `pnpm studio`, `pnpm build`, and `pnpm typecheck` scripts load this file
with `dotenv-cli`. Direct package commands require `APIFY_API_TOKEN` to already be exported.
The official JavaScript client supports Node.js and TypeScript, provides typed resource
clients, and handles API retries. Use it only in server-side tool code; the API token must
never reach an agent response or browser bundle.

## 3. Create the server-side client in each provider tool

The current implementation keeps the client factory private in both
`src/tools/tokopedia-search.ts` and `src/tools/facebook-search.ts`. There is no shared
`src/providers/apify.ts` module yet, so both factories must retain the same configuration:

```ts
import { ApifyClient } from "apify-client";

function getClient() {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new ProviderBoundaryError("CONFIGURATION");

  return new ApifyClient({
    token,
    maxRetries: 1,
    minDelayBetweenRetriesMillis: 500,
    timeoutSecs: 360,
  });
}
```

The client’s default is up to eight retries with exponential backoff. `maxRetries: 1` keeps
the client-level retry bound explicit. The tools additionally make at most one retry at their
Actor-call boundary for non-configuration failures. Keep the token lookup and client code out
of browser-facing code.

## 4. Run an Actor and read its dataset

Keep Actor IDs and input defaults in the provider tool, never in model-controlled arguments:

```ts
const client = getClient();
const run = await client.actor("abotapi/tokopedia-scraper").call({
  mode: "search",
  searchTerms,
  maxPages: 5,
  maxItems: 10,
  // Include the remaining enforced provider defaults here.
});

const { items } = await client
  .dataset(run.defaultDatasetId)
  .listItems({ limit: 10 });
```

For Facebook Marketplace, the fixed call uses a single Indonesia Marketplace `startUrls`
entry, `resultsLimit: 10`, the documented provider defaults, and a second call argument of
`{ maxItems: 10 }`. `call()` waits for the Actor run to finish and returns its run object;
`defaultDatasetId` identifies the output dataset. Treat `items` as untrusted `unknown` data:
validate the top-level response and every record, normalize only approved fields, and discard
the raw payload before returning the tool result.

## 5. Handle failures at the tool boundary

Catch `ApifyApiError` and network, timeout, malformed-response, or missing-dataset failures.
The current tools also classify unexpected errors as `UNKNOWN`. Log only a bounded
machine-readable error category and provider name. Return a `PROVIDER_FAILURE` envelope, not
pricing evidence and not `INSUFFICIENT_EVIDENCE`. Do not retry records rejected during
validation. A successful run with zero valid records remains a successful empty search.

Request at most 10 dataset items per actor. If a future flow needs more, use the client’s paginated
`listItems()` iterator only after changing the tool contract, budget, and validation tests.

## 6. Run locally

With `APIFY_API_TOKEN` available, build and typecheck the package, then start Studio from the
repository root:

```bash
pnpm --filter @repo/agents build
pnpm --filter @repo/agents typecheck
pnpm studio
```

Manually verify a successful response, a successful empty response, a provider failure, and
invalid records. Never paste the token or raw Actor response into issue reports.

The instructions follow Apify’s [JavaScript client overview](https://docs.apify.com/api/client/js/docs),
[quick start](https://docs.apify.com/api/client/js/docs/introduction/quick-start),
[usage patterns](https://docs.apify.com/api/client/js/docs/concepts/usage-patterns),
[error handling and retries](https://docs.apify.com/api/client/js/docs/concepts/error-handling),
and [pagination](https://docs.apify.com/api/client/js/docs/concepts/pagination).
