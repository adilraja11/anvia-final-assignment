import { createTool } from "@anvia/core";
import { QdrantVectorStore } from "@anvia/qdrant";
import { createTransformersEmbeddingModel } from "@anvia/transformers";
import { z } from "zod";

const COLLECTION_NAME = "devscale_employee_handbook_v2";

const model = await createTransformersEmbeddingModel();
const store = await QdrantVectorStore.connect<string>({
	collectionName: COLLECTION_NAME,
	vectorSize: 384,
});

export const handbookIndex = store.index(model);

export function normalizeTerm(term: string) {
	if (term.length <= 3) return term;
	if (term.length > 5 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
	if (term.length > 5 && /(ches|shes|sses|xes|zes)$/.test(term))
		return term.slice(0, -2);
	if (term.length > 5 && term.endsWith("ing")) {
		const stem = term.slice(0, -3);
		return stem.endsWith("os") ? `${stem}e` : stem;
	}
	if (term.length > 4 && term.endsWith("ed")) {
		const stem = term.slice(0, -2);
		return stem.endsWith("os") ? `${stem}e` : stem;
	}
	if (term.length >= 4 && term.endsWith("s") && !term.endsWith("ss"))
		return term.slice(0, -1);
	return term;
}

function terms(text: string) {
	return new Set(
		(text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map(
			normalizeTerm,
		),
	);
}

const GENERIC_TERMS = new Set([
	"a",
	"an",
	"and",
	"after",
	"are",
	"actions",
	"company",
	"does",
	"do",
	"employee",
	"handbook",
	"how",
	"immediate",
	"is",
	"of",
	"required",
	"reporting",
	"response",
	"steps",
	"should",
	"the",
	"this",
	"what",
	"when",
	"where",
	"who",
	"with",
]);

function distinctiveTerms(query: string) {
	return [...terms(query)].filter((term) => !GENERIC_TERMS.has(term));
}

type RankedResult = ReturnType<typeof rerank>[number];

/** Add rescue evidence without evicting the only result covering a term. */
export function admitCoverageCandidates({
	focused,
	candidates,
	requiredTerms,
	limit,
}: {
	focused: RankedResult[];
	candidates: RankedResult[];
	requiredTerms: string[];
	limit: number;
}) {
	const selected = [...focused];
	const selectedIds = new Set(selected.map(({ result }) => String(result.id)));
	let missing = requiredTerms.filter(
		(term) =>
			!selected.some(({ result }) => terms(String(result.document)).has(term)),
	);

	while (missing.length > 0) {
		const candidate = candidates
			.filter(({ result }) => !selectedIds.has(String(result.id)))
			.map((item) => ({
				item,
				covered: missing.filter((term) =>
					terms(String(item.result.document)).has(term),
				),
			}))
			.filter(({ covered }) => covered.length > 0)
			.sort(
				(left, right) =>
					right.covered.length - left.covered.length ||
					right.item.score - left.item.score,
			)[0]?.item;
		if (!candidate) break;

		const candidateTerms = terms(String(candidate.result.document));
		const coveredByCandidate = missing.filter((term) =>
			candidateTerms.has(term),
		);
		if (selected.length < limit) {
			selected.push(candidate);
		} else {
			const removableIndex = selected
				.map(({ result }) => terms(String(result.document)))
				.map((sourceTerms, index) => ({
					index,
					unique: requiredTerms.some(
						(term) =>
							sourceTerms.has(term) &&
							selected.filter(({ result }) =>
								terms(String(result.document)).has(term),
							).length === 1,
					),
				}))
				.find(({ unique }) => !unique)?.index;
			if (removableIndex === undefined) break;
			selected.splice(removableIndex, 1, candidate);
		}
		selectedIds.add(String(candidate.result.id));
		missing = missing.filter((term) => !coveredByCandidate.includes(term));
	}

	return selected.slice(0, limit);
}

function deduplicate(
	results: Awaited<ReturnType<typeof handbookIndex.search>>,
) {
	return [
		...new Map(results.map((result) => [String(result.id), result])).values(),
	];
}

/** Generic IDF-weighted lexical reranking over semantic candidates. */
function rerank(
	query: string,
	results: Awaited<ReturnType<typeof handbookIndex.search>>,
) {
	const queryTerms = terms(query);
	const documentTerms = results.map((result) => terms(String(result.document)));
	const documentFrequency = new Map<string, number>();
	for (const sourceTerms of documentTerms) {
		for (const term of sourceTerms) {
			documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
		}
	}
	const averageLength =
		documentTerms.reduce((sum, sourceTerms) => sum + sourceTerms.size, 0) /
		Math.max(1, documentTerms.length);
	const k1 = 1.2;
	const b = 0.75;
	return results
		.map((result, index) => {
			const sourceTerms = documentTerms[index];
			const lengthNorm = sourceTerms.size / Math.max(1, averageLength);
			const lexicalScore = [...queryTerms].reduce((score, term) => {
				if (!sourceTerms.has(term)) return score;
				const df = documentFrequency.get(term) ?? 1;
				const idf = Math.log(1 + (results.length - df + 0.5) / (df + 0.5));
				return score + idf * ((k1 + 1) / (k1 * (1 - b + b * lengthNorm) + 1));
			}, 0);
			const canonicalBonus =
				result.metadata?.contentType === "policy" ? 0.03 : 0;
			return {
				result,
				score: result.score * 0.75 + lexicalScore * 0.25 + canonicalBonus,
				lexicalScore,
			};
		})
		.sort((left, right) => right.score - left.score)
		.filter((item, index, ranked) => {
			const normalized = String(item.result.document)
				.replace(/\s+/g, " ")
				.trim();
			return (
				ranked.findIndex(
					({ result }) =>
						String(result.document).replace(/\s+/g, " ").trim() === normalized,
				) === index
			);
		});
}

export const handbookSearch = createTool({
	name: "handbookSearch",
	description:
		"Search the Devscale employee handbook. Returns ranked source evidence and provenance; base factual answers only on the returned source text.",
	input: z.object({
		query: z.string().describe("The handbook question or policy to look up."),
		topK: z.number().int().positive().optional(),
	}),
	execute: async ({ query, topK }) => {
		const resultLimit = Math.min(4, Math.max(2, topK ?? 3));
		const primary = await handbookIndex.search({
			query,
			topK: 12,
			filter: { type: "eq", key: "contentType", value: "policy" },
		});
		let ranked = rerank(query, primary);
		const focused = ranked.slice(0, resultLimit);
		if (process.env.HANDBOOK_SEARCH_DEBUG === "1") {
			console.error(
				JSON.stringify({
					candidates: primary.map((result, index) => ({
						chunkId: result.metadata?.chunkId ?? result.id,
						denseRank: index + 1,
					})),
					initialRanking: ranked.map(
						({ result, score, lexicalScore }, index) => ({
							chunkId: result.metadata?.chunkId ?? result.id,
							lexicalScore,
							score,
							finalRank: index + 1,
						}),
					),
				}),
			);
		}
		const queryDistinctiveTerms = distinctiveTerms(query);
		let missing = queryDistinctiveTerms.filter(
			(term) =>
				!focused.some(({ result }) => terms(String(result.document)).has(term)),
		);
		// A query whose terms are split across unrelated excerpts is still
		// under-covered: rescue may find one coherent evidence chunk.
		if (
			missing.length === 0 &&
			queryDistinctiveTerms.length >= 3 &&
			!focused.some(({ result }) => {
				const sourceTerms = terms(String(result.document));
				return queryDistinctiveTerms.every((term) => sourceTerms.has(term));
			})
		) {
			missing = queryDistinctiveTerms;
		}
		if (missing.length > 0) {
			const rescue = await handbookIndex.search({
				query: missing.join(" "),
				topK: 12,
				filter: { type: "eq", key: "contentType", value: "policy" },
			});
			const rescuedRanking = rerank(
				query,
				deduplicate([...primary, ...rescue]),
			);
			ranked = admitCoverageCandidates({
				focused,
				candidates: rescuedRanking,
				// Include all distinctive terms so eviction protects evidence that
				// was already covered before rescue began.
				requiredTerms: queryDistinctiveTerms,
				limit: resultLimit,
			}).map((result) => result);
			if (process.env.HANDBOOK_SEARCH_DEBUG === "1") {
				console.error(
					JSON.stringify({
						rescueTermCount: missing.length,
						rescueCandidates: rescue.map((result, index) => ({
							chunkId: result.metadata?.chunkId ?? result.id,
							denseRank: index + 1,
						})),
						finalRanking: ranked.map(
							({ result, score, lexicalScore }, index) => ({
								chunkId: result.metadata?.chunkId ?? result.id,
								lexicalScore,
								score,
								finalRank: index + 1,
							}),
						),
					}),
				);
			}
		}
		return ranked.slice(0, resultLimit).map(({ result, score }, index) => ({
			rank: index + 1,
			score,
			documentId: String(
				result.metadata?.documentId ?? "devscale-employee-handbook",
			),
			sectionId: String(
				result.metadata?.sectionId ?? result.metadata?.section ?? result.id,
			),
			chunkId: String(result.metadata?.chunkId ?? result.id),
			sourceText: String(result.document),
		}));
	},
});
