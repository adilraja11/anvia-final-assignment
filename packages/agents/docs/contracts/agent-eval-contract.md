# Agent evaluation contract

## Purpose

This contract defines the first regression suite for the image-identification and valuation agents. It contains exactly 30 agent-evaluation cases:

- 18 image-identification cases backed by 18 versioned image fixtures.
- 12 valuation cases backed by mocked structured evidence and comparable records.

This is an agent-behaviour suite. It does not replace deterministic tests for price formulas, currency conversion, rounding, or policy thresholds.

## Product boundary

The agents may identify, normalize, match, and explain evidence. Application code validates the evidence and performs the final valuation calculation.

Consequently, every valuation evaluation must reject an output that presents an AI-generated number as the authoritative final calculated price. A successful valuation-agent response hands off normalized inputs and evidence references for application code to calculate.

## Case shape

Each case must be self-contained and must state one primary behaviour under test. A case may have secondary assertions only when they are needed to protect the same behaviour.

```ts
type AgentEvalCase = {
	id: string;
	agent: "image-identification" | "valuation";
	title: string;
	category:
		| "recognition"
		| "robustness"
		| "condition"
		| "ambiguity"
		| "insufficient-evidence"
		| "evidence-integrity"
		| "handoff";
	input: unknown;
	expected: {
		requiredFacts?: Record<string, unknown>;
		allowedCandidates?: Record<string, string[]>;
		mustRequestOrMarkUnknown?: string[];
		allowedEvidenceIds?: string[];
		mustNotClaim?: string[];
	};
	graders: Array<"schema" | "deterministic" | "rubric">;
	severity: "blocker" | "high" | "medium";
};
```

The implementation may use a different concrete TypeScript type if the existing agent interface requires it, but it must preserve these semantics.

## Fixture policy

Image fixtures belong with the agent eval assets and are referenced by a relative path and stable fixture ID. Each fixture must have a manifest entry containing:

- `id` and relative path;
- origin and licence or synthetic-data declaration;
- content hash;
- visible, verifiable facts only;
- whether the expected result is an identification, an allowed candidate set, or insufficient evidence.

Fixtures must be synthetic, public-domain, licensed, or explicitly consented. Do not commit customer uploads, production photos, receipts with personal data, location-bearing EXIF data, credentials, or secrets. Test fixtures must be clearly marked as mock/evaluation data.

The initial suite has one primary image per image-identification case. A valuation case uses mocked identification output rather than an image so that identification failures and valuation failures can be diagnosed separately.

## Grading rules

Every case uses a schema grader and a deterministic grader. A rubric grader is optional and is limited to qualitative checks such as whether an explanation makes uncertainty clear.

Deterministic graders must verify, where applicable:

- the response conforms to the agent's structured-output contract;
- required observable facts are present;
- a model/variant is either within the allowed candidate set or marked uncertain;
- unsupported facts are not asserted as certain;
- cited comparable or evidence IDs are a subset of the supplied IDs;
- the response does not fabricate listings, receipts, or provenance;
- the valuation agent does not claim to produce the authoritative final calculated price.

Do not grade natural-language explanations with exact string matches. Grade the structured fields and evidence references deterministically; use a calibrated rubric only for explanation quality.

## Execution expectations

Each case is independent: no case may require cached memory, an earlier case's output, or network-fetched market data. Mock all comparable records and external retrieval results. Pin the model and agent configuration for a baseline run, retain the trace for failures, and run non-deterministic agent cases multiple times when measuring a release candidate.

An agent behaviour regression adds a new case rather than changing an unrelated expected result. Changes to the product contract require an explicit update to this document and the corresponding cases.
