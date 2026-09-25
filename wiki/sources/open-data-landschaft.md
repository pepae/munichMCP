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
updated: 2026-09-25
updated_by: maintainer-agent (initial ingest)
---

# Munich's open data landscape

munichMCP combines sources that anyone can use without asking. This page records what each one is, its licence and its limits, checked on 25 September 2026.

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
| Basemap tiles | BKG basemap.de | CC BY 4.0 | maps |

## Public but not openly licensed (used carefully)

- **MVG live API** (departures, disruptions, routes): undocumented, only tolerated for moderate private, non-commercial use; munichMCP caches aggressively.
- **HND/GKD Isar tables**: public web tables; the CC BY licence formally covers the GKD download, which requires accepting terms.
- **GeoPortal address search index**: the public search service behind the city's own map portal.
- **Rathaus Umschau**: press releases may be reprinted with attribution.
- **Mietspiegel 2025**: method and tables are published, but the city reserves all rights; the Wohnlagen map service needs an agreement for automated use, so munichMCP does not use it.

## Deliberately not used

- SWM pool and sauna occupancy: SWM forbids data use without written consent.
- Live P+R occupancy: the operator requires consent for reuse.
- RIS web pages and search: robots.txt blocks AI crawlers; munichMCP only uses the open RSS feeds and links to RIS.
- Bürgerbüro appointment slots: never scraped.

## Gaps an official city MCP could close

1. An official real-time feed from MVG/MVV.
2. An agreement (or open licence) for the Mietspiegel Wohnlagen lookup.
3. A licensed Isar gauge feed from the LfU.
4. Opening SWM bath occupancy and P+R occupancy as open data.
5. Running the server inside the city (it@M) and connecting it to MUCGPT; see [[entities/it-referat]].

## Related

[[overview]] · [[schema]]
