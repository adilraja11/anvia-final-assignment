# AsliSegini? API

This workspace package serves the Hono API. It owns the Prisma-backed `/api/chat` routes and the
local-demo `/api/agents` integration routes. Agent construction and marketplace tools remain in
`@repo/agents`.

## Agent-stage routes

- `POST /api/agents/image-identification` accepts one multipart `image`, validates and re-encodes
  it, and returns the structured image-identification result.
- `POST /api/agents/valuation` accepts a strict four-field product JSON request and returns the
  structured valuation-agent result.

The agent-stage routes currently have no authentication and are intended only for local demo use.
Do not expose them to the public internet. See the [agent API contract](docs/contracts/agent-api.md)
for the complete request and response shapes.

These routes expose agent stages for local integration. A valuation agent `SUCCESS` is not a final
`VALUATED` result: deterministic pricing, authentication, persistent jobs, public rate limits, R2
upload, and the browser workflow remain deferred.

## Commands

Run commands from the repository root:

```sh
pnpm dev:api
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api build
```
