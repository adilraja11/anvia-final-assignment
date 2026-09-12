# Anvia Evaluations and Observability

> Current stable v1 context for tracing, runtime scoring, evaluation suites, datasets, and release gates. Updated 2026-08-28.

Use unit and integration tests for deterministic code. Use evaluations for model behavior whose
wording or reasoning can vary. Observability explains runtime activity; it is not application state.

```text
instrument runtime â†’ inspect traces â†’ curate failures into cases
â†’ run versioned suites â†’ compare candidates â†’ enforce a release gate
```

## Trace with Lens

```sh
pnpm add @anvia/core @anvia/lens
```

```ts
import { Agent } from '@anvia/core'
import { LensClient } from '@anvia/lens'

const lens = new LensClient()
const agentTracing = lens.observer({ captureMode: 'safe' })
const pipelineTracing = lens.pipelineObserver({ captureMode: 'safe' })

const agent = new Agent({
  id: 'support',
  model,
  observability: {
    observers: { lens: agentTracing },
    primaryTrace: 'lens',
  },
})
```

Configure `pipelineTracing` in a Pipeline constructor under the same `lens` observer name and select
`primaryTrace: 'lens'`. Core then parents the Agent run beneath its Pipeline stage, so Lens stores one
trace containing orchestration, model generation, and tool spans. Different primary names remain
separate traces.

`LensClient` reads server-only `ANVIA_LENS_*` credentials. Use `{ optional: true }` only when a
missing complete connection should disable telemetry; partial credentials still fail fast. Call
`flush()` before short-lived processes exit and `close()` during graceful shutdown. On a process
signal, stop accepting work, abort and await active Agent and Pipeline runs, then close Lens so
cancelled root observations can finish before the provider flushes.

Use stable opaque user, session, trace, release, and environment identifiers. Review capture mode,
redaction, retention, and region before sending prompt, response, tool, retrieval, or metadata
payloads. Lens telemetry must not replace conversation memory, product records, or audit logs.

## Record runtime feedback

Use runtime scoring when feedback or a production check should be observable without running an
evaluation suite:

```ts
await lens.score({
  id: feedbackId,
  traceId,
  observationId,
  name: 'user-feedback',
  value: liked ? 1 : 0,
  dataType: 'BOOLEAN',
  source: 'end_user',
  comment,
  metadata: { channel: 'thumbs' },
})
```

Boolean scores use `1` or `0`; numeric and categorical scores are also supported. Use a stable
opaque score ID when later feedback should replace or supersede the same application record. A
valid trace ID is required, comments are limited to 2,000 characters, and application code owns
authentication, authorization, metadata validation, and delivery boundaries. Call `flush()` or
`close()` when queued Lens logs must be delivered.

## Run an evaluation suite

```ts
import type { AgentResponse } from '@anvia/core/agent'
import { agentEvalTarget, contains, exactMatch, runEvalSuite } from '@anvia/core/evals'

const cases = [
  { id: 'refund-window', input: 'When can I request a refund?', expected: '30 days' },
  { id: 'billing-owner', input: 'Who changes billing?', expected: 'Workspace owners' },
]

const result = await runEvalSuite({
  name: 'support-policy-v3',
  cases,
  target: agentEvalTarget<string>({
    agent,
    request: ({ input }) => ({ prompt: input }),
  }),
  metrics: [
    contains<string, AgentResponse<string>, string>({
      actual: ({ output }) => output.output,
    }),
    exactMatch<string, AgentResponse<string>, string>({
      name: 'not_blank',
      actual: ({ output }) => output.output.trim().length > 0,
      expected: true,
    }),
  ],
  concurrency: 2,
})

console.log(result.metrics)
```

Start with deterministic checks. Add semantic similarity, judge, score, RAG, or conversation metrics
only when each one represents a named product requirement. Judge metrics add cost and variance.

Each case can pass, fail, or be invalid. Invalid means the metric could not make a valid judgment;
never silently count it as passing. Include negative controls that must fail so a broken evaluator
cannot make every candidate look good.

## Report suites and use managed datasets

```ts
import { agentEvalTarget, runEvalSuite } from '@anvia/core/evals'
import { LensClient } from '@anvia/lens'

const lens = new LensClient({ serviceName: 'support-evals' })
const reporter = lens.evalReporter({ includeMetadata: true, includePayloads: false })

try {
  await runEvalSuite({
    name: 'support-regression',
    cases,
    target: agentEvalTarget<string>({
      agent,
      request: ({ input }) => ({ prompt: input }),
    }),
    metrics,
    reporters: [reporter],
  })
  await lens.flush()
} finally {
  await lens.close()
}
```

Attach the Lens observer to the evaluated agent when results should correlate with traces. Configure
`onMissingTrace` deliberately rather than accepting uncorrelated results silently.

The public dataset client reads published immutable versions:

```ts
const datasets = lens.datasetClient()
const dataset = await datasets.getDataset<string, string>({
  name: 'support-cases',
  version: 'v2',
})
```

Pin dataset, prompt, model, retrieval, runtime, and evaluator versions in CI. Drafting, publishing,
archiving, comparison, and quality-gate configuration live in Lens; the SDK client is read-only.

## Release gates

A completed suite is evidence, not a deployment decision. CI or the release system must define
required metrics, slices, minimum sample sizes, invalid-result policy, variance tolerance, and the
candidate/baseline comparison. A gate should return pass, fail, or insufficient data.

Use synthetic or approved data, separate tenant records, redact before external judges/reporters,
and track evaluator cost and latency. Manually review a sample of disagreements and repeat
model-judged cases to estimate variance.

## Canonical documentation

- Core eval example: https://docs.anvia.dev/examples/production/evaluations
- Lens package: https://docs.anvia.dev/packages/lens/
- Lens tracing: https://docs.anvia.dev/packages/lens/tracing
- Lens eval integration: https://docs.anvia.dev/packages/lens/evals-and-datasets
- Lens runtime scoring: https://docs.anvia.dev/packages/lens/runtime-scoring
- Lens concepts: https://docs.anvia.dev/lens/core-concepts
- Evaluation runs: https://docs.anvia.dev/lens/evaluations/runs
- Results: https://docs.anvia.dev/lens/evaluations/results
- Managed datasets: https://docs.anvia.dev/lens/evaluations/datasets
- Quality gates: https://docs.anvia.dev/lens/evaluations/quality-gates
- OpenTelemetry reporting: https://docs.anvia.dev/packages/otel/eval-reporting
- OpenTelemetry runtime scoring: https://docs.anvia.dev/packages/otel/runtime-scoring
- OpenTelemetry tracing: https://docs.anvia.dev/packages/otel/tracing
- Langfuse scores: https://docs.anvia.dev/packages/langfuse/evals-and-scores