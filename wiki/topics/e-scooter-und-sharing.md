---
title: "E-scooters and bike sharing: where you may park and ride"
type: topic
summary: "Munich's official no-riding zones, no-parking zones, 100 m geofences and shared parking areas for e-scooters, bikes, mopeds and cargo bikes."
tags: [mobilität, sharing]
sources:
  - https://opendata.muenchen.de/dataset/ruhver_mim_abstellverbot_ts
  - https://opendata.muenchen.de/dataset/ruhver_mim_fahrverbot_ts
  - https://opendata.muenchen.de/dataset/opendata_ruhver_mim_geofence_poly
  - https://opendata.muenchen.de/dataset/ruhver_mim_abstellfl_ts
  - https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/gbfs.json
  - https://risi.muenchen.de/risi/antrag/detail/10030189
  - https://risi.muenchen.de/risi/antrag/detail/10021014
  - https://risi.muenchen.de/risi/antrag/detail/10017980
  - https://risi.muenchen.de/risi/antrag/detail/10017567
updated: 2026-10-02
updated_by: maintainer-agent
---

# E-scooters and bike sharing

The Mobilitätsreferat publishes the rules that sharing operators must enforce in their apps. munichMCP's `mobility_rules_at` checks all of them for an exact spot.

## The four kinds of zones

- **No-riding zones** (*Fahrverbotszonen* for e-scooters): riding shared e-scooters is forbidden inside. Temporary zones exist for construction sites and events.
- **No-parking zones** (*Abstellverbotszonen*): a rental cannot be ended inside. Separate layers exist for e-scooters and for bike sharing.
- **Shared parking areas** (*geteilte Abstellflächen für Mikromobilität*): designated spots, each marked for e-scooters, bike sharing, e-mopeds and/or cargo bikes. Temporary replacement areas appear during works.
- **Geofences**: a digital no-parking ring of currently **100 m around each shared parking area** for e-scooters. Inside it, you can only end the rental on the parking area itself.

Example: at Odeonsplatz, parking shared e-scooters is prohibited; the nearest designated area is a temporary replacement area about 200 m away (checked 2026-09-25).

## Bike sharing

Munich's nextbike system is **MyRadl** (feed `nextbike_ml`), bookable in the MVGO, MVV and nextbike apps. Its open GBFS feed (CC0) gives live bike and e-bike counts per station; `find_nearby` with category `bike_sharing` shows the nearest stations with availability.

## Recent motions (Stand: 2026-10-02)

Parking of shared vehicles is a recurring topic in the district committees and the council:

- City councillor Laurenz Kiefer asks for better traffic safety and faster repair of defects at **MyRadl** (motion A 00216, 1 October 2026).
- The Trudering-Riem district committee asks for measures against e-scooters parked **in underpasses and on bridges** where they obstruct people (B 00376, 24 September 2026).
- The Ramersdorf-Perlach district committee raises **footpaths blocked by rental bikes** in Frauendreißigerstraße (B 00353) and asks for support for a **no-parking rule for e-scooters** in Adolf-Hackenberg-Straße (B 00358), both 16 September 2026.

These are requests, not decisions; `council_search` shows the current state of each motion.

## Related

[[entities/mvg-mvv]] · [[entities/stadtbezirke]]
