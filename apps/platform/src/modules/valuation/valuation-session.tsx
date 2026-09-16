import { createContext, type ReactNode, useContext, useState } from "react";

export type ValuationDetails = {
	name: string;
	condition: string;
	askingPrice: string;
	notes: string;
	location: string;
};

export const defaultValuationDetails: ValuationDetails = {
	name: "Sony PlayStation 5 Slim Disc 1TB",
	condition: "Baik",
	askingPrice: "7800000",
	notes: "Lengkap dus dan satu controller. Ada lecet halus di sudut casing.",
	location: "Jakarta Selatan",
};

type ValuationSession = {
	resultDetails: ValuationDetails;
	setResultDetails: (details: ValuationDetails) => void;
};

const ValuationSessionContext = createContext<ValuationSession | null>(null);

export function ValuationSessionProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [resultDetails, setResultDetails] = useState(defaultValuationDetails);

	return (
		<ValuationSessionContext.Provider
			value={{ resultDetails, setResultDetails }}
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
