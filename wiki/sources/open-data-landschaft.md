---
title: "Munich's open data landscape (what munichMCP uses)"
type: source
summary: "Every data source behind munichMCP: publisher, licence, access route, freshness, and the gaps an official city MCP would close."
tags: [open-data, lizenz, meta]
sources:
  - https://opendata.muenchen.de
  - https://geoportal.muenchen.de/portal/opendata/
  - https://huggingface.co/it-at-m
  - https://risi.muenchen.de
  - https://www.mvv-muenchen.de/fahrplanauskunft/fuer-entwickler/opendata/index.html
  - https://www.lfu.bayern.de/laerm/umgebungslaerm/index.htm
  - https://www.lfu.bayern.de/wasser/hw_ue_gebiete/index.htm
  - https://opendata.muenchen.de/dataset/stadtratswahl-2026-ergebnisse-muenchen
  - https://opendata.muenchen.de/dataset/ordentliche-ertraege-und-aufwendungen-produkte-der-lhm
  - https://opendata.muenchen.de/dataset/termine-buergerversammlungen-muenchen
updated: 2026-10-05
updated_by: maintainer-agent
---

# Munich's open data landscape

munichMCP combines sources that anyone can use without asking. This page records what each one is, its licence and its limits, checked on 25 September 2026 and extended on 5 October 2026.

## Openly licensed (the core)

| Source | Publisher | Licence | Used for |
|---|---|---|---|
| Open data portal (CKAN, ~340 datasets) | City of Munich | dl-de/by-2.0 mostly | facilities, statistics, Kitas, P+R, online services |
| GeoPortal WFS/WMS layers | GeodatenService, Mobilitätsreferat, Planungsreferat | dl-de/by-2.0 | districts, zoning plans, Milieuschutz, parking areas, sharing zones, roadworks, Isar zones |
| Service directory corpus | it@M (Hugging Face) | MIT | `search_city_services` |
| RIS RSS feeds | Direktorium | dl-de/by-2.0 (open data portal) | `council_search`, wiki collector |
| machmuenchenbesser.de Open311 | Baureferat | CC0 | `damage_reports_near` |
| MVV GTFS timetables | MVV | CC BY 4.0 | planned timetables |
| MyRadl GBFS | nextbike | CC0 | live bike sharing |
| DWD weather (Bright Sky), pollen | Deutscher Wetterdienst | open data | `weather_air_pollen` |
| Air quality | Umweltbundesamt / LfU | dl-de/by-2.0 | `weather_air_pollen` |
| Flood class | Länderübergreifendes Hochwasserportal | CC BY 4.0 | `isar_conditions` |
| Environmental noise maps 2022 (road, tram/U-Bahn, industry) | Bayerisches Landesamt für Umwelt (LfU) | CC BY 4.0 | `noise_and_flood`, `address_report` |
| Flood hazard maps and designated flood zones | Bayerisches Landesamt für Umwelt (LfU) | CC BY 4.0 | `noise_and_flood`, `address_report` |
| Election results and polling precinct boundaries | Wahlamt (Kreisverwaltungsreferat) | dl-de/by-2.0 | `election_results`, `address_report` |
| Budget results per product since 2018 | Stadtkämmerei | dl-de/by-2.0 | `city_budget` |
| Residents' assembly dates and venues | Direktorium | dl-de/by-2.0 | `citizens_assemblies` |
| Basemap tiles | BKG basemap.de | CC BY 4.0 | maps |

## Public but not openly licensed (used carefully)

- **MVG live API** (departures, disruptions, routes): undocumented, only tolerated for moderate private, non-commercial use; munichMCP caches aggressively.
- **HND/GKD Isar tables**: public web tables; the CC BY licence formally covers the GKD download, which requires accepting terms.
- **GeoPortal address search index**: the public search service behind the city's own map portal.
- **Rathaus Umschau**: press releases may be reprinted with attribution.
- **Mietspiegel 2025**: method and tables are published, but the city reserves all rights; the Wohnlagen map service needs an agreement for automated use, so munichMCP does not use it.
- **Mayoral runoff 2026**: the results are on the election office's website (wahlen-muenchen.de) but not on the open data portal; munichMCP quotes only the final city-wide result with a link and does not scrape the district pages.

## Deliberately not used

- SWM pool and sauna occupancy: SWM forbids data use without written consent.
- Live P+R occupancy: the operator requires consent for reuse.
- RIS web pages and search: robots.txt blocks AI crawlers; munichMCP only uses the open RSS feeds and links to RIS.
- Bürgerbüro appointment slots: never scraped.
- Primary school catchment areas (*Grundschulsprengel*): the GeoPortal layer requires a separate agreement with the city.
- The zoning-plan layer with PDF links: it also requires an agreement. munichMCP uses the open zoning-plan outline layer instead and links only to plan PDFs the city publishes and that respond.

## Gaps an official city MCP could close

1. An official real-time feed from MVG/MVV.
2. An agreement (or open licence) for the Mietspiegel Wohnlagen lookup.
3. A licensed Isar gauge feed from the LfU.
4. Opening SWM bath occupancy and P+R occupancy as open data.
5. Opening school catchment areas and the zoning-plan layer with PDF links, which residents ask about constantly.
6. Publishing all election results, including runoffs, on the open data portal.
7. Machine-readable press releases of city companies (in the Rathaus Umschau they are PDF only, so the wiki collector sees only their titles).
8. Running the server inside the city (it@M) and connecting it to MUCGPT; see [[entities/it-referat]].

## Related

[[overview]] · [[schema]] · [[topics/laerm-und-hochwasser]] · [[topics/wahlen-2026]] · [[topics/stadthaushalt]]
