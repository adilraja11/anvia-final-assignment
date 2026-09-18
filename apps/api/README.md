# AsliSegini? API

This workspace package serves the Hono API. It owns the Prisma-backed `/api/chat` routes and the
local-demo `/api/agents` integration routes. Agent construction and marketplace tools remain in
`@repo/agents`.

## Local agent-stage routes

- `POST /api/agents/image-identification` accepts one multipart `image`, validates and re-encodes
  it, and returns the structured image-identification result.
- `POST /api/agents/valuation` accepts confirmed product identity and second-hand condition, with
  an optional product description. It returns the application-calculated valuation result.

The agent-stage routes currently have no authentication and are intended only for local demo use.
Do not expose them to the public internet. See the [agent API contract](docs/contracts/agent-api.md)
for the complete request and response shapes.

These routes expose agent stages for local integration only. They are not the seller-first,
second-hand-only product API defined by the PRD: that future API must omit asking and original-price
fields, use the fixed Blibli actor once for identity-matched evidence, and return a median-based
suggestion plus a separately labeled observed market range. The local route now implements that
calculation boundary, but authentication, persistent jobs, public rate limits, R2 upload, evidence
persistence, and the browser workflow remain deferred.

## Commands

Run commands from the repository root:

```sh
pnpm dev:api
pnpm --filter @repo/api typecheck
pnpm --filter @repo/api build
```
