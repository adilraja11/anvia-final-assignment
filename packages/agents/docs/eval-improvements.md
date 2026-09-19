# Evaluation improvements

## Evidence snapshot

This analysis uses the two completed Lens runs from 2026-09-19 and the current repository source:

- Image identification: run `aed9a1f6-ab08-467f-8166-926b40b57474`, 18 cases, 36 metric results, 27 pass and 9 fail.
- Valuation: run `85e1d7e3-351a-436a-b1ff-6b9acc0a4b40`, 12 cases, 36 metric results, 27 pass, 6 fail, and 3 invalid.
- The headline is 54/69, or 78.3%, when invalid results are excluded. Only 15/30 cases pass every reported metric: 9/18 image cases and 6/12 valuation cases. Invalid is not pass, so the case-level rate is the safer release signal.
- Both runs used `gpt-5.6-luna` in the `development` environment. Image cases used one model turn and no tools. Complete valuation cases used two turns and one mocked tool call; V-03 and V-04 correctly stopped after one turn without a tool call.
- This is one run per case, so it does not measure variance. The valuation suite replaces `blibliSearch` with a case-local mock; Lens therefore provides no evidence about live Apify normalization, filtering, retry, or caching behavior.

Primary sources are the Lens run/result/trace records, the [eval runner](../src/evals/run.ts), [cases](../src/evals/cases.ts), [image prompt](../src/prompts/image-identification-instructions.ts), [valuation prompt](../src/prompts/valuation-instructions.ts), [Blibli tool](../src/tools/blibli-search.ts), and the two agent factories ([image](../src/agents/image-identification.ts), [valuation](../src/agents/valuation.ts)). Product authority remains the root [PRD](../../../PRD.md) and [technical PRD](../../../PRD_TECHNICAL.md).

## What failed

| Pattern | Lens evidence | Interpretation |
| --- | --- | --- |
| Cameras rejected | I-04, I-11, and blocker I-16 returned `UNSUPPORTED_CATEGORY`; traces `9dd2e1fbae4e8f2261d418a40c942f86`, `8faeeebc060a0c7a4be3af848100db99`, and `2b25bf46d9e77867abc3d6b2eece3f39` | Direct prompt defect: the image prompt excludes cameras while the PRD, schema, cases, and valuation prompt support them. |
| Image certainty is inconsistent | I-02 and I-12 accepted generic iPad names; I-08 guessed S22 Ultra; I-10 guessed Pixel 7 Pro; I-14 added Digital Edition; I-07 refused a sufficiently distinctive S22 rear view | The prompt says not to guess but does not define category-specific minimum identity or distinguish a base model from a forbidden variant/detail. |
| Wrong-variant case became invalid | All V-06 metrics report `Target failed: No data extracted`; the agent trace is `e506a711af437063256d60deac89a24d` | The agent completed two turns and one tool call, then structured extraction failed. Safe trace capture retained no raw response, so the exact malformed output is unavailable. |
| Stale evidence was not disclosed | V-09 deterministic and rubric failed; trace `37585aa2cd2431983edbd189db28c251` | The valuation prompt never tells the model how to handle an old `fetched_at` or how to avoid calling it current evidence. |
| Several failures are grader artifacts | V-01 and V-12 safely said prices were *not* completed-sale/final prices but substring checks rejected the prohibited words. V-07 said one price was “jauh berbeda” and V-11 conveyed known/unknown facts, while both rubrics passed. | Do not contort production prompts to avoid necessary disclaimers or require magic phrases. Fix these deterministic checks separately. |

## System-prompt changes

### Image identification — highest priority

1. Replace the category paragraph with the canonical five categories: computer/laptop, handphone/smartphone, tablet, gaming console, and camera. Remove `kamera` from the rejection list. This should address I-04, I-11, and I-16 directly.
2. Define `SUPPORTED` as “the exact base model needed for the next confirmation step is established,” not merely the family or category. Define `MORE_INFORMATION_REQUIRED` for a visible supported product whose price-critical generation/base model cannot be established.
3. Add short counterexamples in Bahasa Indonesia:
   - unreadable iPad Air generation or a dim front-only phone → `MORE_INFORMATION_REQUIRED`;
   - readable `Canon EOS R50 V` → `SUPPORTED` with that exact base model;
   - Pixel 7 without decisive Pro cues → `Google Pixel 7`, never add `Pro`;
   - a PS5 box may yield `Sony PlayStation 5`; do not put edition, storage, or bundle data in `productName`.
4. State that a model suffix (`Pro`, `Ultra`, `Max`, `Plus`), generation, or edition may appear only when it is part of the required base identity and is readable or uniquely established by visible evidence. Otherwise return uncertainty rather than the nearest-looking SKU.
5. Keep the existing one-object/no-prose and prompt-injection rules; all 18 schema metrics passed, so the output schema itself is working.

### Valuation

1. Add exact JSON-shaped examples for every status, especially `INSUFFICIENT_EVIDENCE` with `evidenceIds: []`. Require the English schema field names even though values are Bahasa Indonesia. This reduces extractor ambiguity behind V-06 without moving calculation into the model.
2. State the five-evidence threshold explicitly: a successful provider response with fewer than five application-accepted IDs must be `INSUFFICIENT_EVIDENCE`; a provider error must be `SERVICE_FAILURE`.
3. Add freshness language: if `fetched_at` is outside the allowed cache window, describe it as `bukti tidak mutakhir`, never “pasar saat ini,” and defer acceptance to application code. Application code should normally prevent such evidence from reaching explanation.
4. Require source-aware wording: `terlihat pada gambar` for `VISIBLE`, `menurut pengguna` for `USER_PROVIDED`, `menurut bukti Blibli` for `MARKET_EVIDENCE`, and `belum diketahui` for `UNKNOWN`. This makes V-11 reliable without inventing facts.
5. If the supplied set has an obviously isolated price, mention an unusual spread and say application code will validate/filter it. Do not label a record an IQR outlier or calculate a result in the prompt.
6. Preserve the strongest existing rule: the model must never calculate median, quartiles, confidence, or a final price. V-01 and V-12 were semantically safe; their failures came from grading negated language.

## `blibli-search.ts` changes

These are source-review findings, not explanations of the current Lens score, because the baseline never calls this implementation.

1. Stop treating model-generated `searchTerms` as identity authority. `matchesSearchTerms()` accepts any variant for which one query contains matching tokens, so a broad query can admit a wrong storage/model. Bind the user-confirmed structured identity and location into the tool server-side; use search terms only for retrieval.
2. Validate every category-specific price-critical field against normalized titles and attributes. `allowedAttributes()` currently retains only brand, model, storage/capacity, and variant; it drops connectivity, CPU, RAM, GPU, form factor/display, console edition/bundle, and camera lens fields required by the PRD.
3. Replace blanket title rejection with identity-aware classification. Terms such as `display`, `bundle`, `paket`, and `1 unit` can describe a valid computer, console, or camera kit; reject only accessories, components, repair-only products, and materially different bundles.
4. Keep location handling honest. The actor request ignores `location`, while the [valuation engine](../src/valuation-engine.ts) can only prefer local records that happen to occur in the 30 nationwide results. Add provider-side location only if the actor supports it; otherwise retain deterministic local-first selection and disclose the nationwide fallback. Never create a regional price adjustment.
5. Key the six-hour cache by the validated normalized identity plus region, not by generated query wording. Inject a shared cache owned by the host instead of relying on the process-local `Map` when multiple workers run.
6. Bound the provider call to the remaining 90-second job budget and propagate cancellation. The current `timeoutSecs: 360` can exceed the product hard timeout before the outer retry finishes.
7. Set `includeOutOfStock: false` if supported: requesting out-of-stock records and then rejecting every non-live status wastes the fixed 30-record allowance.
8. Preserve current strengths: fixed actor and limits, approved Blibli URLs, numeric IDR prices, availability checks, duplicate IDs, machine-readable rejection reasons, and sanitized error logging.

## Agent-parameter changes

1. Keep `temperature: 0`, image `toolChoice: "none"`, and image `maxTurns: 1`; Lens shows no parameter-related schema failures.
2. Reduce valuation `maxTurns` from 6 to 2 or 3 after regression testing. Every complete case used exactly two turns (tool call, then answer), so six only increases the ceiling for repeated calls. Keep tool choice automatic because incomplete V-03/V-04 must not call Blibli.
3. Consider image `maxTokens: 512` and valuation `maxTokens: 1_000` as cost/latency guards only after repeated runs. The observed outputs stayed below the current 768/1,500 caps, and no failure is evidence of truncation.
4. Pin separate explicit model IDs for image and valuation release runs instead of inheriting one mutable `OPENAI_MODEL`. Record model, prompt, dataset, runtime, and evaluator versions together before comparing candidates.
5. Keep valuation one-shot: do not attach optional memory for this workflow, and do not allow caller-supplied `additionalInstructions` to weaken the fixed tool, privacy, or calculation boundaries.

## Evaluation hygiene before judging the next candidate

1. Make prohibited-claim checks negation-aware or structured. “Bukan harga transaksi selesai” and “bukan harga akhir valuasi” are required disclosures, not violations.
2. Replace exact concept substrings with normalized synonym sets or the calibrated rubric for V-07 and V-11.
3. Do not emit a passing rubric result for cases that did not request a rubric; those synthetic passes inflate aggregate metric rates.
4. Capture a sanitized valuation raw response or extraction error shape on failure so V-06 is diagnosable. Keep image bytes and user content out of traces.
5. Re-run each changed candidate multiple times, require zero invalid results and all blocker cases to pass, then compare case-level results rather than the 78.3% non-invalid metric headline.
