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
  - https://ru.muenchen.de/pdf/2026/ru-2026-10-01.pdf
updated: 2026-10-02
updated_by: maintainer-agent
---

# MVG and MVV

- **MVG** (*Münchner Verkehrsgesellschaft*) operates Munich's U-Bahn, trams and city buses.
- **MVV** (*Münchner Verkehrs- und Tarifverbund*) is the transport association covering the city and the surrounding region, including the S-Bahn and regional buses. Fare zones start with zone M (the city).

## Data

- **Timetables** (planned): MVV publishes GTFS feeds for the whole network and for regional buses under **CC BY 4.0**, updated every four to eight weeks.
- **Live departures, disruptions and journey planning**: munichMCP uses the JSON API behind mvg.de (`departures`, `transit_disruptions`, `plan_trip`). It is undocumented, and MVG tolerates moderate private, non-commercial use only. munichMCP caches heavily. An official city MCP should use an official real-time feed.
- **Bike sharing**: MyRadl (nextbike system `nextbike_ml`, bookable in MVGO, MVV and nextbike apps) publishes an open GBFS feed (CC0). See [[topics/e-scooter-und-sharing]].

## Service changes (Stand: 2026-10-02)

- **U-Bahn renewal works from 5 October 2026**: U3/U6 around Implerstraße and U4/U5 at Max-Weber-Platz until 27 November, U5/U8 around Neuperlach until 8 November. Details and alternatives: [[topics/u-bahn-sanierung-2026]].
- Tram line 20 runs every **5 minutes** since Monday 28 September 2026 (announced in the Rathaus Umschau).
- Bus lines 100 and 153 were diverted in the centre on Sunday 27 September 2026.

Check `transit_disruptions` for the current state.

## Projects

- **Tram Münchner Norden**: on 30 September 2026 the city council approved continuing construction between Schwabing Nord and Kieferngarten; opening is planned for the end of 2031. The bridge over the DB-Nordring also creates a new walking and cycling link between Neufreimann and Parkstadt Schwabing. Planning approval for the second section (Neufreimann to U-Bahn Am Hart) is planned to start in October 2026. (SWM/MVG, 30 September 2026)
- **Tram-Westtangente**: the existing P+R garage at the Aidenbachstraße U-Bahn station is kept and renovated instead of rebuilt; the tram route runs east of it, and opening of the section to Aidenbachstraße is still planned for the end of 2028.
- **Autonomous bus (MINGA)**: since early September an automated MAN Lion's City 12 E runs on bus line 178 between Petuelring and Freimanner Hölzl, with trained safety drivers on board at all times; a pilot with selected test passengers is planned from November 2026. (MAN and MVG, 1 October 2026)

## Related

[[topics/radverkehrsnetz]], [[topics/e-scooter-und-sharing]], [[topics/u-bahn-sanierung-2026]]
