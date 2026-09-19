# Agent evals

## Current status

`cases.ts` and `run.ts` implement the 30-case product-agent baseline. The runner executes image
identification against the local fixtures and valuation against a per-case mock `blibliSearch`
tool. It never performs live marketplace retrieval.

The previous employee-handbook runner and catalogue remain available as
`run-legacy-handbook.ts` and `legacy-handbook-cases.ts`. Handbook results are not evidence that the
product-agent baseline has passed.

## Product-agent baseline

The baseline contains exactly 30 independent cases:

- 18 image-identification cases (`I-01` through `I-18`), each with one versioned image fixture.
- 12 valuation cases (`V-01` through `V-12`) using controlled mock identification output and
  comparable records.

`src/evals/cases.ts` is the single product-agent case catalogue. Each case entry
contains its input, expected output, deterministic assertions, and—in valuation cases—its mock
evidence. Do not add separate `fixture-manifest.ts` or `mocked-evidence.ts` files.

Image assets live in `src/evals/fixtures/`. An image case references its fixture by relative path;
the case ID links the image and expected output. The canonical filename-to-case mapping, including
all 18 required image filenames, is in the [baseline plan](../../docs/plans/agent-eval-baseline.md#image-identification-cases-18-fixtures).
The corresponding `cases.ts` entry records the fixture's licence or synthetic-data declaration,
content hash, and verified visible facts. Fixtures must be synthetic, public-domain, licensed, or
explicitly consented evaluation data. Never add customer uploads, production photos, EXIF location
data, personal data, or secrets.

## Evaluation rules

Each case is self-contained and has one primary behaviour under test. It uses schema and
deterministic graders; a rubric grader is optional and only assesses qualitative explanation
quality. The suite must not use cached state, live market retrieval, or another case's output.

Image-identification and valuation failures must remain diagnosable separately: valuation cases
use mock identification output rather than an image. Valuation checks must reject any response that
presents an AI-generated amount as the authoritative final price. Application code validates
evidence and performs the calculation.

Pin the model, agent configuration, and evaluator versions for baseline or release-candidate runs.
Retain failure traces, treat invalid evaluations as neither pass nor fail, and add a focused case
for each new regression. See [ANVIA_EVALS.md](../../../../ANVIA_EVALS.md) for runtime evaluation,
reporting, and release-gate guidance.

## Running the suites

Run the product-agent baseline from the repository root:

```sh
pnpm eval
```

Run the preserved handbook suite directly when a legacy comparison is needed:

```sh
pnpm --filter @repo/agents exec tsx src/evals/run-legacy-handbook.ts
```

The product runner validates fixture hashes before model execution, uses schema and deterministic
metrics for every case, and invokes the optional rubric only for cases that request it. A completed
suite is evaluation evidence, not a deployment decision.
