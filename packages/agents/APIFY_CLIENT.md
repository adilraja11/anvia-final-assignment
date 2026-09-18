# Apify JavaScript Client Setup

This guide covers the server-only `apify-client` setup for the intended Blibli valuation
integration. Provider request, normalization, validation, and failure rules are in
[APIFY_INTEGRATION.md](APIFY_INTEGRATION.md). The package exposes only the fixed-purpose Blibli
search boundary for valuation.

## Install and credentials

From the repository root:

```bash
pnpm --filter @repo/agents add apify-client
```

Keep the token in the uncommitted repository-root `.env` only:

```dotenv
APIFY_API_TOKEN=your-token-from-apify-console
```

Never put it in `.env.example`, source, fixtures, prompts, Studio output, logs, docs, or any agent
response. The client is imported only by server-side tool code.

## Client boundary

The Blibli tool creates its client privately with the bounded settings:

```ts
const client = new ApifyClient({
	token,
	maxRetries: 1,
	minDelayBetweenRetriesMillis: 500,
	timeoutSecs: 360,
});
client.logger.setLevel(client.logger.LEVELS.OFF);
```

Actor IDs and inputs remain in the provider modules. Calls disable Actor log streaming with
`log: null`. The tool reads only the bounded dataset, validates every item as `unknown`, and
discards the raw payload before returning normalized evidence.

The provider boundary can make one additional Actor call after a non-configuration failure. It
does not retry records rejected by validation. A successful empty dataset is a successful result;
configuration, network, timeout, Apify, malformed-response, and missing-dataset failures remain
`PROVIDER_FAILURE`.

## Verification

Run without printing the token or raw provider response:

```bash
pnpm --filter @repo/agents typecheck
pnpm --filter @repo/agents build
```

With valid configuration, manually verify a successful result, a successful empty result, a
provider failure, one retry, invalid IDR/URL/status records, exact identity and explicit lifecycle
validation, condition-agnostic used-market acceptance, and the ten-results-per-query limit. Do not
expose the provider output in issue reports or traces.
