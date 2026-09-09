import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { embedDocuments } from "@anvia/core/embeddings";
import { QdrantVectorStore } from "@anvia/qdrant";
import { createTransformersEmbeddingModel } from "@anvia/transformers";

const COLLECTION_NAME = "devscale_employee_handbook_v2";
const DOCUMENT_ID = "devscale-employee-handbook";
const INGESTION_VERSION = "2026-09-04-improvements-5";
const handbookPath = new URL(
	"../../../../documents/devscale-employee-handbook.md",
	import.meta.url,
);

type Chunk = {
	text: string;
	sectionId: string;
	chunkId: string;
	headingPath: string;
	startOffset: number;
	endOffset: number;
};

function isTableRow(line: string) {
	return /^\|.*\|\s*$/.test(line);
}

function isTableDivider(line: string) {
	return /^\|\s*:?-{3,}/.test(line);
}

/** Split Markdown by its structure, never by a handbook policy or its values. */
function chunkMarkdown(markdown: string): Chunk[] {
	const lines = markdown.split("\n");
	const offsets: number[] = [];
	let offset = 0;
	for (const line of lines) {
		offsets.push(offset);
		offset += line.length + 1;
	}

	const chunks: Chunk[] = [];
	let section = 0;
	let headingPath = "Document";
	let chunk = 0;
	const add = (text: string, startLine: number, endLine: number) => {
		const sourceText = text.trim();
		if (!sourceText) return;
		chunk += 1;
		const sectionId = `section-${String(section).padStart(2, "0")}`;
		chunks.push({
			text: `${headingPath}\n\n${sourceText}`,
			sectionId,
			chunkId: `${sectionId}-chunk-${String(chunk).padStart(3, "0")}`,
			headingPath,
			startOffset: offsets[startLine],
			endOffset: offsets[endLine] + lines[endLine].length,
		});
	};

	for (let index = 0; index < lines.length; ) {
		const line = lines[index];
		if (line.startsWith("## ")) {
			if (line.slice(3).trim().toLowerCase().startsWith("appendix:")) break;
			section += 1;
			chunk = 0;
			headingPath = line.slice(3).trim();
			index += 1;
			continue;
		}
		if (!line.trim()) {
			index += 1;
			continue;
		}
		if (isTableRow(line)) {
			const start = index;
			const header = line;
			index += 1;
			if (index < lines.length && isTableDivider(lines[index])) index += 1;
			while (index < lines.length && isTableRow(lines[index])) {
				add(`${header}\n${lines[index]}`, start, index);
				index += 1;
			}
			continue;
		}
		if (/^[-*] /.test(line)) {
			add(line, index, index);
			index += 1;
			continue;
		}
		const start = index;
		const paragraph: string[] = [];
		while (
			index < lines.length &&
			lines[index].trim() &&
			!lines[index].startsWith("## ") &&
			!isTableRow(lines[index]) &&
			!/^[-*] /.test(lines[index])
		) {
			paragraph.push(lines[index]);
			index += 1;
		}
		add(paragraph.join("\n"), start, index - 1);
	}
	return chunks;
}

const markdown = await readFile(handbookPath, "utf8");
const contentHash = createHash("sha256").update(markdown).digest("hex");
const chunks = chunkMarkdown(markdown);
console.log(`Embedding ${chunks.length} handbook chunks...`);

const model = await createTransformersEmbeddingModel();
const documents = await embedDocuments(
	model,
	chunks.map((chunk) => chunk.text),
	{
		id: (_, index) => `${DOCUMENT_ID}-${chunks[index].chunkId}`,
		content: (text) => text,
		metadata: (_, index) => ({
			documentId: DOCUMENT_ID,
			source: "devscale-employee-handbook.md",
			contentType: "policy",
			sectionId: chunks[index].sectionId,
			chunkId: chunks[index].chunkId,
			headingPath: chunks[index].headingPath,
			startOffset: chunks[index].startOffset,
			endOffset: chunks[index].endOffset,
			contentHash,
			ingestionVersion: INGESTION_VERSION,
		}),
	},
);

const store = await QdrantVectorStore.connect({
	collectionName: COLLECTION_NAME,
	vectorSize: 384,
});
await store.upsertDocuments(documents);
console.log(`Inserted ${documents.length} chunks into ${COLLECTION_NAME}.`);
