-- This is an empty migration.
ALTER TABLE "Valuation"
ADD CONSTRAINT "Valuation_valuated_fields_complete_check"
CHECK (
	(
		"status" = 'VALUATED'
		AND "suggestedListingPriceIdr" IS NOT NULL
		AND "marketRangeMinimumIdr" IS NOT NULL
		AND "marketRangeMaximumIdr" IS NOT NULL
		AND "confidence" IS NOT NULL
	)
	OR (
		"status" <> 'VALUATED'
		AND "suggestedListingPriceIdr" IS NULL
		AND "marketRangeMinimumIdr" IS NULL
		AND "marketRangeMaximumIdr" IS NULL
		AND "confidence" IS NULL
	)
);

ALTER TABLE "Valuation"
ADD CONSTRAINT "Valuation_valuated_prices_positive_and_ordered_check"
CHECK (
	"suggestedListingPriceIdr" IS NULL
	OR (
		"suggestedListingPriceIdr" > 0
		AND "marketRangeMinimumIdr" > 0
		AND "marketRangeMaximumIdr" > 0
		AND "marketRangeMinimumIdr" <= "suggestedListingPriceIdr"
		AND "suggestedListingPriceIdr" <= "marketRangeMaximumIdr"
	)
);

ALTER TABLE "ValuationEvidence"
ADD CONSTRAINT "ValuationEvidence_product_price_positive_check"
CHECK ("productPrice" > 0);
