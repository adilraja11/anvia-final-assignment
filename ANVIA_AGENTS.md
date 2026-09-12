# Anvia Agents, Tools, and MCP

> Current stable v1 implementation context for coding agents. Updated 2026-08-27.

Anvia is a provider-neutral TypeScript runtime. The host application owns authentication,
authorization, tenant scope, business services, persistence policy, deployment, and the response
shown to users.

## Install and create an agent

```sh
pnpm add @anvia/core @anvia/openai
```

```ts
import { Agent } from '@anvia/core'
import { OpenAIClient } from '@anvia/openai'

const client = new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY! })
const model = client.completionModel({ modelId: 'gpt-5.6-sol', api: 'responses' })

const agent = new Agent({
  id: 'support',
  model,
  instructions: 'Answer clearly and use tools before making account-specific claims.',
  maxTurns: 4,
})

const result = await agent.generate({ prompt: 'How can I reset my password?' })
if (result.type === 'response') console.log(result.output)
```

The v1 API uses `new Agent({...})` and direct `generate()` or `stream()` calls. `generate()` returns
an explicit `response | interaction | blocked` outcome. `AgentBuilder`, `prompt().send()`, and other
builder-era APIs are not part of the v1 public surface.

## Typed tools

```ts
import { createTool } from '@anvia/core'
import { z } from 'zod'

const refundOrder = createTool({
  name: 'refund_order',
  description: 'Refund an eligible order.',
  inputSchema: z.object({ orderId: z.string() }),
  requiresApproval: ({ orderId }) => ({ reason: `Approve refund for ${orderId}` }),
  execute: async ({ orderId }) => billing.refund(orderId),
})
```

Schemas validate data shape, not caller authority. Authenticate and authorize in application code
and recheck current permissions inside side-effecting handlers.

When approval is required, the run returns an interaction before execution:

```ts
let result = await agent.generate({ prompt: 'Refund order A-100.' })

if (result.type === 'interaction' && result.interaction.type === 'tool-approval') {
  result = await agent.resume(
    result.continuation,
    { type: 'tool-approval', approved: true },
  )
}
```

Continuations are trusted server-side runtime state, not browser authorization tokens. Persist them
with actor, tenant, interaction, expiry, and claim state, and atomically claim a pending interaction
before continuing it.

## MCP SDK v2

MCP clients and transports live in the dedicated package. Core keeps only lightweight MCP
registration contracts.

```sh
pnpm add @anvia/core @anvia/mcp
```

```ts
import { Agent } from '@anvia/core/agent'
import { McpClient, McpClientGroup } from '@anvia/mcp'

const filesystem = new McpClient({
  name: 'filesystem',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace'],
  },
})

const group = await McpClientGroup.connect({ clients: [filesystem] })
const operator = new Agent({ id: 'operator', model, mcpServers: group.servers })

try {
  await operator.generate({ prompt: 'List the files in the workspace.' })
} finally {
  await group.close()
}
```

The package implements MCP SDK v2 with protocol `2026-07-28`. It does not negotiate down to legacy
protocols. Construction performs no I/O; `connect()` owns initialization and paginated discovery,
and `close()` owns cleanup. Treat remote MCP servers as privileged integrations: constrain targets,
headers, redirects, tool exposure, and lifecycle in server-owned configuration.

## Pipelines, skills, and multi-agent work

- Construct `Pipeline` directly; there is no `PipelineBuilder` or `.build()` phase in v1.
- Use deterministic pipeline steps for authorization, data access, branching, and side effects.
- Configure named Pipeline observers in the constructor. Give Pipeline and Agent observers the same
  `primaryTrace` name when their spans should form one trace; use the per-run `observer` separately
  for operational stage events.
- Use agents only where model reasoning adds value, and bound every loop with turn limits.
- Load skills from trusted roots and validate their manifests and referenced assets.
- Expose specialist agents as narrow tools when delegation is clearer than one large agent.
- Use `@anvia/sandbox` for isolated execution, while still enforcing command, network, resource,
  secret, and cleanup policy.

## Streaming and production boundaries

`agent.stream()` returns a one-consumer handle. Iterate it for normalized lifecycle, tool, text,
usage, and error events followed by a direct terminal outcome; use `textStream`, `text`, or `result`
when only that projection is needed. Before sending anything to a browser, project it through
`@anvia/client` and `@anvia/server`; do not expose raw reasoning, provider payloads, private errors,
tool arguments, tool results, or secrets.

Memory compaction uses token budgets: `trigger.afterTokens` and `retention.recentTokens`. The
default estimator can be replaced with a model-specific async token counter. Call
`agent.compactMemory({ session })` to compact an eligible older prefix manually; automatic
compaction emits `memory_compaction` with message counts, token counts, attempts, and usage.

Keep agent IDs and tool names stable. Make sensitive tools idempotent and auditable. Test handlers
without live providers, add bounded provider smoke tests, and observe model calls, tools, failures,
token use, and latency.

## Canonical documentation

- Agents: https://docs.anvia.dev/sdk/agents
- Tools: https://docs.anvia.dev/sdk/tools
- Interactions: https://docs.anvia.dev/sdk/agents/interactions
- MCP: https://docs.anvia.dev/packages/mcp/
- MCP integration guide: https://docs.anvia.dev/sdk/advanced/mcp
- Pipelines: https://docs.anvia.dev/sdk/pipelines
- Pipeline runs and observability: https://docs.anvia.dev/sdk/pipelines/runs-and-errors
- Multi-agent systems: https://docs.anvia.dev/sdk/advanced/multi-agent
- Skills: https://docs.anvia.dev/sdk/advanced/skills
- Streaming: https://docs.anvia.dev/sdk/streaming
- Memory compaction: https://docs.anvia.dev/sdk/memory/compaction
- Sandbox: https://docs.anvia.dev/sdk/advanced/sandbox
- Full-stack applications: https://docs.anvia.dev/llms-apps.txt