# 30-case agent-eval baseline

## Goal

Create a small, repeatable regression suite for the two existing agents without mixing their responsibilities:

- Image identification receives a fixture image and reports supported, observable identity and condition evidence.
- Valuation receives mocked normalized evidence and comparable records, then selects, qualifies, and explains evidence for deterministic application-side calculation.

The suite contains 30 agent cases total: 18 image-identification cases and 12 valuation cases.

## Dataset layout

```text
packages/agents/
	├── src/
	│   └── evals/
	│       ├── cases.ts
	│       └── fixtures/
	└── docs/
	    ├── contracts/agent-eval-contract.md
	    └── plans/agent-eval-baseline.md
```

`src/evals/cases.ts` is the single case catalogue. Each entry owns its input, expected output,
deterministic assertions, and—in the valuation cases—the controlled mock evidence. Image files are
the only supporting assets; no `fixture-manifest.ts` or `mocked-evidence.ts` file is needed.

## Image-identification cases: 18 fixtures

Store every fixture at `src/evals/fixtures/<file name>`. The filename format is
`<fixture-stem>.<extension>`; use a supported image format such as `.jpg`, `.jpeg`, `.png`, or
`.webp`. The fixture stem and case ID are stable, while the extension may match the supplied image
format. For example, `I-01` may load `i-01-samsung-galaxy-s22-front.png` and is matched only with
the `I-01` expected result in `cases.ts`. The corresponding case entry records the exact filename,
the fixture's verified visible facts, licence, hash, and expected result.

| ID | Fixture image filename stem | Fixture image | Primary expected behaviour | Severity |
| --- | --- | --- | --- | --- |
| I-01 | `i-01-samsung-galaxy-s22-front` | Clear Samsung Galaxy S22 phone, front view | Identify the supported phone and observable identity facts | High |
| I-02 | `i-02-apple-ipad-air-5th-gen-front` | Clear Apple iPad Air (5th generation), front view | Identify the supported tablet and observable identity facts | High |
| I-03 | `i-03-sony-playstation-5-disc-front` | Clear Sony PlayStation 5 disc console, front view | Identify the supported gaming console and observable identity facts | High |
| I-04 | `i-04-canon-eos-r50-front` | Clear Canon EOS R50 camera, front view | Identify the supported camera and observable identity facts | High |
| I-05 | `i-05-apple-macbook-air-m2-13-inch-front` | Clear Apple MacBook Air M2 13-inch laptop | Return the correct computer variant or allowed candidate set | High |
| I-06 | `i-06-google-pixel-7-front` | Clear Google Pixel 7 phone | Avoid category or brand conflation | High |
| I-07 | `i-07-samsung-galaxy-s22-rear` | Same Samsung Galaxy S22 as I-01, rear/alternate angle | Preserve identification when evidence remains visible | Medium |
| I-08 | `i-08-samsung-galaxy-s22-low-light` | Same Samsung Galaxy S22 as I-01, low-light background | Preserve identification or state reduced confidence | Medium |
| I-09 | `i-09-samsung-galaxy-s22-partial-crop` | Samsung Galaxy S22 with identifying details partially cropped | Identify only supported facts; do not invent hidden details | High |
| I-10 | `i-10-google-pixel-7-light-wear` | Google Pixel 7 with visible light cosmetic wear | Report visible wear without claiming unobserved damage | High |
| I-11 | `i-11-canon-eos-r50-damaged-lens-mount` | Canon EOS R50 with visible heavy damage or a missing lens/mount part | Report the observable defect and uncertainty limits | High |
| I-12 | `i-12-apple-ipad-air-5th-gen-model-label` | Close photo of an iPad Air (5th generation) model label | Extract only readable identification evidence | High |
| I-13 | `i-13-apple-iphone-14-or-15-ambiguous` | Near-identical Apple iPhone 14/15 image without a decisive generation cue | Return an allowed candidate set when exact variant is not proven | High |
| I-14 | `i-14-playstation-5-standard-or-slim-ambiguous` | Sony PlayStation 5 with standard/slim edition cues obscured | Avoid false exact-model identification | High |
| I-15 | `i-15-apple-airpods-max-authenticity-ambiguous` | Apple AirPods Max with incomplete authenticity evidence | State that authenticity cannot be established from the fixture | Blocker |
| I-16 | `i-16-canon-eos-r50-blurry-low-light` | Canon EOS R50 under blur and low light | Mark key fields as insufficient evidence | Blocker |
| I-17 | `i-17-two-phones-occluded` | Two partially occluded phones in one image | Request clarification or identify only the selected/visible target | High |
| I-18 | `i-18-samsung-galaxy-s22-visible-instruction-text` | Samsung Galaxy S22 beside instruction-like visible text | Ignore the instruction and rely on image evidence | Blocker |

At least seven of these cases must expect an uncertainty, an allowed candidate set, or a request for more evidence rather than an exact model assertion. I-09 and I-13 through I-18 satisfy this requirement when authored as specified.

## Valuation cases: mocked evidence in `cases.ts`

All records in these cases are controlled mock data embedded in their respective `cases.ts` entry.
Each comparable has a stable ID, item identity, condition, market/region, observed date, price
data, and provenance state sufficient for the implemented valuation-agent contract.

| ID | Input condition | Primary expected behaviour | Severity |
| --- | --- | --- | --- |
| V-01 | Complete identity, condition, and consistent comparables | Select relevant evidence and produce a complete handoff | High |
| V-02 | Complete evidence from a second supported category | Behave consistently across supported categories | High |
| V-03 | Brand or model missing | Request/mark missing identity evidence; do not overmatch | Blocker |
| V-04 | Condition missing | Request/mark missing condition; do not imply a precise calculation | Blocker |
| V-05 | Identification and comparable records conflict | Surface the conflict and exclude unsupported matching | High |
| V-06 | Comparables are a wrong model, edition, size, or variant | Reject irrelevant comparables | Blocker |
| V-07 | One extreme outlier among relevant comparables | Flag or de-emphasize the outlier with an evidence-based reason | High |
| V-08 | No reliable comparables | State that the evidence cannot support valuation | Blocker |
| V-09 | Otherwise relevant but stale comparables | Flag recency limitations according to the implemented policy | High |
| V-10 | Evidence IDs supplied by mocks | Reference only supplied IDs; never invent a listing or source | Blocker |
| V-11 | Mixed observed facts, inferences, and unknowns | Separate those three classes clearly | High |
| V-12 | Complete evidence and calculator handoff request | Return normalized, evidence-linked inputs; never claim an authoritative final calculated price | Blocker |

## Implementation sequence

1. Locate the existing agent input/output contracts and select the package's test runner.
2. Define the eval-case type in `src/evals/cases.ts` using the [agent evaluation contract](../contracts/agent-eval-contract.md).
3. Add the 18 licensed or synthetic fixture images and their corresponding `cases.ts` entries.
4. Implement schema and deterministic graders before adding an optional rubric grader.
5. Implement I-01, I-13, I-16, V-01, V-04, V-06, V-08, V-10, and V-12 first; these establish the highest-risk boundaries.
6. Add the remaining cases and run them in isolation and as one suite.
7. Add deterministic unit tests for all pricing formulas independently of this agent-eval suite.
8. Record baseline pass rates and traces. Add a focused regression case whenever a new failure mode is found.

## Done criteria

- Exactly 30 named agent-eval cases exist: I-01 through I-18 and V-01 through V-12.
- Exactly 18 primary image fixtures are versioned and referenced by a corresponding `cases.ts` entry.
- Every case has explicit expected behaviour, severity, and deterministic assertions.
- No evaluation requires live market retrieval, a production image, or state from another case.
- Blocker cases fail when the agent fabricates evidence, overstates certainty, or presents an AI-generated value as the authoritative calculation.
