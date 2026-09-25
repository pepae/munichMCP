# munichMCP: live data endpoints (verified inventory)

Tested on **2026-09-25 between 13:26 and 13:57 UTC** (15:26 to 15:57 local time, CEST) with `curl`.
All requests were read-only GETs, a handful per endpoint (one HEAD request was sent by mistake to see a redirect at api.nextbike.net). No accounts, no API keys, no forms submitted, no terms accepted.

Status labels:

- **VERIFIED**: a real response with usable data was received during the test run.
- **NOT WORKING**: tried, but no usable data (the reason and what was tried are given).

Sample payloads are real responses from the test run, truncated with `...`. Terms of use are paraphrased with a link to the source page (read the original wording there before going live); only one short verbatim quote is included. Attribution strings that a license requires you to display are given literally.

---

## Summary table

| # | Endpoint | Status | Auth | License / terms | Suggested cache TTL |
|---|---|---|---|---|---|
| 1a | MVG departures | VERIFIED | none | MVG tolerance: private, non-commercial, moderate use | 30 s |
| 1b | MVG location search | VERIFIED | none | same | 24 h |
| 1c | MVG nearby stations | VERIFIED | none | same | 24 h |
| 1d | MVG messages (disruptions, all operators) | VERIFIED | none | same | 5 min |
| 1e | MVG tickers (MVG-operated lines only) | VERIFIED | none | same | 5 min |
| 1f | MVG lines (all / per station) | VERIFIED | none | same | 24 h |
| 1g | MVG station details (zdm) | VERIFIED | none | same | 7 d |
| 1h | MVG routes (journey planner) | VERIFIED | none | same | 60 s |
| 2a | HND water level table (HTML) | VERIFIED | none | web page copyright (see 2); CC BY 4.0 applies to GKD download data | 15 min |
| 2b | HND discharge table (HTML) | VERIFIED | none | same | 15 min |
| 2c | HND Meldestufen / gauge master data (HTML) | VERIFIED | none | same | 7 d |
| 2d | GKD measurement tables: water temperature, discharge (HTML) | VERIFIED | none | same | 15 min |
| 2e | GKD CSV download | NOT WORKING (by policy: POST plus mandatory terms checkbox) | terms acceptance | CC BY 4.0 | n/a |
| 2f | LHP public API: flood class per gauge, flood warnings | VERIFIED | none | CC BY 4.0 | 5 min |
| 3a | Bright Sky current weather | VERIFIED | none | DWD data, CC BY 4.0 | 10 min |
| 3b | Bright Sky hourly forecast | VERIFIED | none | DWD data, CC BY 4.0 | 60 min |
| 3c | Bright Sky weather alerts | VERIFIED (no active alerts at test time) | none | DWD data, CC BY 4.0 | 5 min |
| 4 | UBA air data API v3 (stations, measures, index, forecast) | VERIFIED | none | dl-de/by-2-0 | 30 min (values), 7 d (metadata) |
| 5 | DWD pollen forecast s31fg.json | VERIFIED | none | DWD, CC BY 4.0 | 3 h |
| 6 | basemap.de raster tiles (Web Mercator) | VERIFIED | none | CC BY 4.0 | 3 d (server header) |
| 7a | MyRadl (nextbike_ml) GBFS 2.3, the nextbike system for Munich | VERIFIED | none | CC0-1.0 (declared in feed) | 60 s |
| 7b | Dott Munich GBFS 2.3 (e-scooters, e-bikes) | VERIFIED | none | none stated in feed | 60 to 300 s |
| 7c | Bird Munich GBFS | NOT WORKING (feed empty) | none | Bird GBFS data license (PDF linked in feed) | n/a |
| 7d | Lime Munich GBFS | NOT WORKING (HTTP 404) | n/a | n/a | n/a |
| 7e | Voi, Bolt | NOT WORKING for Munich (public feeds cover Baden-Württemberg only) | none | n/a | n/a |
| 7f | Tier | NOT WORKING (no public feed found) | n/a | n/a | n/a |
| 7g | Donkey Republic Munich | NOT WORKING (dormant: 1 station, last report 2023) | none | CC0-1.0 | n/a |
| 8a | P+R live occupancy (statistik.parkundride.de) | VERIFIED for 4 sites | none | no license; Impressum requires consent for reuse | 5 min |
| 8b | P+R static site list and occupancy forecasts (open data CSV) | static only (catalog checked, files not fetched) | none | dl-de/by-2-0 | 30 d |
| 8c | City parking garages: official public live feed | NOT WORKING (none found) | n/a | n/a | n/a |
| 8d | Parkleitsystem München Zentrum status page | VERIFIED technically, but not a published data product | none | none stated; management site | do not use without permission |
| 9a | EV charging: public keyless live status feed | NOT WORKING (none found) | n/a | n/a | n/a |
| 9b | City of Munich charging locations WFS (static) | VERIFIED | none | dl-de/by-2-0 | 24 h |

---

## 1. MVG (Munich transit), unofficial JSON API `bgw-pt/v3`

Base URL: `https://www.mvg.de/api/bgw-pt/v3`

Sources for paths and parameters: the open-source clients [mondbaron/mvg](https://github.com/mondbaron/mvg) (`src/mvg/mvgapi.py`) and [llehle/mvg-api](https://github.com/llehle/mvg-api) (`mvg_api/v3/requests.py`, `endpoints.md`). Every path below was then tested live.

**Auth:** none. Plain `curl` works; no special headers needed.

**Terms (applies to all MVG endpoints):** [MVG Impressum](https://www.mvg.de/impressum.html), read 2026-09-25. MVG states that its systems serve direct customer interaction and that processing of its content or data by third parties requires MVG's express consent, with one exception: "Für private, nicht-kommerzielle Zwecke, wird eine gemäßigte Nutzung ohne unsere ausdrückliche Zustimmung geduldet." (MVG Impressum). MVG adds that any form of data mining is not moderate use and that it may revoke the tolerance in general or in individual cases; questions go to redaktion@mvg.de. The API is undocumented and can change without notice. `robots.txt` on www.mvg.de allows everything. Responses carry `Cache-Control: no-cache, no-store`, so caching is our own decision.

Consequence for munichMCP: cache aggressively, never poll all stations, keep it per-user and low frequency. A hosted or commercial service would need MVG's consent.

Useful station ids (all verified in responses):

| Station | globalId | Notes |
|---|---|---|
| Marienplatz | `de:09162:2` | SBAHN, UBAHN, BUS |
| Marienplatz (Theatinerstraße) | `de:09162:20` | TRAM |
| Hauptbahnhof (U, Tram) | `de:09162:6` | UBAHN, TRAM, BAHN; **no S-Bahn departures here** |
| München Hbf | `de:09162:100` | BAHN, SBAHN (use this for S-Bahn at the main station) |
| Odeonsplatz | `de:09162:60` | UBAHN, BUS |
| Universität | `de:09162:70` | UBAHN, BUS |
| Isartor | `de:09162:3` | SBAHN, TRAM, BUS |

### 1a. Departures: VERIFIED

`GET https://www.mvg.de/api/bgw-pt/v3/departures?globalId={globalId}&limit={n}&offsetInMinutes={min}&transportTypes={csv}`

| Parameter | Required | Tested | Meaning |
|---|---|---|---|
| `globalId` | yes | yes | Station id, e.g. `de:09162:2` |
| `limit` | no | yes (2, 4, 10) | Approximate number of departures. In all 3 tests that returned data the API returned **limit + 1** items; the extra item was a trailing non-realtime departure at exactly 00:00 local time (22:00 UTC). Sort and trim client-side. mondbaron's source says the default is 10 and the maximum 100 (not tested). |
| `offsetInMinutes` | no | yes | Only departures leaving at least this many minutes from now. Test at 13:27 UTC with 20: first result had realtime departure 13:47 UTC. |
| `transportTypes` | no | yes | Comma list of `UBAHN, TRAM, BUS, REGIONAL_BUS, SBAHN, BAHN, SCHIFF` (mondbaron also lists `SEV`). `SBAHN` alone returned only S-Bahn; on `de:09162:6` it returned `[]`. |
| `language` | no | no | Present in llehle's client, not tested. |

Sample (Marienplatz, `limit=4&offsetInMinutes=20&transportTypes=SBAHN`, first of 5 items):

```json
{
 "plannedDepartureTime": 1790343540000,
 "realtime": true,
 "delayInMinutes": 8,
 "realtimeDepartureTime": 1790344020000,
 "transportType": "SBAHN",
 "label": "S1",
 "divaId": "92M01",
 "network": "ddb",
 "trainType": "",
 "destination": "Leuchtenbergring",
 "cancelled": false,
 "sev": false,
 "platform": 1,
 "platformChanged": false,
 "messages": [],
 "infos": [ { "message": "Verspätung eines vorausfahrenden Zuges", "type": "INCIDENT", "network": "ddb" } ],
 "bannerHash": "",
 "occupancy": "UNKNOWN",
 "stationGlobalId": "de:09162:2",
 "stopPointGlobalId": "",
 "lineId": "ddb:92M01: :H:j26",
 "tripCode": 517
}
```

Important fields:

- `plannedDepartureTime`, `realtimeDepartureTime`: Unix epoch in **milliseconds** (UTC). Realtime equals planned when `realtime` is false.
- `delayInMinutes`: can be negative (early) and is absent when there is no realtime data.
- `label` (line, e.g. S1, U4, 16), `transportType`, `destination`, `platform`, `platformChanged`, `cancelled`.
- `sev`: rail replacement service flag. `infos[]`: per-trip notes (`message`, `type` such as INCIDENT). `messages[]`: older free-text notes.
- `occupancy`: `UNKNOWN`, `LOW`, `MEDIUM`, `HIGH` (only UNKNOWN observed).
- `network`: `swm` (U-Bahn, tram, city bus), `ddb` (Deutsche Bahn, S-Bahn), `mvv` (regional bus).
- Observed: the first call at 13:26:16 UTC contained a departure with realtime 13:20 UTC, so drop items with `realtimeDepartureTime` in the past.

**Cache TTL:** 30 s (never more than 60 s).

### 1b. Location / station search: VERIFIED

`GET https://www.mvg.de/api/bgw-pt/v3/locations?query={text}&locationTypes={STATION,ADDRESS,POI}&limitStations={n}&limitAddressPoi={n}`

- `query=Marienplatz&locationTypes=STATION` returned 38 stations across Bavaria; the first is Munich Marienplatz. Filter on `place == "München"` for city scope.
- `query=Odeonsplatz&limitStations=2&limitAddressPoi=2` returned 1 STATION and 1 ADDRESS, so the limits are maxima.

Sample (first item):

```json
{
 "latitude": 48.137245,
 "longitude": 11.575421,
 "place": "München",
 "name": "Marienplatz",
 "globalId": "de:09162:2",
 "divaId": 2,
 "hasZoomData": true,
 "transportTypes": ["SBAHN", "UBAHN", "BUS"],
 "aliases": "",
 "tariffZones": "m",
 "type": "STATION"
}
```

Fields: `type` (STATION, ADDRESS, POI), `globalId` and `divaId` (stations only), `name`, `place`, WGS84 `latitude`/`longitude`, `transportTypes`, `tariffZones` (`m`, `1`, or `m|1` at zone borders), `hasZoomData` (elevator and escalator info available). ADDRESS items carry `street`, `postCode` and no `globalId`.

**Cache TTL:** 24 h per normalized query string.

### 1c. Nearby stations: VERIFIED

`GET https://www.mvg.de/api/bgw-pt/v3/stations/nearby?latitude={lat}&longitude={lon}`

At 48.137, 11.575 it returned 23 stations within about 950 m, sorted by distance. No radius or limit parameter was tested.

Sample (first item, aliases truncated):

```json
{
 "globalId": "de:09162:2",
 "name": "Marienplatz",
 "place": "München",
 "latitude": 48.137245,
 "longitude": 11.575421,
 "transportTypes": ["SBAHN", "UBAHN", "BUS"],
 "tariffZones": "m",
 "aliases": "Rathaus Bf. Bahnhof München München Mun...",
 "divaId": 2,
 "hasZoomData": true,
 "distanceInMeters": 41,
 "beacons": null
}
```

Extra field compared to 1b: `distanceInMeters`. **Cache TTL:** 24 h, keyed on coordinates rounded to about 100 m.

### 1d. Disruption and schedule-change messages: VERIFIED

`GET https://www.mvg.de/api/bgw-pt/v3/messages`

- Returns everything in one list: 276 items, 350,662 bytes (274 `SCHEDULE_CHANGE`, 2 `INCIDENT`; provider `DEFAS` 206, `MVG` 70). `DEFAS` covers S-Bahn, rail and regional buses.
- `messageType=INCIDENT` (from llehle's client) was **ignored**: same 276 items. Filter client-side.
- Response has an `ETag` header (for example `"1790342871481"`). Conditional requests were not tested.

Sample (the INCIDENT item, description and lists truncated):

```json
{
 "title": "Reparatur an der Strecke - Zwischen Markt Schwaben und Erding sind keine Zugfahrten möglich.",
 "description": "<p>Die S-Bahnen in Richtung Erding fahren bis Markt Schwaben und wende...",
 "publication": 1790338860000,
 "publicationDuration": { "from": 1790338860000, "to": 1790348400000 },
 "incidentDurations": [ { "from": 1790338860000, "to": 1790348400000 } ],
 "validFrom": 1790338860000,
 "validTo": 1790348400000,
 "type": "INCIDENT",
 "provider": "DEFAS",
 "links": [ { "text": "Störungskarte 25.09.2026 14:35:44", "url": "https://assets-ri.extranet.deutschebahn.com/...png" } ],
 "lines": [ { "label": "S2", "transportType": "SBAHN", "network": "ddb", "divaId": "92M02", "sev": false } ],
 "stationGlobalIds": [],
 "eventTypes": []
}
```

Fields: `type` (INCIDENT = unplanned, SCHEDULE_CHANGE = planned works), `title`, `description` (HTML), all times in epoch ms, `incidentDurations[]` (when it applies), `publicationDuration`, `lines[]` (contains duplicates, deduplicate by label), `stationGlobalIds[]`, `links[]` (maps, PDFs).

**Cache TTL:** 5 min.

### 1e. Tickers (MVG-operated lines): VERIFIED

`GET https://www.mvg.de/api/ems/tickers`

70 items, 408,167 bytes (69 `PLANNED`, 1 `DISRUPTION`). Only MVG lines: `typeOfTransport` values seen were `BUS`, `METRO` (U-Bahn) and `TRAM`. For S-Bahn use 1d.

Sample (texts and station list truncated):

```json
{
 "id": "403ba927-4332-4803-8f08-8b1f5584cbd7",
 "type": "DISRUPTION",
 "title": "Umleitung wegen Wasserrohrbruch",
 "text": "<div>Liebe Fahrg&auml;ste,</div>\n<div>wegen einer Vollsperru...",
 "htmlText": "...",
 "lines": [ { "id": "154", "name": "154", "typeOfTransport": "BUS",
              "stations": [ { "id": "de:09162:727", "name": "Westerlandanger" }, "..." ],
              "direction": "2" } ],
 "incidents": [],
 "links": [],
 "downloadLinks": [],
 "incidentDuration": [ { "fromDate": "2026-09-25T13:00:00Z", "toDate": "2026-10-02T23:30:00Z" } ],
 "activeDuration": { "fromDate": "2026-09-25T13:00:00Z", "toDate": "2026-10-02T23:30:00Z" },
 "modificationDate": "2026-09-25T13:23:04Z"
}
```

Fields: `type` (DISRUPTION or PLANNED), `lines[].stations[]` (affected stops with globalIds), ISO 8601 UTC times, `text`/`htmlText` (HTML with entities).

**Cache TTL:** 5 min.

### 1f. Lines: VERIFIED

- All lines: `GET https://www.mvg.de/api/bgw-pt/v3/lines` returned 752 items, 80,812 bytes (REGIONAL_BUS 591, BUS 102, UNKNOWN 22, TRAM 17, SBAHN 11, UBAHN 9).
- Lines at a station: `GET https://www.mvg.de/api/bgw-pt/v3/lines/{globalId}`. For `de:09162:2` it returned 13 lines (U3, U6, 132, S1 to S8, S6/8, S8/6).

```json
[
 { "label": "U1", "transportType": "UBAHN", "trainType": null, "network": "SWM", "divaId": "010U1", "sev": false },
 { "label": "U3", "transportType": "UBAHN", "trainType": "", "network": "SWM", "divaId": "010U3", "sev": false }
]
```

**Cache TTL:** 24 h.

### 1g. Station details (zdm): VERIFIED

`GET https://www.mvg.de/.rest/zdm/stations/{globalId}`

```json
{ "name": "Marienplatz", "place": "München", "id": "de:09162:2", "divaId": 2, "abbreviation": "MP",
  "tariffZones": "m", "products": ["SBAHN", "UBAHN", "BUS"], "latitude": 48.137245, "longitude": 11.575421 }
```

Not tested (large lists, not needed per request): `https://www.mvg.de/.rest/zdm/mvgStationGlobalIds` (all ids) and `https://www.mvg.de/api/bgw-pt/v3/stations` (all stations), both documented in llehle's `endpoints.md`.

**Cache TTL:** 7 d.

### 1h. Routes (journey planner): VERIFIED

`GET https://www.mvg.de/api/bgw-pt/v3/routes?originStationGlobalId={id}&destinationStationGlobalId={id}&routingDateTime={ISO8601 UTC}&routingDateTimeIsArrival=false&transportTypes=SCHIFF,UBAHN,TRAM,SBAHN,BUS,REGIONAL_BUS,BAHN`

Tested Marienplatz to Universität with `routingDateTime=2026-09-25T13:28:53.000Z`: 5 connections, 25 KB. Further parameters in llehle's client (not tested): `routeType` (LEAST_TIME, LEAST_INTERCHANGES, LEAST_WALKING), `changeSpeed` (SLOW, NORMAL, FAST), `accessibilityOptions`, `viaStationGlobalId` plus `viaDwellTimeInMinutes`, and origin/destination latitude/longitude instead of station ids.

Sample (first connection, one part, polylines and stops removed):

```json
{
 "uniqueId": 15089391716495446,
 "distance": 1425.5935042767355,
 "parts": [ {
   "from": { "stationGlobalId": "de:09162:2", "name": "Marienplatz", "platform": 1,
             "plannedDeparture": "2026-09-25T15:28:00+02:00", "hasOutOfOrderElevator": false, "...": "..." },
   "to":   { "stationGlobalId": "de:09162:70", "name": "Universität", "platform": 1,
             "plannedDeparture": "2026-09-25T15:30:00+02:00", "arrivalDelayInMinutes": 1, "...": "..." },
   "line": { "label": "U6", "transportType": "UBAHN", "destination": "Fröttmaning", "network": "swm", "divaId": "010U6", "sev": false },
   "realTime": true, "isCancelled": false, "occupancy": "UNKNOWN",
   "intermediateStops": "[...]", "pathPolyline": "..."
 } ]
}
```

Note: times here are ISO 8601 with local offset, unlike the epoch ms in 1a. Each connection also has `ticketingInformation.zones` (tariff zones). **Cache TTL:** 60 s.

---

## 2. Isar in Munich: HND and GKD Bayern (LfU), plus the LHP flood API

Gauge **München / Isar, Messstellen-Nr. 16005701** (verified on the HND Stammdaten page): operator Wasserwirtschaftsamt München; river km 145.92; catchment 2,838.40 km²; gauge zero 500.36 m NN (DHHN12); UTM 32N E 693157, N 5335718; WGS84 about 48.1454 N, 11.5968 E (from the LHP API).

**Flood thresholds (Meldestufen), verified on the HND main page and on the Stammdaten page:**

| Level | Water level |
|---|---|
| Meldebeginn | 240 cm |
| Meldestufe 1 | 240 cm |
| Meldestufe 2 | 300 cm |
| Meldestufe 3 | 380 cm |
| Meldestufe 4 | 520 cm |
| Hochwassergefahrenfläche HW100 (shown on the chart page) | 510 cm |

Values at test time: water level 91 to 92 cm (15:15 to 15:45 local), discharge 21.6 m³/s, water temperature 15.0 °C (15:15 local). LHP class 0 ("Keine Meldestufe").

**Machine-readable access, what exists:**

- The HND Impressum says there is currently **no public API** for machine-readable data in JSON, CSV or XML, and points to the public API of the cross-state flood portal (LHP, 2f) for Meldestufen status and warnings. LHP does not deliver measured values.
- The GKD offers CSV downloads, but only through a download dialog (2e).
- What works without any form: the **HTML tables** on HND and GKD (2a to 2d). They are stable, simple `<table class="tblsort">` markup.

**License and terms (LfU, same text in the [GKD Impressum](https://www.gkd.bayern.de/de/impressum) and the [HND Impressum](https://www.hnd.bayern.de/impressum)):**

- GKD **download data** are licensed CC BY 4.0; the LfU notes that commercial use is covered and that the only condition is a clearly visible source note: `Datenquelle: Bayerisches Landesamt für Umwelt, www.lfu.bayern.de`. So "believed CC BY 4.0" is **confirmed for GKD download data**.
- The general website content (texts, images, graphics, layout) is under copyright, for private use under section 53 UrhG; other reproduction needs consent.
- Caveat: reading the numbers from the HTML tables is not the explicitly licensed channel. The values are the same data the LfU licenses as CC BY 4.0, but to be safe use them with the attribution above and consider asking the LfU (poststelle@lfu.bayern.de) to confirm that programmatic reading of the tables is fine.
- `robots.txt`: HND allows everything. GKD allows the measurement pages and blocks `/webservices/` and the download actions (`/de/downloadcenter/enqueue_download`, `/de/downloadcenter/download`).

### 2a. HND water level table: VERIFIED

`GET https://www.hnd.bayern.de/pegel/isar/muenchen-16005701/tabelle?methode=wasserstand&setdiskr=15&days=1`

| Parameter | Tested | Meaning |
|---|---|---|
| `methode` | yes | `wasserstand` (cm) or `abfluss` (m³/s) |
| `setdiskr` | yes | `15` = 15-minute values, `60` = hourly |
| `days` | yes (`1`) | `days=1` returned 156 rows (about 39 h, 22 KB). Without it: 635 rows (about 1 week, 58 KB). |
| `begin`, `end` | no | `TT.MM.JJJJ` date fields seen in the form on the gauge page |

Sample (HTML, truncated):

```html
<table  class="tblsort"><thead><tr><th  data-sorter="germanDate">Datum</th><th  class="center">Wasserstand <b>cm</b> &uuml;ber Pegelnullpunkt (500,36 m NN)</th></tr></thead><tbody>
<tr  class="row"><td >25.09.2026 15:30</td><td  class="center">92</td></tr>
<tr  class="row"><td >25.09.2026 15:15</td><td  class="center">91</td></tr> ...
```

Fields: first cell = local time `DD.MM.YYYY HH:MM` (Europe/Berlin), second = water level in cm above gauge zero, newest first. **Cache TTL:** 15 min.

### 2b. HND discharge table: VERIFIED

`GET https://www.hnd.bayern.de/pegel/isar/muenchen-16005701/tabelle?methode=abfluss` (hourly; add `&setdiskr=15` for 15-minute values)

The newest rows are the **forecast** (green, a range), followed by **measured** values (blue):

```html
<tr  class="row"><td >25.09.2026 16:00</td><td  class="center"><span style="color:green">19,1 - 25,2</span></td></tr>
<tr  class="row"><td >25.09.2026 15:00</td><td  class="center"><span style="color:blue">21,6</span></td></tr>
```

Fields: discharge in m³/s with a decimal comma. Keep only `color:blue` rows for measurements. The caption gives the forecast run (for example "Vorhersage vom 25.09.2026 06:00 Uhr (Publikation: 25.09.2026 08:13 Uhr)"). **Cache TTL:** 15 min.

### 2c. HND gauge page and master data (thresholds): VERIFIED

- `GET https://www.hnd.bayern.de/pegel/isar/muenchen-16005701`: chart page with the thresholds as list items, for example `<strong>Meldestufe 1</strong> 240 cm`, plus the latest 4 values and "Letzte Datenaktualisierung".
- `GET https://www.hnd.bayern.de/pegel/isar/muenchen-16005701/stammdaten`: table rows such as `Meldestufe 1:` / `240,00 cm`, plus catchment, river km, gauge zero and coordinates.

**Cache TTL:** 7 d (thresholds change rarely).

### 2d. GKD measurement tables (water temperature, discharge): VERIFIED

URL pattern: `https://www.gkd.bayern.de/de/fluesse/{wassertemperatur|abfluss|wasserstand}/bayern/{slug}-{id}/messwerte`

- Water temperature, München/Isar: `GET https://www.gkd.bayern.de/de/fluesse/wassertemperatur/bayern/muenchen-16005701/messwerte` (last 7 days, 15-minute values). The gauge 16005701 **itself measures Isar water temperature** (series since 1980).
- Discharge, 15 minutes: `GET https://www.gkd.bayern.de/de/fluesse/abfluss/bayern/muenchen-16005701/messwerte` (verified, 21.6 m³/s).
- The water level `messwerte` page follows the same pattern (link present on the GKD page, not fetched).
- Pagination links on the page use `?beginn=DD.MM.YYYY&ende=DD.MM.YYYY` (seen, not tested).
- Slug lookup: `https://www.gkd.bayern.de/de/search/go?suche=fluesse.{wasserstand|wassertemperatur|abfluss}&id={id}` redirects to the right page (verified for 16005701 and 16515005).

Sample (water temperature, HTML, truncated):

```html
<table  class="tblsort"><caption>Wassertemperatur Werte vom 19.09.2026 bis zum  25.09.2026</caption><thead><tr><th  data-sorter="shortDate">Datum</th><th  class="center">Wassertemperatur [°C]</th></tr></thead><tbody>
<tr  class="row0"><td >25.09.2026 15:30 Uhr</td><td  class="center">--</td></tr>
<tr  class="row1"><td >25.09.2026 15:15 Uhr</td><td  class="center">15,0</td></tr> ...
```

Fields: local time with "Uhr", value in °C with a decimal comma; the newest row can be `--` (not yet transmitted). Other stations nearby (from GKD's "Messstellen im Umkreis"): **München Himmelreichbrücke 16515005** (water body: **Eisbach**, not the Isar; water temperature available), **Puppling 16004403** (Isar upstream; listed with water temperature, not fetched).

**Cache TTL:** 15 to 30 min.

### 2e. GKD CSV download: NOT WORKING (not used on purpose)

Page: `https://www.gkd.bayern.de/de/fluesse/wasserstand/bayern/muenchen-16005701/download` (form fields `zr` = monat, jahr, gesamt or individuell; `beginn`, `ende`; `wertart` = `ezw` single values or `tmw` daily means; ISO 8859-1 CSV). The actual download is a JavaScript **POST** to `https://www.gkd.bayern.de/de/downloadcenter/enqueue_download` with mandatory "terms of use accepted" and "privacy notice" checkboxes (an email is required for custom periods). Not executed: it is not a GET, it requires accepting terms, and robots.txt disallows it. If you want the licensed CSV route, accept the terms yourself once and check whether the result has a stable URL.

### 2f. LHP public API (Länderübergreifendes Hochwasserportal): VERIFIED

Docs: [hochwasserzentralen.de/developers](https://hochwasserzentralen.de/developers/), OpenAPI at `https://hochwasserzentralen.de/developers/docs/lhp-public-api_v1.20240123.yaml`.

- Flood class per gauge: `GET https://api.hochwasserzentralen.de/public/v1/data/stations?states=BY` with header `Accept: application/json` (default is `application/geo+json`; `text/xml` also offered). Returned 243 Bavarian gauges, 72 KB.
- Warnings: `GET https://api.hochwasserzentralen.de/public/v1/data/alerts?states=BY` (0 active warnings at test time). The spec also documents a `cap` query parameter for CAP-style details (not tested).
- Language via `Accept-Language: de|en`. Headers: `Cache-Control: max-age=60`, `ETag`, `Access-Control-Allow-Origin: *`.
- Auth: none needed. The spec lists "BasicAuth" under `security` but defines no scheme; requests without credentials worked.

Sample (header fields, legend excerpt, and the Munich gauge):

```json
{"apiVersion": "1.0 beta, 2025-02-04", "status": "success", "licence": "https://creativecommons.org/licenses/by/4.0/deed.de", "licenceName": "CC BY 4.0 - Namensnennung", "updated": "2026-09-25T14:32:47+01:00", "lastModified": "2026-09-25T14:32:47+01:00", "legend": {"items": [{"lhpClass": 4, "lhpClassName": "Sehr großes Hochwasser", "color": "#941094"}, "..."]}, "data": [
 {"kind": "Station", "id": "BY_16005701", "coordinates": [11.5968, 48.1454], "name": "München", "water": "Isar", "timestamp": "2026-09-25 15:15:00", "lhpClass": 0, "stateClassName": "Keine Meldestufe", "stationLink": "https://www.hnd.bayern.de/search/go?suche=pegel&id=16005701", "stateId": "DE-BY"}, "..."]}
```

Fields: `id` = `BY_` plus the gauge number; `coordinates` = [lon, lat]; `lhpClass` -1 no data, 0 no flood, 1 small, 2 medium, 3 large, 4 very large flood (legend in every response, with colors); `stateClassName` = Bavarian wording (for example "Keine Meldestufe"); `timestamp` = local time without offset; `updated` is given with a +01:00 offset.

**Terms (paraphrased from the developers page):** CC BY 4.0. You must visibly show the source `Datenquelle: www.hochwasserzentralen.de` (as a clickable link online) and the data time taken from `updated`, formatted `Stand: TT.MM.JJJJ hh:mm`. The data are refreshed every minute and republished data should be refreshed at least every 10 minutes. LHP asks to reuse its class colors where possible. The data are unchecked raw data without warranty.

**Cache TTL:** 5 min (must stay under 10 min per the terms).

---

## 3. Bright Sky (DWD open data as JSON)

Base: `https://api.brightsky.dev`, OpenAPI at `https://api.brightsky.dev/openapi.json` (verified).

**Auth:** none. The spec says the public instance is free for all purposes with no API key, and that the DWD terms apply to all data.

**License (DWD):** [DWD legal notice](https://www.dwd.de/EN/service/legal_notice/legal_notice.html) and [rules for acknowledging the DWD as source](https://www.dwd.de/EN/service/legal_notice/templates_dwd_as_source.html), read 2026-09-25 (paraphrased). DWD content and open spatial data (including location-related weather information) may be reused under CC BY 4.0 with source acknowledgement. The text form is `Source: Deutscher Wetterdienst`, placed immediately next to the information. For processed data the DWD expects at least a mention in a reference list or imprint, with templates of the form `Based on data from Deutscher Wetterdienst, <what was changed>`. If an official DWD warning is changed, the DWD source note must be removed.

Common parameters: `lat`, `lon`, `tz` (tz database name, default UTC), `units` (`dwd` default: °C, km/h, hPa, mm, min, kWh/m²; `si`: K, m/s, Pa, s, J/m²; precipitation always mm), `max_dist` (m, default 50,000).

### 3a. Current weather: VERIFIED

`GET https://api.brightsky.dev/current_weather?lat=48.137&lon=11.575` (optional `&tz=Europe/Berlin`; `tz` was tested on `/weather` only)

```json
{"weather": {"source_id": 18377, "timestamp": "2026-09-25T13:00:00+00:00", "cloud_cover": 0, "condition": "dry",
  "dew_point": 3.75, "precipitation_10": 0.0, "precipitation_60": 0.0, "pressure_msl": 1020.4, "relative_humidity": 35,
  "visibility": 47577, "wind_direction_10": 260, "wind_speed_10": 5.0, "wind_gust_speed_10": 9.7, "sunshine_60": 60.0,
  "temperature": 19.5, "solar_60": 0.639, "fallback_source_ids": {"solar_60": 22361, "...": "..."}, "icon": "clear-day", "...": "..."},
 "sources": [{"id": 18377, "dwd_station_id": "03379", "observation_type": "synop", "lat": 48.1632, "lon": 11.5429,
  "station_name": "München-Stadt", "wmo_station_id": "10865", "distance": 3767.0, "...": "..."}, "..."]}
```

(Sample from the call without `tz`, so timestamps are UTC.) Fields: suffixes `_10`, `_30`, `_60` = aggregation over the previous 10, 30 or 60 minutes; `condition` in {dry, fog, rain, sleet, snow, hail, thunderstorm}; `icon` in {clear-day, clear-night, partly-cloudy-day, partly-cloudy-night, cloudy, fog, wind, rain, sleet, snow, hail, thunderstorm}; `fallback_source_ids` = parameters taken from another station (here solar from Weihenstephan). Source station: DWD 03379 "München-Stadt", 3.8 km away.

**Cache TTL:** 10 min.

### 3b. Hourly weather and forecast: VERIFIED

`GET https://api.brightsky.dev/weather?lat=48.137&lon=11.575&date=2026-09-26&last_date=2026-09-27&tz=Europe/Berlin`

Returned 25 hourly records (from `date` 00:00 up to and including `last_date` 00:00). Future dates come from the DWD MOSMIX forecast (source `observation_type: "forecast"`, station "MUENCHEN STADT", `last_record` 2026-10-05, so about 10 days ahead); past dates return observations.

```json
{"timestamp": "2026-09-26T12:00:00+02:00", "source_id": 202203, "precipitation": 0.0, "pressure_msl": 1021.9, "sunshine": 60.0,
 "temperature": 18.8, "wind_direction": 145, "wind_speed": 5.5, "cloud_cover": 17, "dew_point": 6.8, "relative_humidity": null,
 "visibility": 50300, "wind_gust_direction": null, "wind_gust_speed": 13.0, "condition": "dry",
 "precipitation_probability": 1, "precipitation_probability_6h": null, "solar": 0.6, "icon": "clear-day"}
```

Fields: hourly values (precipitation and sunshine over the previous hour), `precipitation_probability` in %. Some fields are `null` in forecasts (for example `relative_humidity`).

**Cache TTL:** 60 min.

### 3c. Weather alerts: VERIFIED (empty at test time)

`GET https://api.brightsky.dev/alerts?lat=48.137&lon=11.575` (alternative: `?warn_cell_id=709162001`)

```json
{"alerts": [], "location": {"warn_cell_id": 709162001, "name": "München-Altstadt-Lehel", "name_short": "M-Altst./Lehel", "district": "München", "state": "Bayern", "state_short": "BY"}}
```

No alert was active in Munich, and the nationwide `GET https://api.brightsky.dev/alerts` returned `{"alerts": []}` too, so the alert object could not be observed live. Schema from the OpenAPI spec: `id`, `alert_id` (CAP id), `status` (actual, test), `effective`, `onset`, `expires`, `category` (met, health), `response_type` (prepare, allclear, none, monitor), `urgency` (immediate, future), `severity` (minor, moderate, severe, extreme), `certainty` (observed, likely), `event_code`, `event_en`/`event_de`, `headline_en`/`headline_de`, `description_en`/`description_de`, `instruction_en`/`instruction_de`.

**Cache TTL:** 5 min. Show DWD warnings unchanged (see the DWD rule above).

---

## 4. Umweltbundesamt (UBA) air data API v3

**The API has moved.** `https://www.umweltbundesamt.de/api/air_data/v3/...` now answers `301 Moved Permanently` to **`https://luftdaten.umweltbundesamt.de/api/air-data/v3/...`** (note `air-data` with a hyphen). Use the new host directly. Official OpenAPI: `https://luftdaten.umweltbundesamt.de/modules/custom/w21_uba_air_data_api_v3/assets/uba_api_v3.yml` (docs page `https://luftdaten.umweltbundesamt.de/api/air-data/v3/doc`). The portal also links an **API v4** (`/api/air-data/v4/doc`), not tested.

**Auth:** none.

**License (from the official v3 OpenAPI `info` block):** Datenlizenz Deutschland Namensnennung 2.0, [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0). Required source reference: `Umweltbundesamt mit Daten der Messnetze der Länder und des Bundes`. The spec also says data for the current year are not yet finally audited, may contain gaps, and that invalid queries return JSON without data.

Common rules: dates `YYYY-MM-DD`, hours `1` to `24` (hour 1 = the hour ending 01:00); returned timestamps are CET per the spec; `station` takes **one** id or code (for example `471` or `DEBY037`); a comma list returned HTTP 409 (tested on `/airquality`). The newest hourly value was about 1.5 h old at test time (reading the timestamps as CET).

### 4a. Components and scopes: VERIFIED

- `GET https://luftdaten.umweltbundesamt.de/api/air-data/v3/components/json?lang=en&index=code`
- `GET https://luftdaten.umweltbundesamt.de/api/air-data/v3/scopes/json?lang=en&index=code`

```json
{"count": 12, "indices": ["component id", "component code", "component symbol", "component unit", "component name"],
 "PM10": ["1", "PM10", "PM₁₀", "µg/m³", "Particulate matter"], "O3": ["3", "O3", "O₃", "µg/m³", "Ozone"],
 "NO2": ["5", "NO2", "NO₂", "µg/m³", "Nitrogen dioxide"], "PM2": ["9", "PM2", "PM₂,₅", "µg/m³", "Particulate matter"], "...": "..."}
```

Component ids: PM10 = 1, CO = 2, O3 = 3, SO2 = 4, NO2 = 5, PM2.5 = 9 (code `PM2`). Scope ids: 1 = `1TMW` daily mean, 2 = `1SMW` hourly mean, 3 = `1SMW_MAX` daily max of hourly means, 4 = `8SMW` 8-hour mean, 5 = `8SMW_MAX`, 6 = `1TMWGL` daily mean, hourly floating.

**Cache TTL:** 30 d.

### 4b. Stations in Munich: VERIFIED

`GET https://luftdaten.umweltbundesamt.de/api/air-data/v3/stations/json?use=airquality&lang=en` (492 stations incl. closed ones, 102 KB). Filter `station city` starting with "München".

```json
"indices": ["station id", "station code", "station name", "station city", "station synonym", "station active from", "station active to", "station longitude", "station latitude", "network id", "station setting id", "station type id", "network code", "network name", "station setting name", "station setting short name", "station type name", "station street", "station street nr", "station zip code"],
"data": {"473": ["473", "DEBY039", "München/Lothstraße", "München", "", "1978-01-01", null, "11.5547", "48.1545", "2", "1", "1", "BY", "Bavaria", "urban area", "urban", "background", "Lothstraße", "62", "80335"], "...": "..."}
```

| id | code | Name | Type / setting | Lat | Lon | Address | Pollutants seen in the index (2026-09-25 12:00 CET) |
|---|---|---|---|---|---|---|---|
| 471 | DEBY037 | München/Stachus | traffic / urban | 48.1373 | 11.5649 | Sonnenstraße, 80335 | NO2, PM10, PM2.5 |
| 473 | DEBY039 | München/Lothstraße | background / urban | 48.1545 | 11.5547 | Lothstraße 62, 80335 | O3, NO2, PM10, PM2.5 |
| 523 | DEBY089 | München/Johanneskirchen | background / suburban | 48.1732 | 11.6480 | Nußstraße, 81929 | O3, NO2, PM10, PM2.5 |
| 535 | DEBY115 | München/Landshuter Allee | traffic / urban | 48.1496 | 11.5365 | Landshuter Allee 31, 80637 | NO2, PM10, PM2.5 |
| 609 | DEBY189 | München/Allach | background / suburban | 48.1817 | 11.4645 | Allacher Straße 305, 80999 | O3, NO2 |

All five are active (`station active to` = null). O3 is only measured at 473, 523 and 609.

**Cache TTL:** 7 d.

### 4c. Latest values per pollutant (`/measures`): VERIFIED

`GET https://luftdaten.umweltbundesamt.de/api/air-data/v3/measures/json?date_from={d}&time_from={h}&date_to={d}&time_to={h}&station={id}&component={id}&scope={id}`

Exact requests that returned data:

| Pollutant | Request |
|---|---|
| NO2, hourly, Stachus | `.../measures/json?date_from=2026-09-25&time_from=1&date_to=2026-09-25&time_to=24&station=471&component=5&scope=2` |
| O3, hourly, Lothstraße | `.../measures/json?date_from=2026-09-24&time_from=1&date_to=2026-09-25&time_to=24&station=473&component=3&scope=2` (latest 89 µg/m³) |
| PM2.5, hourly, Lothstraße | `.../measures/json?date_from=2026-09-24&time_from=1&date_to=2026-09-25&time_to=24&station=473&component=9&scope=2` (latest 3 µg/m³) |
| PM2.5, floating daily mean | `.../measures/json?date_from=2026-09-25&time_from=10&date_to=2026-09-25&time_to=24&station=473&component=9&scope=6` (latest 8 µg/m³) |
| PM10, daily mean | `.../measures/json?date_from=2026-09-24&time_from=1&date_to=2026-09-25&time_to=24&station=473&component=1&scope=1` (returned only one row, starting 2026-09-24 11:00; unreliable for "latest", use 4d or scope 6) |

(`...` = `https://luftdaten.umweltbundesamt.de/api/air-data/v3`.) For "latest", request today (or yesterday plus today) and take the greatest key.

Sample (NO2 at Stachus, data truncated to the last two hours):

```json
{"request": {"component": "5", "scope": "2", "station": "471", "date_from": "2026-09-25", "date_to": "2026-09-25", "time_from": "01:00:00", "time_to": "24:00:00", "...": "..."},
 "indices": {"data": {"station id": {"date start": ["component id", "scope id", "value", "date end", "index"]}}},
 "data": {"471": {"2026-09-25 11:00:00": [5, 2, 14, "2026-09-25 12:00:00", "0"], "2026-09-25 12:00:00": [5, 2, 13, "2026-09-25 13:00:00", "0"]}}}
```

Fields: `data[station][date start] = [component, scope, value (µg/m³), date end, index]`. The trailing `index` in `/measures` did **not** match the air quality index (O3 89 µg/m³ gave "4" here but class 1 in 4d); ignore it and use 4d for the index.

**Cache TTL:** 30 min.

### 4d. Air quality index (`/airquality`): VERIFIED

`GET https://luftdaten.umweltbundesamt.de/api/air-data/v3/airquality/json?date_from={d}&time_from={h}&date_to={d}&time_to={h}&station={id}&lang=en`

- One station: `...&station=471` (verified).
- All stations for one hour: omit `station` (verified: `date_from=2026-09-25&time_from=13&date_to=2026-09-25&time_to=13` returned 330 stations, 36 KB). This is the cheapest way to get all five Munich stations in one request.

```json
{"request": {"station": "471", "date_from": "2026-09-25", "date_to": "2026-09-25", "time_from": "09:00:00", "time_to": "24:00:00", "...": "..."},
 "data": {"471": {"2026-09-25 12:00:00": ["2026-09-25 13:00:00", 1, 1, [5, 13, 0, "0.65"], [1, 22, 1, "1.071"], [9, 9, 0, "0.9"]]}},
 "indices": {"data": {"station id": {"date start (CET)": ["date end (CET)"], "date start": {"1": "total index", "2": "data incomplete", "3": ["component id", "value", "index", "y-value"]}}}}, "count": 1}
```

Fields: `[date end, total index, data incomplete (0/1), [component id, value, component index, decimal index], ...]`. Index classes 0 to 4 run from "sehr gut" (0) to "sehr schlecht" (4), five classes per the [UBA LQI page](https://www.umweltbundesamt.de/themen/luft/luftqualitaet/der-luftqualitaetsindex-lqi); the spec documents 0 to 4 plus 5 = no data. The total index is the worst component. **PM10 and PM2.5 in the index are the hourly floating daily mean (scope 6)**, not the 1-hour value: PM2.5 at 473 was 8 µg/m³ here and in `/measures` scope 6, but 3 µg/m³ as the hourly mean. The decimal index is a continuous position on the scale (useful for bars); its exact definition is not documented.

**Cache TTL:** 30 min.

### 4e. Air quality forecast: VERIFIED (with a quirk)

`GET https://luftdaten.umweltbundesamt.de/api/air-data/v3/airqualityforecast/json?station=DEBY039`

```json
{"dates": {"from": "2026-09-25 13:00:00", "to": "2026-09-26 12:00:00"},
 "data": {"473": {"2026-09-25 13:00:00": ["2026-09-25 14:00:00", "2026-09-25 12:25:00", 5, 1, [1, 18, 0, "0.900"], [9, 7, 1, "1.111"], [5, 13, 0, "0.650"], [3, 88, 1, "1.458"]], "...": "..."}}}
```

Fields: `[date end, forecast created, total index (0 to 5, 5 = no data), incomplete, [component, value, index, decimal], ...]`, 23 hourly rows. Quirk: the total index was 5 ("no data") in the rows checked although component indices were present, so compute the maximum of the component indices yourself.

**Cache TTL:** 1 h.

### 4f. Metadata bundle: VERIFIED

`GET https://luftdaten.umweltbundesamt.de/api/air-data/v3/meta/json?use=airquality&date_from=2026-09-25&date_to=2026-09-25&time_from=1&time_to=24&lang=en` returned `components`, `scopes`, `limits` (first and last available timestamp per station), `stations`, `networks` (117 KB). **Cache TTL:** 1 d.

---

## 5. DWD pollen forecast (Pollenflug-Gefahrenindex): VERIFIED

`GET https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json` (16 KB, `Last-Modified` and `ETag` headers present).

**Auth:** none. **License:** DWD open data, CC BY 4.0, text attribution `Source: Deutscher Wetterdienst` (see section 3).

**Munich = `region_id` 120 (Bayern), `partregion_id` 121 "Allgäu/Oberbayern/Bay. Wald".** Verified against DWD's own region polygons, not assumed:

`GET https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=dwd:Pollenfluggebiete&outputFormat=application/json&CQL_FILTER=INTERSECTS(THE_GEOM,POINT(48.137%2011.575))`

returned exactly one feature, `{"ID": 48, "GF": 121, "GEN": "Allgäu/Oberbayern/Bay. Wald", "DES": "Pollenfluggebiet"}`, and a local point-in-polygon test confirmed that 48.137 N, 11.575 E lies inside it. (The CQL point is lat lon for WFS 2.0 in EPSG:4326; the GeoJSON geometry is lon, lat.) The neighboring partregion 122 "Donauniederungen" does not cover Munich.

Sample (header, legend, Munich entry with 3 of 8 pollen types):

```json
{"name": "Pollenflug-Gefahrenindex für Deutschland ausgegeben vom Deutschen Wetterdienst", "sender": "Deutscher Wetterdienst - Medizin-Meteorologie",
 "last_update": "2026-09-25 11:00 Uhr", "next_update": "2026-09-26 11:00 Uhr",
 "legend": {"id1": "0", "id1_desc": "keine Belastung", "id2": "0-1", "id2_desc": "keine bis geringe Belastung", "id3": "1", "id3_desc": "geringe Belastung", "id4": "1-2", "id4_desc": "geringe bis mittlere Belastung", "id5": "2", "id5_desc": "mittlere Belastung", "id6": "2-3", "id6_desc": "mittlere bis hohe Belastung", "id7": "3", "id7_desc": "hohe Belastung"},
 "content": [ {"region_id": 120, "region_name": "Bayern", "partregion_id": 121, "partregion_name": "Allgäu/Oberbayern/Bay. Wald",
   "Pollen": {"Graeser": {"today": "0-1", "tomorrow": "0-1", "dayafter_to": "0-1"}, "Ambrosia": {"today": "0-1", "tomorrow": "0", "dayafter_to": "0"}, "Birke": {"today": "0", "tomorrow": "0", "dayafter_to": "0"}, "...": "..."}}, "..."]}
```

Field format:

- `content[]`: 27 entries; `partregion_id` is `-1` for states without subregions (Mecklenburg-Vorpommern, Brandenburg/Berlin).
- `Pollen` keys: `Hasel`, `Erle`, `Esche`, `Birke`, `Graeser`, `Roggen`, `Beifuss`, `Ambrosia`, each with `today`, `tomorrow`, `dayafter_to`.
- Values are **strings** from the legend: `"0"`, `"0-1"`, `"1"`, `"1-2"`, `"2"`, `"2-3"`, `"3"` (none to high). Only legend values were observed; treat anything else as "no data".
- `last_update` / `next_update`: local time strings with "Uhr"; issued daily around 11:00 local (file `Last-Modified` 08:58 GMT).
- DWD's field description is published as `https://opendata.dwd.de/climate_environment/health/alerts/Beschreibung_pollen_s31fg.pdf` (115,792 bytes, not downloaded). The same directory also lists `uvi.json` (UV index), `biowetter.json` and `gt.json` (existence seen in the directory listing, content not inspected).

**Cache TTL:** 3 h, or until `next_update`.

---

## 6. basemap.de raster tiles (BKG) for Leaflet: VERIFIED

Template (Web Mercator, 256 px PNG):

`https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png`

- Verified: z=14, y=5685, x=8718 (central Munich around Stachus; 256x256 RGBA PNG, 115 KB, map content checked visually); z=9, y=177, x=272 works both as `9` and as `09`, so Leaflet's plain `{z}` is fine.
- Grey variant, verified: `.../de_basemapde_web_raster_grau/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png`.
- Capabilities: `https://sgx.geodatenzentrum.de/wmts_basemapde/1.0.0/WMTSCapabilities.xml` lists layers `de_basemapde_web_raster_farbe` and `de_basemapde_web_raster_grau`, tile matrix sets `GLOBAL_WEBMERCATOR` (levels 00 to 19), `DE_EPSG_3857_ADV`, `DE_EPSG_25832_ADV`, `DE_EPSG_25833_ADV`.
- Response headers: `Content-Type: image/png`, `Cache-control: public, max-age=259200, s-maxage=259200` (3 days), `ETag`, `Access-Control-Allow-Origin: *`.

**Auth:** none. The capabilities say there are no access restrictions (`AccessConstraints`).

**License (from the capabilities `Fees` element, paraphrased):** the data are copyrighted and provided free of charge under CC BY 4.0; they may be shared, copied and edited with attribution, and the attribution is the source note. **Required attribution:** `© GeoBasis-DE / BKG (<year of last data retrieval>) CC BY 4.0`, that is for tiles fetched now:

```js
L.tileLayer('https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png', {
  maxZoom: 19,
  attribution: '&copy; GeoBasis-DE / BKG (2026) CC BY 4.0'
});
```

**Cache TTL:** 3 d (as sent by the server).

---

## 7. Bike and scooter sharing (GBFS)

Discovery sources checked: MobilityData's catalog `https://raw.githubusercontent.com/MobilityData/gbfs/master/systems.csv` and nextbike's city list `https://maps2.nextbike.net/maps/nextbike-live.json?list_cities=1` (`api.nextbike.net` redirects there with 301).

### 7a. MyRadl (nextbike system `nextbike_ml`): VERIFIED

**About MVG Rad:** neither nextbike's city list nor MobilityData's catalog contains a system named "MVG Rad" (checked 2026-09-25). The nextbike system that covers Munich is **MyRadl** (`nextbike_ml`, nextbike domain `ml`): its city list entry "München" (city uid 1301) had 3,158 available bikes, plus 36 surrounding municipalities (Garching, Unterföhring, Germering, Holzkirchen and others). [myradl.de](https://www.myradl.de/de/) describes it as the official bike sharing in Munich and 36 further municipalities of the MVV area, bookable in the MVGO, MVV and nextbike apps. So for "MVG Rad" use this feed.

| Feed | URL | Result |
|---|---|---|
| discovery | `https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/gbfs.json` | VERIFIED (languages `de`, `en`) |
| system_information | `https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/en/system_information.json` | VERIFIED |
| station_information | `https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/station_information.json` | VERIFIED, 804 stations |
| station_status | `https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/station_status.json` | VERIFIED, 804 stations |
| free_bike_status | `https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/free_bike_status.json` | VERIFIED, 4,677 bikes (4,318 at stations, 359 free-floating) |
| vehicle_types | `https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/vehicle_types.json` | VERIFIED: `346` bicycle (human), `348` E-Bike (electric_assist, 50 km max range) |
| system_hours, system_regions, system_pricing_plans, geofencing_zones | listed in discovery | not fetched |

**Auth:** none. **License:** `system_information.license_id` = `CC0-1.0`. Operator: nextbike GmbH, feed contact gbfs@nextbike.net. GBFS version 2.3, `ttl` 60 s.

Samples (station Rindermarkt near Marienplatz; `station_area` polygon removed):

```json
{"station_id": "608534902", "name": "Rindermarkt", "short_name": "95005", "lat": 48.136075, "lon": 11.574184, "region_id": "1301",
 "rental_uris": {"android": "https://app.nextbike.net/station?id=608534902", "ios": "...", "web": "https://nxtb.it/p/608534902"}, "is_virtual_station": true}
```

```json
{"station_id": "608534902", "num_bikes_available": 13, "vehicle_types_available": [{"vehicle_type_id": "346", "count": 7}, {"vehicle_type_id": "348", "count": 6}],
 "num_docks_available": 0, "is_installed": true, "is_renting": true, "is_returning": true, "last_reported": 1790343999}
```

```json
{"bike_id": "qmz5E8JrL6YmmeNT2zY1YK6kGbjevad2", "is_reserved": false, "is_disabled": false, "lat": 48.182119, "lon": 11.258064,
 "vehicle_type_id": "346", "station_id": "608535280", "pricing_plan_id": "Rate0779", "rental_uris": {"...": "..."}}
```

Fields: `region_id` 1301 = Munich city (other region ids are the surrounding municipalities; filter on 1301 for city scope). All stations are virtual (`is_virtual_station: true`, `num_docks_available` 0). `last_reported` and `last_updated` are Unix seconds. `bike_id` looks rotated or anonymized (GBFS 2.x practice).

**Cache TTL:** 60 s (the feed's `ttl`).

### 7b. Dott Munich (includes e-scooters): VERIFIED

- Discovery: `https://gbfs.api.ridedott.com/public/v2/munich/gbfs.json` (GBFS 2.3; feeds: free_bike_status, geofencing_zones, system_information, system_pricing_plans, vehicle_types, station_information, station_status).
- `https://gbfs.api.ridedott.com/public/v2/munich/free_bike_status.json`: **4,053 vehicles** (3,483 `dott_scooter`, 570 `dott_bicycle`), `ttl` 300.
- `https://gbfs.api.ridedott.com/public/v2/munich/vehicle_types.json`: `dott_scooter` scooter/electric, 30 km max range; `dott_bicycle` bicycle/electric_assist, 100 km.
- `system_information.json`: `system_id` "dott-munich", no license field.

```json
{"bike_id": "a1ebd986-a058-4e01-bd31-08651706e668", "current_range_meters": 20876, "current_fuel_percent": 0.73, "is_disabled": false, "is_reserved": false,
 "last_reported": 1790343785, "lat": 48.082409, "lon": 11.536531, "pricing_plan_id": "ae803b88-50e4-4c95-b2f3-7944893bd334",
 "rental_uris": {"android": "https://go.ridedott.com/vehicles/...?platform=android", "ios": "..."}, "vehicle_type_id": "dott_scooter"}
```

**Auth:** none. **License:** not stated in the feed; no Dott data terms were found in the feed itself (not researched further). Check Dott's terms before republishing. **Cache TTL:** 60 to 300 s.

### 7c. Bird Munich: NOT WORKING

`https://mds.bird.co/gbfs/v2/public/munich/gbfs.json` answers (200), but `free_bike_status.json` returned `{"version":"2.3","data":{"bikes":[]},"last_updated":0,"ttl":60}`, so the feed is empty. `system_information` links a license PDF (`https://www.bird.co/wp-content/uploads/2019/03/GBFS-Data-License-Agreement-2018-09-25.pdf`, not downloaded).

### 7d. Lime: NOT WORKING

Lime has no Munich entry in the catalog. The catalog URL pattern tested for Munich, `https://data.lime.bike/api/partners/v2/gbfs/munich/gbfs.json`, returned `404 {"errors":[{"status":"404","title":"Resource not found",...}]}`, and the catalog's own Hamburg URL (control) returned the same 404.

### 7e. Voi and Bolt: NOT WORKING for Munich

- Voi's only German feed in the catalog, `https://api.mobidata-bw.de/sharing/gbfs/v3/voi_de/gbfs` (GBFS 3.0, keyless), works, but its `system_regions` lists only Karlsruhe, Mannheim, Pforzheim, Reutlingen, Stuttgart and Tübingen.
- Bolt's German catalog entries are MobiData BW feeds for Karlsruhe, Reutlingen/Tübingen and Stuttgart only; no Munich feed found (not tested further).

### 7f. Tier: NOT WORKING

No Tier entry exists in MobilityData's catalog, and no keyless Tier feed was found. Background (not verified here): TIER and Dott merged in 2024 and the fleet now runs as Dott, so 7b is the relevant feed.

### 7g. Donkey Republic Munich: NOT WORKING (dormant)

`https://stables.donkey.bike/api/public/gbfs/3.0/donkey_munich/gbfs.json` works (license CC0-1.0), but `station_status.json` has 1 station with 0 vehicles and `last_reported` "2023-06-26T08:55:07Z".

---

## 8. Park and Ride and parking garages

### 8a. P+R live occupancy (P+R Park & Ride GmbH): VERIFIED for 4 sites

The operator's site is **parkundride.de** (`www.pr-muenchen.de` failed TLS validation with a certificate name mismatch, and plain HTTP returned an empty body). Its facility pages load live occupancy with JavaScript from an undocumented JSON endpoint:

`GET https://statistik.parkundride.de/api/auslastung/{code}`

Facility codes are only visible in each facility page's HTML (`https://www.parkundride.de/{slug}`); there is no index (`/api/auslastung` and `/api/auslastung/` return 404). Checked so far:

| Facility (page) | Code | Result at 15:49 local |
|---|---|---|
| Mangfallplatz Tiefgarage (`/mangfallplatz`) | `map` | VERIFIED: 113 free of 242 |
| Parkhaus Messestadt Ost (`/messestadt-ost`) | `mso` | VERIFIED: 637 free of 1,061 |
| Parkhaus Olympiazentrum (`/olympiazentrum`) | `oly` | VERIFIED: 91 free of 266 |
| Fürstenried West Tiefgarage (`/fuerstenried-west-tiefgarage`) | `fuwtg` | VERIFIED: 82 free of 210, but `zeit` was 10:01, so stale |
| Parkhaus Fröttmaning (`/froettmaning`) | `f` | NOT WORKING: 404 `{"error": "Anlage \"f\" nicht gefunden, nicht aktiv oder nicht für API-Veröffentlichung freigegeben"}` |
| Perlach, Studentenstadt | none | page has no live-data call |

The other 34 P+R pages in the site's map array were not checked. Finding their codes means fetching each page once and caching the code.

Sample (Mangfallplatz, forecast list truncated):

```json
{"belegt": "129", "frei": "113", "gesamt": "242", "trend": "O", "zeit": "25.09.2026 15:49",
 "prognose": [{"auslastung": "gering", "zeitfenster_ende": "18:00", "zeitfenster_start": "25.09.2026 15:00"},
              {"auslastung": "gering", "zeitfenster_ende": "21:00", "zeitfenster_start": "25.09.2026 18:00"}, "..."]}
```

Fields: `belegt` occupied, `frei` free, `gesamt` capacity (all strings); `zeit` = local time of the count (check freshness); `trend` in `N`, `NO`, `O`, `SO`, `S` (the website draws `O` as a black horizontal arrow, `N`/`NO` green, `SO` orange, `S` red; the meaning is not documented); `prognose[]` = 3-hour windows for about 7 days with `auslastung` values `gering` and `mittel` observed. Response header `Access-Control-Allow-Origin: *`.

**Auth:** none. **Terms:** no license for this endpoint. The [parkundride.de Impressum](https://www.parkundride.de/impressum) says (paraphrased) that content and structure of the site are copyrighted and that reproducing information or data needs P+R's prior express consent unless explicitly intended; all information is without warranty. The API's error text mentions sites being released for API publication, which suggests the operator publishes intentionally, but there are no terms. **Ask P+R Park & Ride GmbH before using this in munichMCP.**

**Cache TTL:** 5 min.

### 8b. P+R static data and occupancy forecasts (open data): static only

From the Munich open data portal CKAN API (`https://opendata.muenchen.de/api/3/action/package_search?fq=organization:p-r-park-ride-gmbh-muenchen`), organization "P+R Park & Ride GmbH München", all under **dl-de/by-2-0** (files listed, not fetched):

- "P+R Anlagen München": `https://opendata.muenchen.de/dataset/a8896f06-15e0-4f29-a509-55384799fff3/resource/aff2ba04-5eb6-4dfe-bc98-4ec3ec3dfdff/download/pr-anlagen-ubersicht-stadt-stand-06-2025.csv`
- "P+R-Anlagen - Belegungsprognosen" (historical forecast by weekday or weekend and time of day; the dataset text says green = more than 75 % free, yellow = more than 10 % free, red = less than 10 % free): `https://opendata.muenchen.de/dataset/b1775816-5c15-49df-bc96-e077ca5558fd/resource/90e7fa46-3400-4fe3-b15d-aa6c74662ec5/download/belegungsprognosen-pr-anlagen-stadt-stand-12-2024.csv`
- "B + R Anlagen" (bike and ride): `.../br-anlagen-uebersicht-stand-12-2024-mit-koordinaten.csv`

**Cache TTL:** 30 d.

### 8c. City parking garages, official live feed: NOT WORKING (none found)

- Munich open data "Parkhäuser München" (`https://opendata.muenchen.de/dataset/parkhaeuser-munchen`, dl-de/by-2-0): **static** list of 72 garages with name, address and coordinates (JSON snapshot `parkhaeuser-places-260224.json`, 2026-02-24). No occupancy fields. Each record's `detailUrl` (`https://muenchenapis.de/places/api/v2/places/{id}.json`) returned **401 Unauthorized**.
- CKAN search for "Parkleitsystem" returned 0 datasets. Web searches found no official public live feed for city garages.

### 8d. Parkleitsystem München Zentrum (PLS-MUC-Z) status page: VERIFIED technically, not a published data product

`GET https://pls-muc-z.com/pls/info/parkhaus.html` returns a plain HTML table of 25 city-center garages (sensor number, device type, P number, name, free, capacity). The civic project parkraumwende.de lists it as the source of its live city-center view.

```html
<tr> <td>106504</td> <td>modem switch</td> <td>P18</td> <td>City-Parkhaus am Färbergraben</td> <td align="right">192</td> <td align="right">350</td> </tr>
```

Problems: no timestamp; some rows are implausible (Car Park Cristal 428 free of 220; TG Hotel Ibis City capacity 0; rows shaded grey look like stale sensors). The site's home page says it is intended for managing the parking guidance system and that its functions require a login; there are no terms of use for data reuse. **Do not use without permission** from the operator or the city (Mobilitätsreferat).

---

## 9. EV charging: live availability

### 9a. Public keyless live status feed: NOT WORKING (none found)

- SWM: according to pages found via web search (not verified further), live charger status is shown in SWM's apps (MVG more, SWM more). The page `https://www.swm.de/elektromobilitaet/oeffentliche-ladestationen` embeds a map (iframe `https://mobile-energie.swm.de/index2.php?mapprivacy=true`: first a Google Maps consent screen, then a map "powered by cirrantic" that loads its data through internal scripts). No documented API and no license were found; the map was not reverse-engineered.
- Munich open data has only static charging data (9b).
- Not tested: the Mobilithek (Germany's national access point, where operators must publish AFIR static and dynamic charging data). Whether a keyless SWM offer exists there is unknown.

### 9b. City of Munich charging locations (static WFS): VERIFIED

Dataset "Standorte der Ladeinfrastruktur" (`https://opendata.muenchen.de/dataset/ruhver_els_standort_point`, dl-de/by-2-0):

`GET https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=mor_wfs:ruhver_els_standort_point&outputFormat=application/json&srsName=EPSG:4326`

- 369 locations (`totalFeatures`). Without `srsName` the coordinates come in UTM 32N (EPSG:25832); with `srsName=EPSG:4326` (verified) they are lon, lat.
- `outputFormat=csv` is listed in CKAN (not tested).

```json
{"type": "Feature", "id": "ruhver_els_standort_point.1", "geometry": {"type": "Point", "coordinates": [11.54670033, 48.15937765]},
 "properties": {"anzahl_els": 1, "anzahl_ladepunkte": 2, "anzahl_stellplaetze": 2, "betreiber": null, "stadtbezirk": 9,
 "standort": "Leonrodplatz 5", "typ": 1, "typ_bedeutung": "IHFEM/Betrauung", "kat_ladegeschwindigkeit": "Normalladen"}}
```

(Geometry from the EPSG:4326 request; properties from the default request.) Fields: charging units (`anzahl_els`), charging points, parking spaces, operator (null in the sample), city district, address, speed category (`Normalladen`). No live status.

The older dataset "Ladeinfrastruktur" (`opendata_ruhver_els_point`) still appears in CKAN, but its WFS layer answers `Feature type mor_wfs:opendata_ruhver_els_point unknown`.

**Cache TTL:** 24 h.

---

## 10. Implementation notes for munichMCP

- **User-Agent:** send a descriptive UA with a project URL, for example `munichMCP/<version> (+<project URL>)`. All endpoints above accepted a custom UA.
- **Rate limits:** none were hit; none are documented for MVG, HND/GKD, UBA or P+R. Keep one in-flight request per upstream and use the TTLs above.
- **Time zones:** MVG departures use epoch ms (UTC); MVG routes use ISO with local offset; HND/GKD/P+R use local time strings `DD.MM.YYYY HH:MM`; UBA uses CET strings; LHP `timestamp` is local time without offset; Bright Sky follows `tz`.
- **Attribution strings to show next to the data:**
  - LfU (HND/GKD): `Datenquelle: Bayerisches Landesamt für Umwelt, www.lfu.bayern.de`
  - LHP: `Datenquelle: www.hochwasserzentralen.de` (link) plus `Stand: <updated>`
  - DWD (Bright Sky, pollen): `Source: Deutscher Wetterdienst`
  - UBA: `Umweltbundesamt mit Daten der Messnetze der Länder und des Bundes` plus a link to dl-de/by-2-0
  - basemap.de: `© GeoBasis-DE / BKG (2026) CC BY 4.0`
  - Munich open data (dl-de/by-2-0): name the provider, the license with its link, and the dataset URL
  - MVG: no license; state that the source is MVG via an unofficial interface
  - MyRadl GBFS: CC0, no attribution required (crediting nextbike is still polite)

---

## Summary

Verified with real responses on 2026-09-25: MVG departures (limit, offsetInMinutes, transportTypes), location search, nearby stations, messages, tickers, lines, station details and routes; HND water level and discharge tables plus Meldestufen for gauge 16005701 (240, 300, 380, 520 cm); GKD water temperature for the same gauge (15.0 °C); the LHP flood API; Bright Sky current weather, forecast and alerts; UBA air data v3 (5 Munich stations, measures, index, forecast; new host luftdaten.umweltbundesamt.de); DWD pollen (Munich = partregion 121, confirmed with DWD polygons); basemap.de tiles; MyRadl (the nextbike system for Munich) and Dott GBFS; P+R live occupancy for 4 sites; the city's static charging WFS.

Not working: GKD CSV download (POST plus terms acceptance), Bird (empty), Lime (404), Voi and Bolt (no Munich coverage), Tier (no feed), Donkey (dormant), official live feeds for city garages and for EV charger status.

Legal caveats: MVG only tolerates private, non-commercial, moderate use, which rules out data mining and can be revoked; a public or commercial service needs consent. HND/GKD HTML tables are web pages under general copyright, and CC BY 4.0 explicitly covers GKD download data, so attribute the LfU and ideally confirm with them. The P+R live API has no license, and its Impressum requires consent. The PLS-MUC-Z page is a management system, not an open feed. Everything else is CC BY 4.0, dl-de/by-2-0 or CC0 with the attributions above.
