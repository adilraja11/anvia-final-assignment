# Anvia Documentation

> Anvia is a TypeScript runtime and product suite for building, debugging, and operating provider-agnostic AI agents. Applications retain ownership of authentication, permissions, data, persistence, deployment, and user-facing responses.

Use the SDK documentation for runtime APIs and application integration, Studio for local inspection and debugging, and Lens for production observability and evaluation. Package pages describe the public surface of each published `@anvia/*` package. Prefer documented exports over internal source paths.

Choose the narrowest topic guide that covers the task. These guides contain curated implementation context, production boundaries, representative APIs, and links to authoritative pages. Examples are illustrative; verify exact behavior in the relevant SDK and package documentation.

## Topic Guides

- [Agents, tools, and MCP](https://docs.anvia.dev/llms-agents.txt): Models, agents, tools, MCP, skills, multi-agent coordination, pipelines, sandboxing, and streaming.
- [Full-stack applications](https://docs.anvia.dev/llms-apps.txt): Hono routes, `@anvia/server` streaming, `@anvia/react` client state, `@anvia/react-ui` components, authentication, cancellation, and resumption.
- [Evaluations and observability](https://docs.anvia.dev/llms-evals.txt): Tracing, Lens, runtime scoring, evaluation suites, datasets, release comparison, quality gates, alerts, cost, and testing.
- [RAG, knowledge, and retrieval](https://docs.anvia.dev/llms-rag.txt): Raw-text ingestion, embeddings, vector stores, portable Neo4j/Memgraph GraphRAG, metadata filters, dynamic context, permission-aware retrieval, and memory boundaries.

## Stable v1 boundaries

- Construct agents, pipelines, and extractors directly; builder-era APIs are migration context only.
- Use `@anvia/mcp` for MCP SDK v2 clients and transports. Core retains lightweight registration contracts.
- Use Client Protocol v3 across `@anvia/client`, `@anvia/server`, and `@anvia/react`.
- Treat `@anvia/react-ui` as strictly headless. Use `@anvia/cli` to copy editable application-owned UI.
- Parse files or run OCR in application code, then pass normalized text to Core document helpers.
  Provider adapters may separately support PDF attachments for model input.
- Treat Anvia package versions independently and verify declared dependency ranges instead of
  requiring one synchronized version number.
- Keep retrieval permissions, tool authorization, interaction continuations, and public-event projection on the server.
- Use Lens and Core evals for trace-correlated, versioned release evidence; deployment policy remains application-owned.

## Start Here

- [Welcome to Anvia](https://docs.anvia.dev/): Product boundary, documentation paths, and what applications can build.
- [Introduction](https://docs.anvia.dev/guide/introduction): Anvia's role in an application and the responsibilities it intentionally leaves to the host application.
- [Quickstart](https://docs.anvia.dev/guide/getting-started): Install the smallest runtime stack and run a first agent.
- [Core concepts](https://docs.anvia.dev/guide/core-concepts): Models, agents, tools, memory, knowledge, pipelines, streaming, and runtime events.
- [Configuration](https://docs.anvia.dev/guide/configuration): Environment and runtime configuration guidance.

## SDK

- [SDK overview](https://docs.anvia.dev/sdk/): Package map and recommended routes through the SDK documentation.
- [Install and setup](https://docs.anvia.dev/sdk/install-and-setup): SDK installation and provider setup.
- [Your first agent](https://docs.anvia.dev/sdk/your-first-agent): Minimal typed agent example.
- [Models](https://docs.anvia.dev/sdk/models): Model abstractions and supported model capabilities.
- [Completions](https://docs.anvia.dev/sdk/completions): Direct model completion APIs.
- [Agents](https://docs.anvia.dev/sdk/agents): Agent construction, instructions, context, lifecycle, and limits.
- [Messages](https://docs.anvia.dev/sdk/messages): Message roles and content types.
- [Tools](https://docs.anvia.dev/sdk/tools): Typed tools, validation, execution, middleware, and security.
- [Memory](https://docs.anvia.dev/sdk/memory): Sessions, persistence policies, compaction, and store adapters.
- [Knowledge](https://docs.anvia.dev/sdk/knowledges): Document loading, embeddings, vector stores, retrieval, and search tools.
- [Structured output](https://docs.anvia.dev/sdk/structured-output): Schema-driven completion and agent output.
- [Pipelines](https://docs.anvia.dev/sdk/pipelines): Typed multi-step workflows, composition, parallelism, and production workers.
- [Pipeline runs and observability](https://docs.anvia.dev/sdk/pipelines/runs-and-errors): Named run and stage tracing, Agent trace nesting, operational events, and failure policy.
- [Streaming](https://docs.anvia.dev/sdk/streaming): Completion and agent streams, event types, transports, cancellation, and resumption.
- [Providers](https://docs.anvia.dev/sdk/providers): Provider adapters, supported capabilities, and provider selection.

## Advanced SDK Topics

- [Dynamic context](https://docs.anvia.dev/sdk/advanced/dynamic-context): Attach stable or request-specific context with permissions and filters.
- [Hooks and run control](https://docs.anvia.dev/sdk/advanced/hooks): Observe and control runtime lifecycle points.
- [Multi-agent systems](https://docs.anvia.dev/sdk/advanced/multi-agent): Agent composition, coordination, boundaries, and failure handling.
- [MCP](https://docs.anvia.dev/sdk/advanced/mcp): Connect MCP servers, map results, and define trust boundaries.
- [Agent skills](https://docs.anvia.dev/sdk/advanced/skills): Skill directories, `SKILL.md`, assets, loading, tools, and validation.
- [Dynamic tools](https://docs.anvia.dev/sdk/advanced/dynamic-tools): Large tool catalogs, indexing, embedding, and safety.
- [Think tool](https://docs.anvia.dev/sdk/advanced/think-tool): Explicit reasoning-tool configuration and privacy guidance.
- [Sandbox execution](https://docs.anvia.dev/sdk/advanced/sandbox): Isolated execution and security boundaries.
- [Multimodal inputs](https://docs.anvia.dev/sdk/advanced/multimodal): Images, audio, documents, and other media.
- [Parallel and batch work](https://docs.anvia.dev/sdk/advanced/parallel-and-batch): Concurrency and batch execution patterns.

## Products and Operations

- [Studio](https://docs.anvia.dev/studio/): Local runtime inspection and debugging.
- [Run your first agent in Studio](https://docs.anvia.dev/studio/run-your-first-agent): Initial Studio workflow.
- [Studio sessions](https://docs.anvia.dev/studio/sessions): Inspect persisted sessions and activity.
- [Studio pipelines](https://docs.anvia.dev/studio/pipelines): Inspect and run pipelines.
- [Studio graph explorer](https://docs.anvia.dev/studio/graphs): Inspect bounded Neo4j and Memgraph graph views.
- [Lens](https://docs.anvia.dev/lens/): Production observability and evaluation.
- [Install and set up Lens](https://docs.anvia.dev/lens/install-and-setup): Connect an application to Lens.
- [Your first trace](https://docs.anvia.dev/lens/your-first-trace): Capture and inspect runtime telemetry.
- [Lens observability](https://docs.anvia.dev/lens/observability): Traces, sessions, users, costs, and alerts.
- [Lens self-hosting](https://docs.anvia.dev/lens/self-hosting/architecture): Self-hosted architecture and operational guidance.
- [Channels](https://docs.anvia.dev/channels/): Discord, Slack, and Telegram adapters that connect platforms to agents and support proactive delivery.
- [Build applications](https://docs.anvia.dev/use-cases/build-applications): Connect Anvia runtime behavior to an application.
- [Observe systems](https://docs.anvia.dev/use-cases/observe-systems): Add runtime observability.
- [Production operations](https://docs.anvia.dev/use-cases/production): Prepare Anvia-based systems for real users.

## Packages

- [Package catalog](https://docs.anvia.dev/packages/): Published packages and their roles.
- [`@anvia/core`](https://docs.anvia.dev/packages/core/): Core runtime APIs for models, agents, tools, messages, and pipelines.
- [`@anvia/server`](https://docs.anvia.dev/packages/server/): Server transports and streaming integration.
- [`@anvia/react`](https://docs.anvia.dev/packages/react/): React state and hooks for Anvia streams.
- [`@anvia/mcp`](https://docs.anvia.dev/packages/mcp/): MCP SDK v2 clients, transports, discovery, and lifecycle ownership.
- [`@anvia/react-ui`](https://docs.anvia.dev/packages/react-ui/): Strictly headless React interface primitives.
- [`@anvia/cli`](https://docs.anvia.dev/packages/cli/): Editable shadcn/Tailwind application components built on React UI.
- [Model providers](https://docs.anvia.dev/sdk/providers): OpenAI, Anthropic, Gemini, Mistral, Grok, and compatible provider APIs.
- [Memory adapters](https://docs.anvia.dev/sdk/memory/store-adapters): SQLite, PostgreSQL, Drizzle, and Prisma-backed memory.
- [Vector stores](https://docs.anvia.dev/sdk/knowledges/vector-stores): Qdrant, Pinecone, pgvector, Redis, Chroma, LanceDB, Milvus, and Weaviate.
- [Knowledge graphs](https://docs.anvia.dev/packages/graph): Portable graph contracts plus Neo4j and Memgraph adapters.
- [Observability integrations](https://docs.anvia.dev/packages/): Logger, OpenTelemetry, Lens, and Langfuse packages.

## Examples

- [Examples index](https://docs.anvia.dev/examples/): Runnable patterns organized by use case.
- [Essentials](https://docs.anvia.dev/examples/essentials/first-agent): First agents, completions, memory, tools, streaming, and structured output.
- [Agents and tools](https://docs.anvia.dev/examples/agents-and-tools/tool-calling): Tool calling, approvals, permissions, middleware, cancellation, and multi-agent composition.
- [Knowledge and data](https://docs.anvia.dev/examples/knowledge-and-data/basic-rag): Retrieval, document ingestion, metadata filters, memory, and vector-store adapters.
- [Providers and media](https://docs.anvia.dev/examples/providers-and-media/provider-switching): Provider switching, compatible APIs, images, audio, PDF, OCR, and live search.
- [Data and workflows](https://docs.anvia.dev/examples/data-and-workflows/research-pipeline): Pipelines, batch work, background jobs, recovery, and human review.
- [Applications](https://docs.anvia.dev/examples/applications/streaming-react-chat): End-to-end application examples.
- [Production](https://docs.anvia.dev/examples/production/authentication): Authentication, tracing, retries, limits, testing, evaluations, and quality gates.

## Optional

- [FAQ](https://docs.anvia.dev/faqs/): Product boundaries, capability choices, comparisons, and production questions.
- [Comparisons](https://docs.anvia.dev/faqs/comparisons/): Anvia compared with adjacent SDKs and direct provider APIs.
- [API references](https://docs.anvia.dev/references/): Reference entry points for public APIs.
- [GitHub repository](https://github.com/anvia-hq/anvia): Anvia source code; exported package surfaces are authoritative when documentation and implementation differ.