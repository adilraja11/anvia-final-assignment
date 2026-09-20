import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { valuationQueue } from "../../config/queue.js";
import {
	createOrReuseValuation,
	createResponse,
	isValidIdempotencyKey,
	readResponse,
	readValuation,
	ValuationServiceError,
} from "../valuations/valuation-service.js";
import {
	getValuationInputSchema,
	getValuationOutputSchema,
	getValuationToolInputSchema,
	startValuationInputSchema,
	startValuationOutputSchema,
	startValuationToolInputSchema,
} from "./schema.js";

const POLL_AFTER_MS = 1_000;

const errorMessages = {
	INVALID_REQUEST: "Permintaan tidak valid.",
	RESOURCE_NOT_FOUND: "Sumber daya tidak ditemukan.",
	IDEMPOTENCY_CONFLICT:
		"Kunci idempotensi sudah digunakan untuk permintaan yang berbeda.",
	RATE_LIMITED: "Batas penggunaan tercapai.",
	INTERNAL_SERVICE_FAILURE: "Layanan sedang bermasalah.",
	SERVICE_UNAVAILABLE: "Layanan sementara tidak tersedia.",
} as const;

type McpErrorCode = keyof typeof errorMessages;

function toolError(code: McpErrorCode) {
	const error = { code, message: errorMessages[code] };
	return {
		content: [{ type: "text" as const, text: error.message }],
		structuredContent: { error },
		isError: true,
	};
}

function toolSuccess(structuredContent: Record<string, unknown>, text: string) {
	return {
		content: [{ type: "text" as const, text }],
		structuredContent,
	};
}

function ownerKey() {
	const configured = process.env.MCP_MVP_OWNER_KEY?.trim();
	return configured || undefined;
}

async function queueStage(valuationId: string) {
	try {
		const job = await valuationQueue.getJob(valuationId);
		return typeof job?.progress === "string" ? job.progress : undefined;
	} catch {
		return undefined;
	}
}

function createServer() {
	const server = new McpServer({
		name: "asli-segini-valuation",
		version: "1.0.0",
	});

	server.registerTool(
		"start_valuation",
		{
			title: "Mulai valuasi barang bekas",
			description:
				"Membuat atau menggunakan ulang valuasi asinkron untuk satu elektronik bekas. Estimasi menggunakan harga penawaran Blibli, bukan harga resmi, harga asli, atau harga transaksi selesai.",
			inputSchema: startValuationToolInputSchema,
			outputSchema: startValuationOutputSchema,
			annotations: { readOnlyHint: false, idempotentHint: true },
		},
		async (input) => {
			const parsed = startValuationInputSchema.safeParse(input);
			if (
				!parsed.success ||
				(parsed.data.idempotencyKey !== undefined &&
					!isValidIdempotencyKey(parsed.data.idempotencyKey))
			)
				return toolError("INVALID_REQUEST");
			const configuredOwnerKey = ownerKey();
			if (!configuredOwnerKey) return toolError("SERVICE_UNAVAILABLE");
			try {
				const valuation = await createOrReuseValuation(
					configuredOwnerKey,
					parsed.data.idempotencyKey,
					parsed.data,
				);
				const response = startValuationOutputSchema.parse(
					createResponse(valuation),
				);
				return toolSuccess(
					response,
					`Valuasi dibuat. Panggil get_valuation dengan ID ${response.valuation.id} setelah ${POLL_AFTER_MS} ms.`,
				);
			} catch (error) {
				if (error instanceof ValuationServiceError)
					return toolError(error.code);
				return toolError("INTERNAL_SERVICE_FAILURE");
			}
		},
	);

	server.registerTool(
		"get_valuation",
		{
			title: "Baca hasil valuasi",
			description:
				"Membaca status atau hasil valuasi yang sebelumnya dibuat. Hasil dapat masih menunggu. Estimasi menggunakan harga penawaran Blibli, bukan harga resmi, harga asli, atau harga transaksi selesai.",
			inputSchema: getValuationToolInputSchema,
			outputSchema: getValuationOutputSchema,
			annotations: { readOnlyHint: true },
		},
		async (input) => {
			const parsed = getValuationInputSchema.safeParse(input);
			if (!parsed.success) return toolError("INVALID_REQUEST");
			const configuredOwnerKey = ownerKey();
			if (!configuredOwnerKey) return toolError("SERVICE_UNAVAILABLE");
			try {
				const stored = await readValuation(
					configuredOwnerKey,
					parsed.data.valuationId,
				);
				if (!stored) return toolError("RESOURCE_NOT_FOUND");
				const response = getValuationOutputSchema.parse(
					readResponse(
						stored.valuation,
						stored.acceptedComparableCount,
						stored.evidenceRetrievedAt,
						await queueStage(stored.valuation.id),
					),
				);
				const pending = response.result === null;
				return toolSuccess(
					response,
					pending
						? `Valuasi ${response.valuation.id} masih diproses. Panggil get_valuation lagi setelah ${response.valuation.pollAfterMs} ms.`
						: `Valuasi ${response.valuation.id} telah selesai.`,
				);
			} catch {
				return toolError("INTERNAL_SERVICE_FAILURE");
			}
		},
	);

	return server;
}

export async function handleMcpRequest(request: Request) {
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	const server = createServer();
	await server.connect(transport);
	const response = await transport.handleRequest(request);
	response.headers.set("cache-control", "no-store");
	return response;
}
