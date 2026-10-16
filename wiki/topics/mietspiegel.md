---
title: "Mietspiegel für München 2025 (rent index)"
type: topic
summary: "What the qualified 2025 rent index is, how the comparative rent is computed, the six location classes, and caveats."
tags: [wohnen, mieten, recht]
sources:
  - https://2025.mietspiegel-muenchen.de/
  - https://2025.mietspiegel-muenchen.de/broschueren/Mietspiegel_2025_Broschuere.pdf
  - https://2025.mietspiegel-muenchen.de/broschueren/Dokumentation_MS25.pdf
  - https://stadt.muenchen.de/infos/mietspiegel.html
updated: 2026-09-25
updated_by: maintainer-agent (initial ingest)
---

# Mietspiegel für München 2025

The Mietspiegel states the **local comparative rent** (*ortsübliche Vergleichsmiete*) for freely financed rental flats in Munich. It is a **qualified** rent index under § 558d BGB: landlords use it to justify rent increases, tenants to check them, and it is the reference for the Mietpreisbremse.

- Published after the Sozialausschuss decision on **20.03.2025**, recognised as qualified by the full council on **26.03.2025** (Sitzungsvorlage 20-26 / V 15504). No end date is published; it stays current until replaced.
- Based on rents newly agreed or changed between February 2018 and January 2024 (survey by LMU and Kantar).
- Covers flats of **20 to 160 m²** in buildings completed **up to 2023**. Not for social housing (*preisgebunden*), commercial space, shelters or student halls.

## How the rent is computed

1. **Base price** (*Grundpreis*, Table 2) from living area and building-year class (11 classes, from "bis 1918" to "2022-2023"). Areas round up to the next table row: 80.3 m² uses the 81-82 m² row.
2. **Surcharges and deductions** (Table 3) in euros per m²: location class, building type (Hochhaus, Wohnblock), house type (e.g. einfacher/guter Altbau), heating, bathroom, kitchen, floor, balcony, special equipment, modernised windows.
3. For gross rents, add the average **operating costs** included in the rent (Table 1).
4. The **range** (Table 4) covers two thirds of comparable rents: roughly -2.81 to +2.77 €/m² (non-central locations) or -3.71 to +3.80 €/m² (central locations) around the average.
5. Optional **justified deviations** (Table 5), capped to the range.

munichMCP's `estimate_rent` implements exactly this. It was verified against the official calculator on 2026-09-25 (all 770 base-price cells and 10 full example cases match to the cent).

## The six location classes (*Wohnlagen*)

Durchschnittliche, gute and beste Lage, and their **central** variants (zentrale durchschnittliche, zentrale gute, zentrale beste Lage). The class comes from the official Wohnlagen map and is decided by the colour at the flat's position; busy streets can downgrade the first row of houses. The city's map service is not open for automated use, so munichMCP asks the user for the class and links to the [official map](https://geoportal-karten-2025.muenchen.de/mietspiegel_wohnlage).

## Caveats

- An estimate is not legal advice; individual flats can justify deviations.
- The city reserves all rights to the Mietspiegel publication. munichMCP uses the published method for individual calculations with attribution.
- Whether the Mietspiegel still counts as qualified after its two-year adjustment window is a legal question.

## Related

[[topics/milieuschutz]], [[entities/stadtrat]], [[entities/stadtbezirke]]
