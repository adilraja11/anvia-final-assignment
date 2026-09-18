import { useCallback } from "react";
import type {
	ValuationGateway,
	ValuationInput,
	ValuationResult,
} from "../type";

export function useValuation(gateway: ValuationGateway | null) {
	return useCallback(
		(input: ValuationInput, signal?: AbortSignal): Promise<ValuationResult> => {
			if (!gateway) {
				return Promise.reject(
					new Error("Integrasi API lokal tidak tersedia untuk permintaan ini."),
				);
			}
			return gateway.requestValuation(input, signal);
		},
		[gateway],
	);
}
