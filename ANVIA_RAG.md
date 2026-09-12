# Anvia RAG, Knowledge, and Retrieval

> Current stable v1 context for ingestion, embeddings, vector stores, GraphRAG, and retrieval policy. Updated 2026-08-28.

Anvia calls its retrieval layer knowledge. Ingest outside the request path; at runtime search a
prepared index and send only relevant, authorized evidence to the model.

```text
source â†’ load â†’ normalize/chunk â†’ embed â†’ index
prompt â†’ permission filter â†’ search/rank â†’ format evidence â†’ model
```

Use static agent context for a small stable source set, automatic vector context when most prompts
need retrieval, a search tool when retrieval is optional or iterative, and portable GraphRAG when
typed relationships add useful evidence. Use application tools for live records and actions. Memory
is conversation history, not a factual corpus.

## Install

```sh
pnpm add @anvia/core @anvia/openai
```

Add one embedding adapter and one durable vector adapter for production. The in-memory store is
appropriate for learning and tests.

Core does not parse local files. Parse documents or run OCR in application code, then normalize the
result into text documents before chunking or ingestion. Provider adapters may separately accept PDF
attachments for model input; that path does not make Core a file parser.

## Ingest documents

```ts
import { readFile } from 'node:fs/promises'
import type { TextDocument } from '@anvia/core/documents'
import {
  InMemoryVectorStore,
  ingestVectorDocuments,
} from '@anvia/core/vector-store'

const path = 'content/support/reset-links.md'
const text = await readFile(path, 'utf8')
const store = new InMemoryVectorStore<TextDocument>()

await ingestVectorDocuments({
  store,
  documents: [{
    id: path,
    text,
    metadata: { source: path, published: true },
  }],
  embeddingModel,
  chunking: {
    strategy: 'recursive',
    maxSize: 1_600,
    overlap: 200,
    separators: ['\n\n', '\n', '. ', ' '],
  },
})
```

Use stable document and chunk IDs so re-ingestion is idempotent. Preserve source, tenant, visibility,
version, timestamps, and any fields required for authorization or deletion. Validate remote sources,
constrain redirects and response size, reject unsafe content types, and treat fetched text as
untrusted data rather than instructions.

## Retrieve automatically

```ts
import { Agent, createVectorContext } from '@anvia/core'
import { vectorFilter } from '@anvia/core/vector-store'

const agent = new Agent({
  id: 'docs-support',
  model,
  instructions: 'Answer from the documentation. Say when the answer is unavailable.',
  context: [
    createVectorContext({
      store,
      model: embeddingModel,
      topK: 4,
      minScore: 0.72,
      filter: vectorFilter.eq('published', true),
    }),
  ],
})

const result = await agent.generate({ prompt: 'How long does a reset link last?' })
```

Build tenant and permission filters from authenticated server state, never model or browser input.
Vector adapters implement the provider-neutral filter contract. LanceDB applies that contract with a
provider-neutral post-retrieval matcher; there is no public `filterToLanceExpr` escape hatch.

## Search tools

Expose search as a tool when the model should decide whether to retrieve or refine a query. Keep the
tool read-only, return bounded evidence with stable source IDs, and distinguish retrieved evidence
from provider-generated text. A source establishes provenance, not truth.

Do not allow retrieved documents, web pages, or metadata to invoke privileged tools. Instructions
inside evidence are untrusted content. Apply source policy before indexing and again before showing a
claim to users.

## GraphRAG

Use `@anvia/graph` with `@anvia/neo4j` or `@anvia/memgraph` when schema-first extraction, vector or
hybrid seed search, bounded relationship traversal, and provenance-linked evidence are required.
The portable layer owns schemas, raw-text ingestion helpers, retrieval contracts, Agent tools, and
bounded exploration. Register resources explicitly, bound hop count and result size, preserve
document-scoped writes, and enforce tenant/visibility predicates before traversal. Do not expose
arbitrary Cypher generation as an authorization boundary.

## Production checklist

- Separate ingestion credentials and workers from request-serving credentials.
- Make upserts, activation, replacement, and deletion idempotent and observable.
- Embed only approved normalized content and preserve provenance through chunking.
- Enforce permissions before retrieval; never retrieve broadly and redact afterward.
- Bound top-k, score thresholds, context bytes, query duration, and concurrent embedding work.
- Version embedding model, chunking policy, metadata schema, and corpus snapshots.
- Evaluate retrieval recall separately from answer grounding and faithfulness.
- Log safe source IDs, scores, filters, latency, and index version without leaking document bodies.

## Canonical documentation

- Knowledge overview: https://docs.anvia.dev/sdk/knowledges
- Document loading: https://docs.anvia.dev/sdk/knowledges/load-documents
- Embeddings: https://docs.anvia.dev/sdk/knowledges/embeddings
- Vector stores: https://docs.anvia.dev/sdk/knowledges/vector-stores
- Metadata filters: https://docs.anvia.dev/sdk/knowledges/metadata-filters
- Automatic retrieval: https://docs.anvia.dev/sdk/knowledges/automatic-retrieval
- Search tools: https://docs.anvia.dev/sdk/knowledges/search-tools
- Knowledge GraphRAG: https://docs.anvia.dev/sdk/knowledges/graph-rag
- Portable graph package: https://docs.anvia.dev/packages/graph
- Memgraph adapter: https://docs.anvia.dev/packages/memgraph
- Permission-aware example: https://docs.anvia.dev/examples/knowledge-and-data/permission-aware-rag
- Evaluation guide: https://docs.anvia.dev/llms-evals.txt