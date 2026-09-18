import { createContext, type ReactNode, useContext, useState } from "react";
import type {
	CorrectionRequest,
	ValuationDetails,
	ValuationOutcome,
} from "../type";
import { createMockValuationResult } from "./valuation-gateway";

export const defaultValuationDetails: ValuationDetails = {
	productName: "Sony PlayStation 5 Slim Disc Edition 1 TB",
	productCondition: "Baik",
	productDescription:
		"Lengkap dus dan satu controller. Ada lecet halus di sudut casing.",
	location: "Jakarta Selatan",
};

type ValuationSession = {
	resultDetails: ValuationDetails;
	setResultDetails: (details: ValuationDetails) => void;
	outcome: ValuationOutcome;
	setOutcome: (outcome: ValuationOutcome) => void;
	correction: CorrectionRequest | null;
	setCorrection: (correction: CorrectionRequest | null) => void;
	resumeAtDetails: boolean;
	setResumeAtDetails: (resume: boolean) => void;
};

const ValuationSessionContext = createContext<ValuationSession | null>(null);

export function ValuationSessionProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [resultDetails, setResultDetails] = useState(defaultValuationDetails);
	const [outcome, setOutcome] = useState<ValuationOutcome>({
		source: "mock",
		result: createMockValuationResult(),
	});
	const [correction, setCorrection] = useState<CorrectionRequest | null>(null);
	const [resumeAtDetails, setResumeAtDetails] = useState(false);

	return (
		<ValuationSessionContext.Provider
			value={{
				resultDetails,
				setResultDetails,
				outcome,
				setOutcome,
				correction,
				setCorrection,
				resumeAtDetails,
				setResumeAtDetails,
			}}
		>
			{children}
		</ValuationSessionContext.Provider>
	);
}

export function useValuationSession() {
	const session = useContext(ValuationSessionContext);

	if (!session) {
		throw new Error(
			"useValuationSession must be used within ValuationSessionProvider.",
		);
	}

	return session;
}
