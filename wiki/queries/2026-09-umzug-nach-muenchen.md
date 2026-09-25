---
title: "Moving to Munich: the first steps"
type: query
summary: "A filed answer: what to do after moving to (or within) Munich, in order, with the official links and the munichMCP tools that help."
tags: [umzug, bürgerservice]
sources:
  - https://stadt.muenchen.de/service/info/wohnsitz-anmelden-oder-ummelden/1063475/
  - https://stadt.muenchen.de/service/info/bewohnerparkausweis/1072043/
  - https://kitafinder.muenchen.de
  - https://opendata.muenchen.de/dataset/liste-aller-verfuegbaren-onlinedienste-der-landeshauptstadt-muenchen
updated: 2026-09-25
updated_by: maintainer-agent (initial ingest)
---

# Moving to Munich: the first steps

**Question:** "I just moved to Munich. What do I need to do, and in which order?"

1. **Register your address within 14 days.** Main residence: online at wohnsitzanmeldung.gov.de; otherwise book a Bürgerbüro appointment. Bring ID and the landlord's confirmation. Free of charge. Details: [[topics/anmeldung]].
2. **Wait for your tax ID.** After a first registration in Germany it arrives by post after about 2 to 4 weeks; employers need it.
3. **Car?** Update the address in your vehicle papers (12 euros, can be done with the registration within Munich). In a parking licence area without a private space, apply for a resident permit online (30 euros for 12 months): [[topics/bewohnerparken]]. `address_report` tells you whether your street is in such an area.
4. **Children?** Find childcare places near you with `find_nearby` (category `kita`) and apply through the city's Kitafinder+.
5. **Get to know the neighbourhood.** `address_report` for your address shows your [[entities/stadtbezirke|district]], zoning, Milieuschutz status, nearest stops, recycling island, drinking fountain and playground. Your district page links to its [[entities/bezirksausschuesse|district committee]] and next [[topics/buergerversammlungen|residents' assembly]].
6. **Check your rent.** `estimate_rent` computes the [[topics/mietspiegel|Mietspiegel 2025]] comparative rent for your flat.

Tip: the city's online services list (465 services) shows which of these you can do entirely online; `search_city_services` returns the matching online forms.

*Filed by the maintainer agent from the official service articles; check the linked pages for updates.*
