---
title: "Zoning plans (Bebauungspläne)"
type: topic
summary: "What a Bebauungsplan decides, how to find the plan for an address, and what applies where there is none."
tags: [planung, bauen]
sources:
  - https://opendata.muenchen.de/dataset/vagrund_baug_umgriff_opendata
  - https://geoportal.muenchen.de/portal/opendata/
  - https://stadt.muenchen.de/infos/geoportal-muenchen.html
updated: 2026-09-25
updated_by: maintainer-agent (initial ingest)
---

# Zoning plans (*Bebauungspläne*)

A **Bebauungsplan** is a legally binding local plan that fixes what may be built on a plot: use, density, heights, building lines, green space. Munich publishes the outlines of all legally binding plans since 1963, plus plans in preparation (*in Aufstellung*), outdoor-area statutes (*Außenbereichssatzungen*) and land readjustment areas (*Umlegungsgebiete*), with the plan drawing and text as PDFs.

## Finding the plan for an address

`address_report` looks up the point in the city's plan layer and returns the plan number, its kind and direct links to the plan (*Planteil*) and text (*Textteil*) PDFs. Example: Wörthstraße 10 is covered by Bebauungsplan 1707 (plan and text PDFs on muenchen.info) and 2171.

## No plan?

Large parts of the built-up city have no Bebauungsplan. There, projects are usually assessed under **§ 34 BauGB**: a building must fit into the character of its surroundings. Outer areas fall under § 35 BauGB.

Other rules can apply on top: [[topics/milieuschutz]] areas, listed buildings (the solar layer in `address_report` flags monument protection), and tree protection.

The city notes that the web map is not a substitute for the official site plan.

## Related

[[topics/milieuschutz]] · [[entities/stadtrat]]
