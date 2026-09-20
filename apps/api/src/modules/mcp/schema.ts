import { z } from "zod";
import {
	createValuationRequestSchema,
	valuationCreateResponseSchema,
	valuationReadResponseSchema,
} from "../valuations/schema.js";

export const startValuationInputSchema = createValuationRequestSchema
	.extend({
		idempotencyKey: z
			.string()
			.regex(/^[\x20-\x7E]{16,128}$/)
			.optional(),
	})
	.strict();

export const getValuationInputSchema = z
	.object({ valuationId: z.string().trim().min(1).max(64) })
	.strict();

// MCP validates registered schemas before invoking a tool. Accept untrusted values here
// so the handler can project every invalid input to the public Indonesian error envelope.
// The descriptions preserve the public contract in tool discovery; the strict schemas above
// remain the authoritative runtime validation.
export const startValuationToolInputSchema = z
	.object({
		productName: z
			.unknown()
			.describe("Wajib: string setelah dipangkas, panjang 1–160 karakter."),
		productCondition: z
			.unknown()
			.describe("Wajib: Seperti baru, Baik, Cukup, atau Rusak."),
		productDescription: z
			.unknown()
			.optional()
			.describe(
				"Opsional: string setelah dipangkas, panjang 1–2.000 karakter.",
			),
		idempotencyKey: z
			.unknown()
			.optional()
			.describe("Opsional: 16–128 karakter ASCII yang dapat dicetak."),
	})
	.passthrough();

export const getValuationToolInputSchema = z
	.object({
		valuationId: z
			.unknown()
			.describe("Wajib: ID valuasi yang diterima sebelumnya."),
	})
	.passthrough();

export const startValuationOutputSchema = valuationCreateResponseSchema;
export const getValuationOutputSchema = valuationReadResponseSchema;
