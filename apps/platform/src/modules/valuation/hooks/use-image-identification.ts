import { useCallback } from "react";
import type { ImageIdentificationResult, ValuationGateway } from "../type";

export function useImageIdentification(gateway: ValuationGateway | null) {
	return useCallback(
		(file: File, signal?: AbortSignal): Promise<ImageIdentificationResult> => {
			if (!gateway) {
				return Promise.reject(
					new Error("Integrasi API lokal tidak tersedia untuk permintaan ini."),
				);
			}
			return gateway.identifyImage(file, signal);
		},
		[gateway],
	);
}
