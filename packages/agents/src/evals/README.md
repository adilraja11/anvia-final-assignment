# Agent evals

## Current status

`cases.ts` and `run.ts` currently run the legacy employee-handbook retrieval suite. That suite
does not validate image identification, valuation quality, marketplace retrieval, or the price
calculation contract.

The planned product-agent baseline is specified by the [agent evaluation
contract](../../docs/contracts/agent-eval-contract.md) and [30-case baseline
plan](../../docs/plans/agent-eval-baseline.md). It has not yet been implemented in this directory.
Do not cite the current handbook results as evidence that the planned product-agent baseline has
passed.

## Planned product-agent baseline

The baseline contains exactly 30 independent cases:

- 18 image-identification cases (`I-01` through `I-18`), each with one versioned image fixture.
- 12 valuation cases (`V-01` through `V-12`) using controlled mock identification output and
  comparable records.

When the baseline is added, `src/evals/cases.ts` remains the single case catalogue. Each case entry
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

## Running the current suite

Run the currently implemented handbook suite from the repository root:

```sh
pnpm eval
```

The product-agent runner and its deterministic graders must be added before this command can be
used as evidence for the 30-case product baseline.
