# Employee handbook evals

Run all evals from the repository root:

```sh
pnpm eval
```

## Case categories

| Category | Cases | Percentage |
| --- | ---: | ---: |
| Common questions | 15 | 50% |
| Edge cases | 6 | 20% |
| Tool calls | 3 | 10% |
| Abstention | 3 | 10% |
| Guardrails | 3 | 10% |

## Metric matrix

| Metric | Cases |
| --- | ---: |
| Grounded `gEval` | 23 |
| `abstention()` | 2 |
| `exactMatch()` | 5 |

The primary runner selects each case by its declared metric, producing 23
grounded checks, five exact-output checks, and two abstention checks (30 unique
primary cases). The tool-invocation check is an additional secondary contract
over the three tool-call cases.

Each case has a category and a contract-appropriate primary metric. Grounded
G-Eval receives the `sourceText` values returned by `handbookSearch` in that
same run. Abstention cases are also checked independently of exact formatting.
Every suite sends its results through the Anvia Lens reporter.
