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
updated: 2026-09-25
updated_by: maintainer-agent (initial ingest)
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

## Related

[[entities/mvg-mvv]] · [[entities/stadtbezirke]]
