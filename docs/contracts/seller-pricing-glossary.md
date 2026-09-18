# Seller-pricing glossary

## Individual seller

A person in Indonesia intending to list a second-hand electronic item that they own. This is the intended user, not a verified ownership status.

## Comparable evidence

A Blibli listing that has passed the product identity, variant, price, currency, lifecycle, duplication, and outlier checks required by the valuation engine. A used-market listing is not rejected merely because its condition category differs from the submitted item.

## New reference (`P₀`)

The median advertised price of at least three accepted, explicitly new, identity-matched Blibli listings. It is labeled to users as **"harga referensi barang baru dari Blibli"**. It is not an official price or a historical original price.

## Used market (`used_market`)

The set of accepted, explicitly used, identity-matched Blibli listings. Its median calculates `M`; its unweighted P25–P75 range is the observed market range. It may include multiple used-condition categories.

## Suggested listing price

The condition-adjusted deterministic result `P₀ × (1 − d)^t × C × M × L`, where `L` is always `1.0` in the MVP. It is a recommended starting price for a balanced sale, not a guarantee of sale price or speed.

## Observed market range

The unweighted 25th through 75th percentile range of accepted, explicitly used Blibli listings. It is displayed as **"Rentang harga pasar saat ini di Blibli (berbagai kondisi)"** and is not tailored to the submitted item's condition.

## Depreciation rate (`d`)

The versioned, application-owned annual rate for a supported category. The MVP rates are computer `0.25`, gaming console `0.20`, handphone `0.35`, tablet `0.30`, and camera `0.20`. AI cannot select or change it.

## Age (`t`)

Age in years used by the depreciation formula. It comes from either the seller's optional purchase month/year or selected age band; otherwise the application uses and discloses a category default age.

## Condition multiplier (`C`)

The deterministic factor selected from the seller-confirmed condition: `Seperti baru = 0.95`, `Baik = 0.825`, `Cukup = 0.675`, and `Rusak = 0.50`.

## Market adjustment (`M`)

The bounded advertised-market proxy `clamp(median(used_market.price_idr) / (P₀ × (1 − d)^t × C), 0.85, 1.15)`. It is not a completed-sales or demand measurement.

## Liquidity factor (`L`)

The optional urgency multiplier in the formula. It is fixed at `1.0` for this MVP: sellers cannot set it, and it does not discount a suggested price.

## Listing location

An optional city or region supplied by the seller. It affects evidence selection only and does not create an AI-generated regional price adjustment.
