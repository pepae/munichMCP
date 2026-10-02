# Questions to try

Questions people actually ask about Munich, grouped by who asks them, with the tools that answer them. Each one returns official data with sources, and most render an interactive view (map, chart, departure board, calculator). The ones marked ★ are good live demos because no web search can answer them.

## Flat hunting

- ★ "I'm looking at a 70 m² flat at Landshuter Allee 51, built 1965, for €1,500 cold. Is that a fair rent, how loud is it, and can it flood?"
  `estimate_rent`, `noise_and_flood`, `address_report`. Answer: road noise 76.5 dB(A) Lden / 69.8 dB(A) at night on the street side, outside all flood areas, rent compared with the Mietspiegel 2025 range.
- ★ "Which side of the building should the bedroom be on at Lindwurmstraße 7?" `noise_and_flood` (the street side reaches 75.5 dB(A) Lden; courtyards are typically 10-20 dB quieter).
- "Is Wörthstraße 10 in a Milieuschutz area, and what does that mean if the landlord wants to renovate?" `address_report`, then `wiki_read` (Erhaltungssatzung).
- "Is there a zoning plan for my plot, and where is the PDF?" `address_report` (Bebauungsplan number with checked PDF links).

## New in town

- "I just moved to Munich. How do I register my address and what do I need to bring?" `search_city_services`, `get_city_service`.
- "Where is the nearest Kita to Leopoldstraße 50, and how many are within 500 m?" `find_nearby` (kita).
- "Which recycling island and Wertstoffhof are closest to me?" `find_nearby`.
- "Where can I get free Wi-Fi and fill my water bottle near Marienplatz?" `find_nearby` (public_wifi, drinking_fountain).

## Getting around

- "When does the next U-Bahn leave from Giselastraße, and are there disruptions?" `departures`, `transit_disruptions`.
- "How do I get from Marienplatz to the airport, and which fare zones do I need?" `plan_trip`.
- "Can I park my e-scooter at Odeonsplatz?" `mobility_rules_at` (no-parking zones and the 100 m geofence rule).
- "Are there roadworks or temporary no-parking zones on Leopoldstraße next week?" `roadworks_near`.

## Civic life

- ★ "When is the Bürgerversammlung for Moosach, and how do I get there from Marienplatz by 18:45?" `citizens_assemblies` (12 Oct 2026, 19:00, Gerastraße 6), then `plan_trip` with `arrive_by`.
- ★ "How did my neighbourhood vote? I live at Wörthstraße 10." `election_results` (district, polling precinct and federal constituency, each compared with the city).
- "Where were the Greens strongest in the 2026 city council election, and where was the AfD?" `election_results` with `party`.
- "What has the city council decided about cycling lanes recently?" `council_search`.

## Journalists and the curious

- ★ "How much does Munich spend on fire protection per resident, and how has it changed since 2018?" `city_budget` (Brandschutz: €210 m net in 2024, €131 per resident, expenses +42 % since 2018).
- "What are the city's biggest net costs, and did it run a deficit in 2024?" `city_budget` (ordinary result 2024: -€903.7 m).
- "Which district has the most single-person households, and how does mine compare?" `find_statistics`, `district_stats`.
- "How many traffic accidents were there last month compared with a year ago?" `district_stats` (Monatszahlen).
- "Which street lights and potholes have people reported near me?" `damage_reports_near`.

## Outdoors

- "Is the Isar warm enough for a swim at the Flaucher today, and is it safe?" `isar_conditions`.
- "Pollen and air quality today? Any weather warnings?" `weather_air_pollen`.
- "Is the Flaucher in a flood zone?" `noise_and_flood` (100-year flood area and designated flood zone of the Isar).

## For city staff (MUCGPT, citizen services)

- "A citizen asks whether their address is in a resident-parking area and how to get a permit." `address_report`, `search_city_services`.
- "Summarise this week's council motions and press releases." `wiki_read` (overview), `council_search`.
- "Which data sources does this use, and under which licences?" `about_munichmcp`.

## Chains that show what an assistant can do with this

1. Address due diligence: `address_report` → `noise_and_flood` → `estimate_rent` → `citizens_assemblies`. One question, four official sources, one coherent answer.
2. Evening plan: `citizens_assemblies` → `plan_trip` (arrive by the start) → `weather_air_pollen`.
3. Newsroom: `election_results` (party by district) → `district_stats` (for example unemployment or single households by district) → the assistant correlates the two.
