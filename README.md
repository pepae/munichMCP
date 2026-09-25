# munichMCP

An **unofficial** [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants live, cited access to Munich's public data, with interactive views ([MCP Apps](https://github.com/modelcontextprotocol/ext-apps)) that render inside ChatGPT and Claude. It is built as a proposal for an official city MCP, and it is not affiliated with the Landeshauptstadt München.

- Live server: `https://munichmcp.duckdns.org/mcp` (Streamable HTTP, no auth, read-only)
- Browser playground: `https://munichmcp.duckdns.org/playground`
- Wiki: `https://munichmcp.duckdns.org/wiki`

## What it can answer that web search cannot

| Tool | What it does | Main sources |
|---|---|---|
| `address_report` | Everything that applies at an address: district, zoning plans (with PDFs), Milieuschutz, resident-parking area, low-emission zone, chimney-sweep district, rooftop solar, roadworks, e-scooter rules, nearest stops and facilities | GeoPortal WFS/WMS, city address index |
| `find_address` | Geocoding with the city's official address index (162k addresses) | GeoPortal search, Photon fallback |
| `find_nearby` | 29 categories of official facilities (drinking fountains, toilets, playgrounds, Kitas, libraries, pools, P+R, EV charging, recycling, live MyRadl bikes, ...) | open data portal, GBFS |
| `roadworks_near` | Construction sites and temporary no-parking zones for the next 4 weeks | Mobilitätsreferat |
| `mobility_rules_at` | E-scooter no-riding / no-parking zones, 100 m geofences, designated sharing areas | Mobilitätsreferat |
| `damage_reports_near` | Citizen reports (street lights, potholes, ...) near an address | machmuenchenbesser.de Open311 (CC0) |
| `departures`, `nearby_stops`, `plan_trip`, `transit_disruptions` | Live departures, journey planning, disruptions | MVG (unofficial, cached), MVV GTFS |
| `search_city_services`, `get_city_service` | 1,450 official service articles and 465 online services | it@M Hugging Face corpus, online services list |
| `estimate_rent` | Mietspiegel 2025 comparative rent, verified against the official calculator | Mietspiegel für München 2025 |
| `council_search` | City council and district committee motions | RIS RSS (+ archive) |
| `isar_conditions` | Isar level, discharge, water temperature, flood class, bathing zones, danger spots | HND/GKD, LHP, city |
| `weather_air_pollen` | DWD weather and warnings, UBA air quality, DWD pollen | Bright Sky, UBA, DWD |
| `find_statistics`, `district_stats` | ~100 official statistics datasets by district and month | Statistisches Amt |
| `wiki_search`, `wiki_read`, `wiki_index` | Agent-maintained, cross-linked knowledge base | the 11th source, see below |
| `about_munichmcp` | Sources, licences, caveats | |

Every result names its sources with licence and retrieval time. See `wiki/sources/open-data-landschaft.md` for the full licence analysis, including what is deliberately **not** used.

## The wiki (the 11th source)

A Karpathy-style "LLM wiki": instead of retrieving raw chunks at question time, maintainer agents compile primary sources into cross-linked Markdown pages ahead of time.

```
raw/      immutable captures, written daily by a deterministic collector (no LLM):
          council + district committee motions, Rathaus Umschau press releases, new open datasets
topics/ entities/ sources/ queries/ overview.md index.md log.md   compiled pages
schema.md                                                         the rules maintainers follow
```

- Public tools read and search it; `/wiki` renders it for humans.
- A token-protected **maintainer endpoint** (`/maintainer/mcp`) exposes write tools: `wiki_inbox`, `wiki_read_raw`, `wiki_write_page`, `wiki_mark_raw`, `wiki_archive_page`, `wiki_rebuild_index`, `wiki_lint`, `wiki_log`, `wiki_collect_now`.
- Every write is committed to a git repository inside the live wiki folder (audit trail, easy rollback).
- The repo's `wiki/` is the seed: new seed pages are copied into the live wiki on boot, existing pages are never overwritten.
- `scripts/generate-district-pages.ts` regenerates the 25 district pages from open data.

Refresh loop: the collector runs every `COLLECTOR_INTERVAL_HOURS` (default 24). Point any agent at the maintainer endpoint with `wiki/MAINTAINER_PROMPT.md` weekly (for example a Claude Code routine or the GitHub Action in `.github/workflows/wiki-maintainer.yml`).

## Connect

- **ChatGPT**: Settings, Apps & Connectors, Advanced settings, enable developer mode, then create a connector with the MCP URL.
- **Claude**: Settings, Connectors, Add custom connector, paste the MCP URL.
- **Claude Code**: `claude mcp add --transport http munichmcp https://munichmcp.duckdns.org/mcp`

## Develop

```bash
npm install
npm run build:ui          # single-file MCP Apps view + playground into dist/ui
npm run start:dev         # tsx src/server.ts on :8420
npm test                  # unit tests incl. 780 official Mietspiegel values
npm run smoke             # end-to-end over MCP against localhost (or pass a URL)
```

Environment: `PORT`, `PUBLIC_URL`, `DATA_DIR`, `WIKI_MAINTAINER_TOKEN`, `COLLECTOR_INTERVAL_HOURS`, `MIETSPIEGEL_ENABLED` (set `0` to disable the rent tool), `ALLOWED_HOSTS`.

## Deploy

`deploy/deploy.sh root@host` packs the tree, builds the Docker image on the host and restarts the container (bound to 127.0.0.1:8420). `deploy/nginx-munichmcp.conf` is the reverse proxy (TLS via certbot). Data (caches, live wiki with its git history) lives in `/opt/munichmcp/data`.

## Architecture

- TypeScript, MCP TypeScript SDK v2 (`createMcpHandler`: serves the 2026-07-28 protocol and stateless 2025 clients), Express.
- One MCP Apps view (`ui://munichmcp/view-v1.html`, Leaflet + basemap.de tiles) renders maps, departure boards, the rent calculator, bar charts and wiki pages; view-only payloads travel in `_meta` so they stay out of the model context.
- Open datasets are cached on disk and in memory (daily, roadworks hourly); live APIs are cached for 30 s to 15 min to keep upstream load low; per-client rate limiting.

## Licence and data

Code: MIT. Data: each source keeps its licence (mostly dl-de/by-2.0, CC BY 4.0, CC0, MIT); see `about_munichmcp`. The Mietspiegel method is published by the city with all rights reserved; the rent tool can be switched off with `MIETSPIEGEL_ENABLED=0`.
