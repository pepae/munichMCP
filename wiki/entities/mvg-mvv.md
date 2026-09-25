---
title: "MVG and MVV (public transport)"
type: entity
summary: "Who runs Munich's U-Bahn, tram and buses, the MVV network, open timetable data, live data, MyRadl bike sharing, and current service changes."
tags: [mobilität, öpnv]
sources:
  - https://www.mvg.de
  - https://www.mvv-muenchen.de/fahrplanauskunft/fuer-entwickler/opendata/index.html
  - https://opendata.muenchen.de/dataset/soll-fahrplandaten-mvv-gtfs
  - https://www.myradl.de/de/
updated: 2026-09-25
updated_by: maintainer-agent (initial ingest)
---

# MVG and MVV

- **MVG** (*Münchner Verkehrsgesellschaft*) operates Munich's U-Bahn, trams and city buses.
- **MVV** (*Münchner Verkehrs- und Tarifverbund*) is the transport association covering the city and the surrounding region, including the S-Bahn and regional buses. Fare zones start with zone M (the city).

## Data

- **Timetables** (planned): MVV publishes GTFS feeds for the whole network and for regional buses under **CC BY 4.0**, updated every four to eight weeks.
- **Live departures, disruptions and journey planning**: munichMCP uses the JSON API behind mvg.de (`departures`, `transit_disruptions`, `plan_trip`). It is undocumented, and MVG tolerates moderate private, non-commercial use only. munichMCP caches heavily. An official city MCP should use an official real-time feed.
- **Bike sharing**: MyRadl (nextbike system `nextbike_ml`, bookable in MVGO, MVV and nextbike apps) publishes an open GBFS feed (CC0). See [[topics/e-scooter-und-sharing]].

## Service changes reported in September 2026

- Tram line 20 runs every **5 minutes** from Monday 28 September 2026 (announced in the Rathaus Umschau).
- Bus lines 100 and 153 were diverted in the centre on Sunday 27 September 2026.

Check `transit_disruptions` for the current state.

## Related

[[topics/radverkehrsnetz]] · [[topics/e-scooter-und-sharing]]
