---
title: "Elections 2026 and 2025 in Munich (Wahlen)"
type: topic
summary: "Results of the 2026 city council and mayoral elections and the 2025 federal election in Munich, by district and polling precinct."
tags: [wahlen, stadtrat, politik]
sources:
  - https://opendata.muenchen.de/dataset/stadtratswahl-2026-ergebnisse-muenchen
  - https://opendata.muenchen.de/dataset/wahl-der-oberbuergermeisterin-oder-des-oberbuergermeisters-2026-ergebnisse-muenchen
  - https://www.wahlen-muenchen.de/ergebnisse/20260322oberbuergermeisterwahl/
  - https://www.wahlen-muenchen.de/ergebnisse/20250223bundestagswahl/
  - https://opendata.muenchen.de/dataset/wahlen-stimm-und-briefwahlbezirke-in-muenchen
updated: 2026-10-02
updated_by: maintainer-agent
---

# Elections 2026 and 2025 in Munich (*Wahlen*)

The city's election office (*Wahlamt*) publishes final results as open data, per district (*Stadtbezirk*) and per polling precinct (*Stimmbezirk*), together with the precinct boundaries. munichMCP's `election_results` tool answers "how did my neighbourhood vote?" for any address.

## City council election, 8 March 2026 (*Stadtratswahl*)

- Turnout **52.3 %** (572,559 of 1,094,823 eligible voters).
- City-wide shares: GRÜNE 26.5 %, CSU 24.9 %, SPD 19.2 %, Die Linke 6.6 %, AfD 5.9 %, Volt 4.7 %, FDP 3.4 %, ÖDP 2.7 %, FREIE WÄHLER 2.5 %, Rosa Liste 1.0 %.
- Each voter had **80 votes** to distribute (cumulating and splitting allowed), one per seat, so the counts are votes rather than voters.
- The Greens were strongest in the inner districts (up to 35.8 % in Ludwigsvorstadt-Isarvorstadt), the CSU in most outer districts (up to 34.6 % in Allach-Untermenzing), the SPD in Milbertshofen-Am Hart. Turnout ranged from 38.4 % (Milbertshofen-Am Hart) to 58.7 % (Au-Haidhausen).

## Mayoral election (*Oberbürgermeisterwahl*)

- **First round, 8 March 2026:** Dieter Reiter (SPD) 35.6 %, Dominik Krause (GRÜNE) 29.5 %, the CSU candidate 21.3 %, the AfD candidate 4.4 %. No candidate reached 50 %.
- **Runoff, 22 March 2026** (final result of 26 March): **Dominik Krause (GRÜNE) 56.3 %**, Dieter Reiter (SPD) 43.7 %. Dominik Krause is now *Oberbürgermeister*. The runoff results are published on the election office's website but not on the open data portal, so `election_results` covers the first round per district.

## Federal election, 23 February 2025 (*Bundestagswahl*)

- Turnout in Munich **84.3 %**.
- Second votes (*Zweitstimmen*) in Munich: CSU 29.4 %, GRÜNE 23.5 %, SPD 15.3 %, AfD 9.3 %, Die Linke 8.9 %, FDP 6.1 %.
- Munich has four constituencies (*Wahlkreise* 216 to 219); under the 2023 electoral law, winning a constituency no longer guarantees a seat.

## How to read precinct results

Precinct results contain **in-person votes only**. In Munich more than half of voters vote by post (federal election 2025: 429,864 postal and 352,924 in-person voters), and postal votes are counted in separate postal precincts, so district results (which include postal votes) are the better comparison.

## Related

[[entities/stadtrat]] · [[entities/bezirksausschuesse]] · [[entities/stadtbezirke]] · [[topics/buergerversammlungen]]
