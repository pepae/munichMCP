---
title: "Noise and flood risk at an address (Lärm und Hochwasser)"
type: topic
summary: "How loud an address is on the official EU noise maps, whether it lies in a flood hazard area, and how to read the numbers."
tags: [wohnen, umwelt, laerm, hochwasser]
sources:
  - https://www.lfu.bayern.de/laerm/umgebungslaerm/index.htm
  - https://www.lfu.bayern.de/wasser/hw_ue_gebiete/index.htm
  - https://www.lfu.bayern.de/gdi/wms/laerm/ballungsraeume
  - https://www.lfu.bayern.de/gdi/wms/wasser/ueberschwemmungsgebiete
updated: 2026-10-02
updated_by: maintainer-agent
---

# Noise and flood risk at an address (*Lärm und Hochwasser*)

Two of the most common flat-hunting questions, "how loud is it?" and "can it flood?", have official answers from the Bavarian Environment Agency (*Bayerisches Landesamt für Umwelt*, LfU). munichMCP's `noise_and_flood` tool reads both maps for any address and shows them as switchable map layers; `address_report` includes a summary.

## Noise (*Umgebungslärm*)

The EU Environmental Noise Directive requires noise maps for large agglomerations every five years. The current maps for the Munich agglomeration are from **2022** and cover:

- **road traffic**, **trams and U-Bahn** (where above ground) and **industrial plants**;
- two indicators in dB(A): **Lden**, a 24-hour average that weights evening and night noise more heavily, and **Lnight**, the average from 22:00 to 6:00.

Levels are modelled 4 m above ground on a 10 m grid. Inside buildings there is no value, so munichMCP takes the **loudest mapped level within 40 m** of the address point, which is usually the street-facing facade.

How to read the numbers:

| Lden | Lnight | What it means |
|---|---|---|
| under 55 | under 50 | Below the mapping threshold: not shown on the maps |
| 55 to 64 | 50 to 54 | Noticeable; above the WHO recommendation for road traffic (53 dB Lden, 45 dB Lnight) |
| 65 and more | 55 and more | Levels commonly used in Germany as thresholds for noise action planning |
| 70 and more | 60 and more | Very loud, typical directly on main roads |

Every 10 dB more is perceived as roughly twice as loud. Courtyard sides are often 10 to 20 dB quieter, so the side of the bedroom matters. Examples: Landshuter Allee 51 has 76.5 dB(A) Lden and 69.8 dB(A) Lnight on the street side; Lindwurmstraße 7 has 75.5 dB(A) Lden.

Not included: S-Bahn and mainline railways (mapped by the federal railway authority, *Eisenbahn-Bundesamt*) and aircraft noise.

## River floods (*Hochwasser*)

The LfU flood maps show where rivers such as the Isar and the Würm would flood:

- **HQhäufig**: a frequent flood;
- **HQ100**: a flood with a 1 % chance per year (statistically once in 100 years);
- **HQextrem**: an extreme flood;
- areas **protected** by dikes and walls against HQ100, which would flood if the defences failed;
- **designated flood zones** (*festgesetzte Überschwemmungsgebiete*) and provisionally secured zones, where the Water Resources Act (*Wasserhaushaltsgesetz*) restricts building.

Example: the Flaucher on the Isar lies in the 100-year flood area and in the designated flood zone of the Isar. Most of the city is outside all mapped areas. The maps do **not** cover flash flooding from heavy rain (*Starkregen*), which can affect any street; check natural-hazard insurance (*Elementarschadenversicherung*) either way.

## Related

[[topics/mietspiegel]] · [[topics/milieuschutz]] · [[entities/isar]] · [[topics/baden-in-der-isar]]
