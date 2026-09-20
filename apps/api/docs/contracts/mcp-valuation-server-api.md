# MCP valuation server API contract

Status: proposed MVP. The production website is live, but the public MCP endpoint is not yet
implemented.

## Purpose and boundary

Expose AsliSegini? valuation as a small remote MCP server so ChatGPT, Claude, and other compatible
clients can start a valuation and read its result. The server is an `apps/api` concern. It calls the
existing valuation service and worker; it does not expose an Anvia MCP client, the Blibli actor,
raw provider data, agent prompts, or deterministic calculation internals.

The public endpoint is a stable HTTPS Streamable HTTP route, normally:

```text
https://asli-segini.my.id/mcp
```

The MVP supports MCP initialization, tool discovery, and tool calls only. It does not publish MCP
resources, prompts, a custom UI, image uploads, or a general-purpose chat tool.

## MVP caller model

The MVP does not add end-user account linking or OAuth. The MCP route uses one server-configured
`MCP_MVP_OWNER_KEY` when it invokes the existing owner-scoped valuation service. This is an
implementation detail and is never returned to clients. A later account-linked release must define
its own authorization and data-isolation contract rather than changing this one implicitly.

The same existing global valuation usage limit applies. The route must not depend on browser
cookies, browser `Origin` headers, or browser streaming formats.

## Public tools

Tool names, input fields, and structured result fields are public compatibility contracts. Additive
changes are preferred; do not rename or repurpose a published tool or field.

### `start_valuation`

Create or reuse one asynchronous valuation. It returns quickly after persisting and queuing the
request; it never waits for the Blibli actor or model run to finish.

Input:

```json
{
	"productName": "PlayStation 5 Slim Disc Edition 1 TB",
	"productCondition": "Seperti baru",
	"productDescription": "Original tanpa game, kelengkapan fullset, kondisi normal.",
	"idempotencyKey": "mcp-request-20260920-001"
}
```

- `productName` is required, trimmed, and 1–160 characters.
- `productCondition` is required and one of `Seperti baru`, `Baik`, `Cukup`, or `Rusak`.
- `productDescription` is optional and, when present, trimmed and 1–2,000 characters.
- `idempotencyKey` is optional and follows the existing valuation idempotency format of 16–128
  printable ASCII characters. An exact replay returns the original valuation; reuse with different
  product fields is an error.
- Unknown fields, asking/target/original prices, URLs, model/provider/tool controls, and arbitrary
  instruction fields are rejected.

Success returns structured content equivalent to:

```json
{
	"valuation": {
		"id": "cm123example",
		"state": "QUEUED",
		"stage": "QUEUED",
		"createdAt": "2026-09-20T04:00:00.000Z",
		"expiresAt": "2026-09-21T04:00:00.000Z",
		"pollAfterMs": 1000
	}
}
```

The human-readable text tells the client to call `get_valuation` with the returned ID after
`pollAfterMs`. The MCP server must generate a safe Indonesian summary as well as structured
content; clients must not need to parse prose for the ID or status.

### `get_valuation`

Read one valuation previously returned by `start_valuation`.

Input:

```json
{ "valuationId": "cm123example" }
```

While work is pending, success returns the safe status projection:

```json
{
	"valuation": {
		"id": "cm123example",
		"state": "RUNNING",
		"stage": "FINDING_COMPARABLES",
		"pollAfterMs": 1000
	},
	"result": null
}
```

For a terminal `VALUATED` result, return the same approved fields as the valuation workflow API:
product identity and condition, integer IDR suggested price, observed market range, confidence,
accepted comparable count, evidence coverage, retrieval timestamp, Indonesian explanation,
pros/cons, and limitations. Other terminal statuses return their safe explanation and, only where
applicable, `missingFields` or accepted comparable count. Never return raw agent/tool/provider
responses, rejected evidence, seller data, credentials, or stack traces.

## Result and error rules

- JSON field names, tool names, status values, timestamps, and money representation follow the
  valuation workflow API contract. User-facing text is Bahasa Indonesia.
- A valid asynchronous valuation is a successful tool result, including while it is queued or
  running. Do not represent pending work as an MCP transport failure.
- Invalid tool input, idempotency conflict, unknown or expired valuation, rate limiting, and service
  unavailability are MCP tool errors with a stable machine-readable code and safe Indonesian
  message. The implementation may additionally map them to appropriate HTTP status codes.
- A failed provider/model/queue run is a terminal valuation result with `SERVICE_FAILURE`, not a
  raw MCP exception.
- Tool descriptions and output schemas must state that the server produces an estimate from Blibli
  advertised asking prices, not an official, original, or completed-sale price.

## Valuation invariants

- The product scope remains individual second-hand computers, handphones, tablets, gaming consoles,
  and cameras.
- The application validates accepted evidence and calculates every numeric result. AI may only
  normalize, match, and explain.
- A run reaches the existing worker through the existing queue and may perform at most one live
  Blibli actor run. `start_valuation` must not invoke provider/model code inline.
- `get_valuation` performs no provider, model, queue, or calculation work.
- The MCP route returns `Cache-Control: no-store`, enforces request-size and rate limits, and logs
  only safe operational metadata.

## Related contracts

The input, lifecycle, and public valuation result are refined by the
[valuation workflow API contract](valuation-workflow-api.md). Delivery sequencing is in the
[MCP valuation server plan](../../../../packages/agents/docs/plans/mcp-valuation-server.md).
