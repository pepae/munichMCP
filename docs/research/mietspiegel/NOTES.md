# Mietspiegel für München 2025: calculation notes

Unofficial specification for munichMCP. Compiled 2026-09-25. Machine-readable data: `mietspiegel-2025.json`. Verified examples: `test-cases.json`. Wohnlage samples: `wohnlage-lookup-samples.json`.

Page numbers "p. N" refer to the brochure (`Mietspiegel_2025_Broschuere.pdf`, printed page = PDF page). "Doku p. N" refers to the PDF page index of `Dokumentation_MS25.pdf`. "JS" refers to `https://2025.mietspiegel-muenchen.de/js/chunk-common.1a0e12fc.js` (webpack module 20819 = router and step components, 57158 = German labels, 36781 = Vuex store).

## 1. Sources and what each one provided

| Source | Used for |
|---|---|
| Online calculator `https://2025.mietspiegel-muenchen.de/berechnung.html` (Vue app) | Step order, option ids, labels, conflict rules, surcharge table copy (route `/zuschlaege`), request format |
| Calculation endpoint `POST /api/backend-service/berechnung` | The actual calculation runs server-side (no formula in the client JS). Used read-only with hypothetical flats to verify every number and rule below |
| Brochure (38 pages, Stand 01/2024) | Tables 1 to 7, definitions, applicability, map legend |
| Documentation (159 pages) | Regression model, spans, operating cost method, council decision (scan) |
| `gesetzeslage.html`, `dokumentation.html`, city page `stadt.muenchen.de/infos/mietspiegel.html` | Dates and legal status |
| Geoportal (Masterportal config, WMS/WCS, metadata) | How the Wohnlage is determined, raster colours, license terms |

## 2. Verification status

Everything in `mietspiegel-2025.json` was checked against the official server logic on 2026-09-25 (913 POST requests with invented flat data, throttled to roughly one per second, no personal data):

- All 770 Grundpreis cells (70 area rows x 11 year classes): 0 mismatches against the PDF table.
- 132 targeted probes: area boundaries, invalid input, every Wohnlage, every surcharge, every operating cost item, deviation caps, server-side conflict checks, rounding edge cases (including negative half-cents).
- 10 varied full test cases (`test-cases.json`), all status 200.
- A reference implementation of the formulas in section 3, step 19 (exact decimals, HALF_UP) reproduces every field of all 889 successful responses exactly and rejects all 24 inputs the server refused.

## 3. Algorithm in the order of the official calculator

The calculator walks through these screens in this order (JS router pushes): Wohnfläche, Baujahr, Wohnlage, Gebäudetyp, Haustyp, Heizung, Fußbodenheizung, Sanitärbereich, Küche, Küchengrundausstattung, Elektrogeräte, Fußboden, Modernisierter Boden, Terrasse/Balkon, Besondere Ausstattung, Modernisierte Fenster, Begründete Abweichungen, Betriebskosten, then "Miete berechnen" (POST). Nothing is computed before the last step; the steps only collect inputs.

### Step 0: Is the Mietspiegel applicable? (p. 7, p. 16)

Applies to freely financed rental flats in Munich. Not applicable to price-bound flats (social housing, Belegrechtswohnungen), commercial premises, homeless shelters, student and youth dormitories. Not directly applicable (orientation only) to: furnished flats; detached, semi-detached and terraced houses, single rooms, penthouses; company flats; basement flats; temporary-use housing; rent-free or owner-occupied housing; private sublets; flats with rent caps from official requirements; flats whose kitchen, toilet and bath are shared; flats without kitchen, bathroom or toilet; flats without landlord-equipped bathroom, landlord-provided heating or landlord-provided hot water; housing in institutions with services; flats under 20 m² or over 160 m². The MCP tool should refuse or clearly warn in these cases.

### Step 1: Wohnfläche (living area)

- Accept 20 <= area <= 160 m², at most 3 decimals. The server returns HTTP 400 outside this range.
- Keep the exact area for all monthly amounts.
- Row for the Grundpreis: `n = ceil(area)`; use the row whose integer range contains `n` (the first row is 20-22). So 22.001 goes to 23-24 and 80.3 goes to 81-82 (p. 11, "nächsthöhere Wohnflächenkategorie"; verified).

### Step 2: Baujahr (year of construction) -> year class (p. 10, JS `computeSelection`)

`<=1918 -> 0 (bis 1918)`, `<=1929 -> 1`, `<=1948 -> 2`, `<=1966 -> 3`, `<=1977 -> 4`, `<=1988 -> 5`, `<=1998 -> 6`, `<=2008 -> 7`, `<=2018 -> 8`, `<=2021 -> 9`, `<=2023 -> 10`. Years after 2023 are not covered (the calculator rejects them). Use the completion year of the building; after a Kernsanierung, or for living space newly created by extension or conversion (e.g. attic conversion), use the year the works were completed. Tenant-paid equipment or modernisation never counts.

Shorthands used below: "before 1949" = classes 0-2, "1949 to 1977" = 3-4, "1949 to 1998" = 3-6, "before 1999" = 0-6, "before 2019" = 0-8, "after 1948" = 3-10.

### Step 3: Wohnlage (Table 3.1, p. 12-14; map p. 27-38)

Exactly one of six categories, read from the official map (see section 6):

| id (calculator) | Category | Surcharge EUR/m² | Range group |
|---|---|---|---|
| 0 | Durchschnittliche Lage (hellblau) | 0.00 | non-central |
| 1 | Gute Lage (gelb) | +0.43 | non-central |
| 2 | Beste Lage (hellrot) | +2.10 | non-central |
| 3 | Zentrale durchschnittliche Lage (dunkelblau) | +0.80 | central |
| 4 | Zentrale gute Lage (orange) | +2.29 | central |
| 5 | Zentrale beste Lage (dunkelrot) | +2.70 | central |

Coloured street bands (Lageabstufungen) override the area colour for the first row of houses only; the actual position of the flat (front or rear building) matters, not the postal address (p. 13).

### Step 4: Gebäudetyp (Table 3.2, p. 14), at most one

- Hochhaus oder höheres Gebäude, -0.96: completed after 1948 and before 1999, at least E+6, detached or adjoining a building of the same type. An at least partly converted attic counts as a storey.
- Wohnblock, -1.13: no elevator, larger green/landscaped area belonging to the building, at most E+5, and either detached with more than two house numbers or adjoining a building of the same type with more than five flats (for the house number of the flat). No year restriction.
- Anderer Gebäudetyp: 0.00.

### Step 5: Haustyp (Table 3.3, p. 14-16, scheme p. 19), exactly one

Style elements: stucco somewhere on wall or ceiling; largest living room higher than 2.90 m (highest point, sloped ceilings ignored); largest living room larger than 20 m². Attic: "not or partly converted" versus "fully converted or none" (a Spitzboden does not count).

- Sehr einfacher Altbau, -2.58: before 1949, attic not/partly converted, no style element.
- Einfacher Altbau, -1.21: before 1949 and (attic not/partly converted with at least one style element, or attic fully converted/none without style element).
- Guter Altbau, +0.36: before 1949, attic fully converted or none, at least one style element.
- Einfacher Nachkriegsbau, -1.14: 1949 to 1977 with an attic not or partly converted.
- Anderer Haustyp, 0.00: after 1948 and not Einfacher Nachkriegsbau.

So a pre-1949 flat always gets one of the three Altbau types; a flat from 1978 or later is always "Anderer Haustyp".

### Step 6: Unvollständige Beheizung (Table 3.4, p. 16), -2.21

At least one living room without landlord-provided heating (bath, WC, hall, kitchen ignored; with more than four living rooms only the four largest count). A flat without any landlord-provided heating is outside the scope.

### Step 7: Fußbodenheizung (p. 16), +1.00

Underfloor heating in a building from before 1999. Combinable with step 6.

### Step 8: Sanitärbereich (Table 3.5, p. 16), +0.62 each, all combinable

Extra equipment in the bath (bathtub plus separate shower plus second washbasin or double basin and/or bidet); non-electric towel radiator; separate floor-level shower; largest bath at least 6 m² and/or a second equipped bath; modernised bath (building before 1999, bath renewed 2019 or later incl. tub/shower and wall and floor coverings). "None" is exclusive.

### Steps 9 to 11: Küche (Table 3.6, p. 17)

- Offene Küche, +0.55: kitchen open to the dining/living room and clearly distinguishable from it; a cooking niche inside a living room does not count.
- Küchengrundausstattung (sink plus built-in cupboards or kitchen island provided by the landlord) carries no amount itself but is required for appliance surcharges.
- Elektrogeräte, +0.53 each (combinable): ceramic or induction hob; fridge or fridge-freezer; dishwasher. Without Grundausstattung no appliance surcharge (server returns 400 if sent).

### Steps 12 and 13: Fußboden (Table 3.7, p. 17-18)

Only living rooms, four largest if more than four. Exactly one of: Ohne Fußbodenbelag -1.54 (a living room without landlord-provided covering); Einfacher Boden -1.12 (all rooms covered, more than half carpet or PVC/vinyl); Guter Boden +1.37 (every room parquet, laminate, quality floorboards, natural stone or tiles); neither 0.00. Independently: Modernisierter Boden +1.86 (building before 2019, floors of all living rooms renewed by the landlord 2019 or later; not combinable with "ohne Fußbodenbelag").

### Step 14: Terrasse/Dachterrasse/Balkon/Loggia (Table 3.8, p. 18), +0.55

Building before 1999, at least one terrace, roof terrace, balcony or loggia of at least 1 m².

### Steps 15 and 16: Weitere Merkmale (Table 3.9, p. 18)

- Besondere Ausstattung, +0.77: at least one electric roller shutter or blind, or a video intercom, provided by the landlord.
- Modernisierte Fenster, +2.10: building before 1949, all windows installed 1995 or later and at least half renewed by the landlord 2019 or later.

### Step 17: Begründete Abweichungen (Table 5, p. 21-22, 24)

Optional justified deviations in EUR/m² (orientation aid with the weight of a simple Mietspiegel only). Calculator input limits:

| Item | Limits | Year condition |
|---|---|---|
| 1 Unterschiedliche/unvollständige Warmwasserversorgung | -0.70 to 0 | none |
| 2 Rückgebäude (rear building) | 0 to +0.70 | after 1948 |
| 3 Wärmedämmung der Außenwände (since 2019) | 0 to +0.90 | 1949 to 1998 |
| 4a besonders gestaltete Fassade | 0 to +0.40 | before 1949 |
| 4b nicht besonders gestaltete Fassade | -0.25 to 0 | before 1949 |
| 5 Zusätzliche Begründungen (threshold cases, other deviations) | -4.50 to +4.00 | none |

4a and 4b are mutually exclusive. The sum S of all entered deviations is capped to the fluctuation range used in step 19: `S_capped = min(max(S, down), up)` (p. 21, p. 24; verified).

### Step 18: Betriebskosten (Table 1, p. 9; hint p. 8)

- Nettomiete (normal case): nothing is added.
- Bruttomiete or Teilinklusivmiete: add the average of every cost type that is included in the rent. Per m² and month: Wasser/Abwasser 0.34, Straßenreinigung 0.07, Müllabfuhr 0.21, Grundsteuer 0.25, Sach-/Haftpflichtversicherung 0.28, Kaminkehrer 0.09, Hausbeleuchtung 0.10, Aufzug 0.20, Waschmaschine 0.04, Hausmeister 0.48, Gartenpflege 0.09, Hausreinigung 0.22, Schneebeseitigung 0.05, Reinigung/Wartung Etagenheizung/Warmwassergeräte 0.22, Heizung/Warmwasser 1.60 (sum 4.24). Per flat and month: Gemeinschaftsantenne 7.33, Satellitenschüssel 8.48, Kabelfernsehen 8.17 (sum 23.98), divided by the area for the per-m² figure.
- Calculator field semantics (important, verified): `selectedBetriebskostenB` lists the items INCLUDED in the rent. The UI starts with all 18 checked; unchecked (struck-through) items are the ones paid separately. With `selectedBetriebskostenA = 0` the list is ignored.
- Since 1 July 2024 cable TV / shared antenna costs may no longer be passed on as operating costs (p. 8); the averages still reflect January 2024.

### Step 19: Compute (Tables 6a, 6b, 7, p. 23-24)

The server first rejects invalid input with HTTP 400: area outside 20..160, deviation outside its limits, or any conflict (Hochhaus not 1949-1998; Altbau types not before 1949; Nachkriegsbau not 1949-1977; Anderer Haustyp before 1949; Fußbodenheizung, modernised bath or balcony from 1999; appliances without Grundausstattung; modernised floor from 2019 or with "ohne Belag"; modernised windows after 1948; Rückgebäude before 1949; Wärmedämmung outside 1949-1998; facade after 1948). Then:

```
G   = Grundpreis[row(ceil(area))][yearClass]          (Table 2)
Z   = sum of Table 3 amounts from steps 3 to 16
BKq = included per-m² operating costs                   (0 for Nettomiete)
BKf = included per-flat operating costs                 (0 for Nettomiete)
monthly  = (G + Z + BKq) * area + BKf                  exact
perSqm   = monthly / area                              exact
(down, up) = (-3.71, +3.80) if Wohnlage central else (-2.81, +2.77)     (Table 4, p. 20)
low      = perSqm + down        lowMonthly  = monthly + down * area
high     = perSqm + up          highMonthly = monthly + up * area
S        = sum of deviations;  Sc = min(max(S, down), up)
withDev  = perSqm + Sc          withDevMonthly = monthly + Sc * area
flags: tooHigh = S > up, tooLow = S < down
```

Rounding (verified on discriminating cases): exact decimal arithmetic, each output rounded once at the end to 2 decimals with HALF_UP (half away from zero, also for negatives: -0.125 -> -0.13). Monthly values are never derived from the rounded per-m² value (with cable TV, 44.25 m² gives 17.81 EUR/m² but 787.97 EUR/month, not 788.09). Do not use binary floating point: 21.5 m² x 19.29 = 414.735 must give 414.74, which a plain JS float calculation gets wrong. Either use a decimal library with ROUND_HALF_UP (e.g. decimal.js or big.js), or integers (BigInt or safe integers):

```
a  = area in thousandths of m²                            (44.25 -> 44250)
c  = G + Z + BKq in tenths of a cent per m²              (19.78 -> 19780)
f  = BKf in tenths of a cent per flat                     (8.17 -> 8170)
d  = range.down, range.up or Sc in tenths of a cent/m²   (-2.81 -> -2810; deviation 0.123 -> 123)
m  = c*a + f*1000                                         monthly amount in 1/10000 cent, exact
monthlyCents      = roundHalfUp(m, 10000)
perSqmCents       = roundHalfUp(m, 10*a)
lowMonthlyCents   = roundHalfUp(m + d_down*a, 10000)      lowPerSqmCents  = roundHalfUp(m + d_down*a, 10*a)
highMonthlyCents  = roundHalfUp(m + d_up*a, 10000)        highPerSqmCents = roundHalfUp(m + d_up*a, 10*a)
withDevMonthly    = roundHalfUp(m + d_Sc*a, 10000)        withDevPerSqm   = roundHalfUp(m + d_Sc*a, 10*a)
roundHalfUp(n, q) = sign(n) * floor((2*|n| + q) / (2*q))  (integers or BigInt, q > 0)
```

TC07: m = 19780*44250 + 8170*1000 = 883435000 -> monthly 88344 cents = 883.44, per m² 1996 cents = 19.96. This recipe was run in Node.js (BigInt) against all 888 successful official responses stored in `test-cases.json` (cases, probes and grid): 0 mismatches.

Results are not clamped: an extreme but valid combination can yield a negative lower range (verified). The official API returns German-formatted strings (`"1.056,18"`, `"-2,81"`).

### Worked example (TC07 in test-cases.json)

44.25 m², built 2010 (class 8), Zentrale durchschnittliche Lage, separate floor-level shower, Grundausstattung with induction hob, modernised floor, rent includes water, waste and cable TV.
Row ceil(44.25) = 45 -> 45-46, G = 15.42. Z = 0.80 + 0.62 + 0.53 + 1.86 = 3.81. BKq = 0.34 + 0.21 = 0.55, BKf = 8.17.
monthly = 19.78 x 44.25 + 8.17 = 883.435 -> 883.44; perSqm = 19.9646... -> 19.96; central range: 16.25 to 23.76 EUR/m², 719.27 to 1051.59 EUR/month. The official calculator returns exactly these values.

## 4. Mapping to the brochure's six Arbeitsschritte (p. 8)

1 operating costs (Table 1) -> 2 Grundpreis (Table 2) -> 3 surcharges (Table 3) -> 4 ranges (Table 4) -> 5 justified deviations (Table 5) -> 6 sums in Tables 6a, 6b, 7. The calculator asks the same questions in a different order (location and equipment first, operating costs last), but the arithmetic is identical and order-independent.

## 5. Official API (for verification only)

`POST https://2025.mietspiegel-muenchen.de/api/backend-service/berechnung`, JSON body = the Vuex `berechnung` state (full field list and meanings in `mietspiegel-2025.json#/calculatorApi`). No authentication. Quirks: lists mixing "none" with features are counted element by element; fassadeA and fassadeB are summed; `abweichungGesetzt` is ignored; a null field produces a 503 error page. There are no published API terms; use it only sparingly with hypothetical data.

## 6. Wohnlage lookup

**How the official calculator does it.** It does not look the Wohnlage up. On the Wohnlage screen the user types street and number (autocomplete `GET /api/backend-service/adresssuche?searchString=...`, answer `[{"x_koord":691648,"label":"Marienpl. 8","y_koord":5334777}]` in EPSG:25832) and opens the map `https://geoportal-karten-2025.muenchen.de/mietspiegel_wohnlage?query=<address>` (URL from `GET /api/environmentInfo`). That Masterportal app shows the Wohnlagenkarte raster with an address marker and six colour buttons; the user reads the colour and clicks. The map sends `postMessage({lage: "<0..5>", address})` back to the calculator, which sets the category. The user can also choose manually. So there is no official address-to-Wohnlage answer to compare against; a careful user reading the same raster at the same marker is the reference.

**Data behind the map.** WMS raster `soz:mietspiegel_2025` at `https://geoportal.muenchen.de/geoserver/soz/wms` (the official map uses `soz_iso:mietspiegel_aktuell`, pixel-identical today, but "aktuell" will switch to the next Mietspiegel). Native resolution 0.279 m/px, RGB image pyramid with fills, street bands, block outlines, labels and transit symbols. GetFeatureInfo only returns `{RED_BAND, GREEN_BAND, BLUE_BAND}`; WCS `soz__mietspiegel_2025` delivers GeoTIFF windows. GetLegendGraphic is useless (generic icon). No street list and no open data set exist (checked opendata.muenchen.de).

**Colour mapping (measured in the raster, not the button colours).** 0 `#80FFFF` (128,255,255); 1 `#FFFF00`; 2 `#FF7F7F` (255,127,127); 3 `#0070FF` (0,112,255) and street band `#005CE6` (0,92,230); 4 `#FFB200` (255,178,0); 5 `#FF0000`. The map's buttons use slightly different colours for 2, 3 and 4 (`#ff9999`, `#0066ff`, `#ffb300`), so do not match against those. Ignore: white (unrated, streets, squares), (230,230,230) green area, (143,143,143) water, (178,178,178) grey areas, (87,87,87) outlines, black labels, purple (204,102,255) district boundaries, green (85,255,0) central-area boundary, U-Bahn blue (0,153,255), S-Bahn green (0,204,0).

**Anti-aliasing.** Yes, edges are anti-aliased (e.g. 254,254,0 or 228,43,43) and coarser pyramid levels blend more. Plain nearest-colour snapping is unsafe (the U-Bahn symbol is only about 41 RGB units away from category 3). Match exact palette colours only and skip everything else.

**Why a single pixel is not enough.** Address points often sit on a block outline, a label or an unrated white plot (7 of 9 public addresses in a first single-pixel GetFeatureInfo test returned no category colour). Use a neighbourhood.

**Recommended deterministic lookup** (implemented in the research prototype, results in `wohnlage-lookup-samples.json`):

1. Geocode to EPSG:25832 (calculator autocomplete, the map gazetteer `https://geoportal-karten-2025.muenchen.de/perl/gazetteer.pl?address=...`, or the GeoPortal address index munichMCP already uses; all three give the same points within 0.5 m).
2. WMS GetMap `bbox=x-30,y-30,x+30,y+30&width=215&height=215&crs=EPSG:25832&format=image/png` (one request).
3. Classify pixels by exact palette match.
4. The nearest classified pixel decides; report its distance and any other category within that distance + 10 m.
5. Confidence high (centre classified or within 5 m, no competitor), medium (within 15 m), low, or none (nothing within 30 m: unrated area, individual assessment needed).
6. Always return it as a proposal with the official map link for confirmation.

In the 16 samples the prototype gave plausible results for all six categories, the street band case (Rosenheimer Str. 100 -> zentral durchschnittlich via the band, orange fill 13 m away) and unrated office locations (none).

**License and terms.** The WMS metadata (record 8557f73e-f052-4d42-a321-d2f59ce5a6f6) says use of the web service requires a separate agreement with the Sozialreferat (free of charge), with terms referenced at the Sozialreferat Mietspiegel page. The brochure and the site reserve all rights to the Mietspiegel, its documentation and online publication. Attribution in the official map: "© LHM Sozialreferat", base maps "© GeodatenService München". Before shipping an automated lookup, contact the Sozialreferat (mietberatung.soz@muenchen.de); before redistributing the tables, clarify reuse with the city.

## 7. Uncertainties and open points

1. **Legal end of validity.** Published 20.03.2025 (Sozialausschuss), recognised as qualified 26.03.2025 (Stadtrat, Sitzungsvorlage 20-26 / V 15504). No end date is published. § 558d Abs. 2 BGB requires adaptation after two years measured from the data Stichtag (January 2024); whether the qualified-status presumption still holds at a given date is a legal question not answered here. The successor would be a Mietspiegel 2027.
2. **Wohnlage automation is an approximation.** The official step is a visual reading. The band rule (first row of houses only), rear buildings, unrated commercial or post-2024 new-build areas and individual deviations cannot be decided from an address point. Gazetteer points are usually at the building or entrance but this is not documented.
3. **Meaning of the dark-blue band (0,92,230).** Mapped to "Zentrale durchschnittliche Lage" because it is the only extra shade found (about 75 sampled windows) and sits in the dark-blue family in orange areas along busy central streets; not documented by the city. Other band shades may exist in unsampled areas; unknown colours are simply ignored by the recommended algorithm.
4. **Neutral colours.** (230,230,230) green area and (143,143,143) water were checked at the Englischer Garten and the Isar; (178,178,178) as commercial area is inferred.
5. **Server behaviour outside the UI.** Mixed "none"/feature lists, both facade values, empty lists and `abweichungGesetzt` behave as described in section 5; the spec recommends rejecting such inputs rather than mimicking them. Areas with more than 3 decimals were not tested (the UI blocks them).
6. **Deviation cap comparison.** The cap uses the unrounded sum (consistent with all tests, e.g. S = 2.77 not flagged, 4.00 flagged); sums with more than 2 decimals just above a limit were not tested.
7. **Year classes at the edges.** The table ends with 2022-2023; flats in buildings completed from 2024 on are not covered (calculator refuses).
8. **Condition texts.** The English condition texts are paraphrases; in disputes the German wording on the cited brochure pages is authoritative.
9. **Copyright.** The rights reservation in the brochure (p. 2) covers the Mietspiegel and its online publication. The JSON contains the numeric tables and paraphrased conditions with references; confirm redistribution with the city before publishing the data set.
