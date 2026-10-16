/**
 * One-off generator for the initial catalog/ manifests of the built-in
 * sources (kept for reference; edit the YAML files directly from now on).
 *   npx tsx scripts/seed-catalog.ts
 * Records each dataset's current CKAN licence as the baseline, so a later
 * licence change makes the health check fail and asks for a human review.
 */
import fs from "node:fs";
import YAML from "yaml";
import { packageShow } from "../src/lib/ckan.js";
import { SOURCES, type SourceId } from "../src/lib/sources.js";
import { ManifestSchema } from "../src/catalog/manifest.js";

type Check = Record<string, unknown>;
const tool = (name: string, args: Record<string, unknown>, expect: string, label?: string): Check => ({ type: "tool", name: label, tool: name, args, expect });
const http = (url: string, expect_text?: string, name?: string): Check => ({ type: "http", name, url, ...(expect_text ? { expect_text } : {}) });
const ckan = (dataset: string, extra: Record<string, unknown> = {}): Check => ({ type: "ckan", dataset, ...extra });
const wfs = (layer: string, min_features = 1): Check => ({ type: "wfs", layer, min_features });

interface Seed {
  id: string;
  source: SourceId;
  module: string;
  description: string;
  refresh: string;
  questions: string[];
  checks: Check[];
}

const SEEDS: Seed[] = [
  { id: "city-services", source: "services", module: "src/sources/services.ts", refresh: "weekly", description: "About 1,450 official service articles of the city's service finder (documents, fees, opening hours, responsible office).", questions: ["How do I register my new address?"], checks: [http("https://huggingface.co/api/datasets/it-at-m/munich-public-services", "munich-public-services", "dataset on Hugging Face"), tool("search_city_services", { query: "Wohnsitz anmelden" }, "stadt\\.muenchen\\.de")] },
  { id: "online-services", source: "onlineServices", module: "src/sources/services.ts", refresh: "weekly", description: "List of all online services of the City of Munich with links.", questions: ["Can I apply for a resident parking permit online?"], checks: [ckan("liste-aller-verfuegbaren-onlinedienste-der-landeshauptstadt-muenchen", { max_age_days: 400 })] },
  { id: "geoportal-planning", source: "geoportal", module: "src/sources/address.ts", refresh: "daily", description: "GeoPortal München layers used for address reports: districts, zoning plan outlines, Milieuschutz areas, resident parking, low-emission zone, solar potential.", questions: ["What applies at Wörthstraße 10?"], checks: [wfs("gsm_wfs:vablock_stadtbezirk", 25), wfs("gsm_wfs:vagrund_baug_umgriff_opendata", 100), tool("address_report", { address: "Marienplatz 8" }, "District: 0?1 Altstadt", "known answer: Marienplatz 8 is in district 1"), tool("address_report", { address: "Wörthstraße 10" }, "Milieuschutz: YES", "known answer: Wörthstraße 10 is in a Milieuschutz area")] },
  { id: "address-index", source: "addressIndex", module: "src/lib/geocode.ts", refresh: "live", description: "The city's address search index behind its map portal (about 162,000 addresses), used to geocode every address.", questions: ["Where exactly is Lindwurmstraße 50?"], checks: [http("https://geoportal.muenchen.de/search/p1_adressen_4326/_search?q=Marienplatz&size=1", "\"hits\"", "search index reachable"), tool("find_address", { query: "Marienplatz 8" }, "Marienplatz 8")] },
  { id: "photon", source: "photon", module: "src/lib/geocode.ts", refresh: "live", description: "OpenStreetMap geocoder (komoot Photon), fallback for landmarks and places outside the city.", questions: ["Where is the Olympiapark?"], checks: [http("https://photon.komoot.io/api/?q=Olympiapark%20M%C3%BCnchen&limit=1", "Olympiapark", "Photon reachable")] },
  { id: "mietspiegel", source: "mietspiegel", module: "src/sources/mietspiegel.ts", refresh: "every two years", description: "Official Munich rent index 2025, computed with the published method and verified against 780 official values.", questions: ["Is 1,540 euros fair for 70 m² built in 1965 in Haidhausen?"], checks: [http("https://2025.mietspiegel-muenchen.de/", undefined, "official rent index site"), tool("estimate_rent", { living_area_m2: 70, year_built: 1965, wohnlage: "zentral_gut" }, "961[.,]80", "known answer: 70 m², 1965, zentral gut = 961.80 euros")] },
  { id: "mvg-live", source: "mvg", module: "src/sources/transit.ts", refresh: "live", description: "Live departures, disruptions and journey planning from the API behind mvg.de (undocumented, tolerated for moderate use, heavily cached).", questions: ["When does the next U-Bahn leave Sendlinger Tor?"], checks: [http("https://www.mvg.de/api/bgw-pt/v3/locations?query=Marienplatz&locationTypes=STATION", "Marienplatz", "MVG API reachable"), tool("departures", { station: "Marienplatz", limit: 3 }, "Departures at Marienplatz"), tool("nearby_stops", { address: "Rosenheimer Straße 5" }, "Stops near"), tool("plan_trip", { from: "Marienplatz", to: "Flughafen München" }, "Connections from Marienplatz")] },
  { id: "council-motions", source: "ris", module: "src/sources/council.ts", refresh: "daily", description: "RSS feeds of the city council's information system: new motions and inquiries of the council and district committees.", questions: ["What has the council asked about cycling lanes?"], checks: [http("https://risi.muenchen.de/risi/rss?feed=StR-Antraege", "<item>", "council feed"), http("https://risi.muenchen.de/risi/rss?feed=BA-Antraege", "<item>", "district committee feed"), tool("council_search", { query: "Radweg" }, "council item")] },
  { id: "roadworks", source: "roadworks", module: "src/sources/roadworks.ts", refresh: "hourly", description: "Construction sites and temporary no-parking zones for the next four weeks.", questions: ["Are there roadworks on Leopoldstraße?"], checks: [wfs("mor_wfs:baustellen_opendata", 50), tool("roadworks_near", { address: "Leopoldstraße 50", radius_m: 500 }, "roadworks")] },
  { id: "isar-gauges", source: "gkd", module: "src/sources/environment.ts", refresh: "15 minutes", description: "Isar water level, discharge and temperature at the Munich gauge (Bavarian flood information service).", questions: ["Is the Isar warm enough for a swim today?"], checks: [http("https://www.hnd.bayern.de/pegel/isar/muenchen-16005701", "M(ü|&uuml;)nchen", "gauge page"), tool("isar_conditions", {}, "Isar")] },
  { id: "dwd-weather", source: "dwd", module: "src/sources/environment.ts", refresh: "hourly", description: "Deutscher Wetterdienst weather and warnings via the Bright Sky API.", questions: ["Will it rain in Munich today?"], checks: [http("https://api.brightsky.dev/current_weather?lat=48.137&lon=11.575", "weather", "Bright Sky reachable"), tool("weather_air_pollen", {}, "Weather")] },
  { id: "uba-air", source: "uba", module: "src/sources/environment.ts", refresh: "hourly", description: "Umweltbundesamt air quality measurements at Munich stations.", questions: ["How is the air quality today?"], checks: [http("https://luftdaten.umweltbundesamt.de/api/air-data/v3/components/json", "PM10", "UBA API reachable")] },
  { id: "dwd-pollen", source: "dwdPollen", module: "src/sources/environment.ts", refresh: "daily", description: "DWD pollen forecast for the Munich part-region.", questions: ["Is the birch pollen bad today?"], checks: [http("https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json", "\"partregion_id\": ?121", "pollen file contains Munich's region")] },
  { id: "mobility-zones", source: "mobility", module: "src/sources/mobility.ts", refresh: "daily", description: "E-scooter and bike-sharing no-riding and no-parking zones, geofences and parking areas, EV charging and mobility points.", questions: ["Can I park my e-scooter at Odeonsplatz?"], checks: [wfs("mor_wfs:ruhver_mim_abstellverbot_ts", 10), wfs("mor_wfs:ruhver_mim_abstellfl_ts", 50), tool("mobility_rules_at", { address: "Odeonsplatz" }, "E-scooters")] },
  { id: "elections", source: "elections", module: "src/sources/elections.ts", refresh: "after each election", description: "Final results of the 2026 city council and mayoral elections and the 2025 federal election, with polling precinct boundaries.", questions: ["How did Haidhausen vote in the council election?"], checks: [http("https://www.wahlen-muenchen.de/ergebnisse/20260308oberbuergermeisterwahl/endergebnis_stadtratswahl.zip", undefined, "results archive"), ckan("wahlen-stimm-und-briefwahlbezirke-in-muenchen"), tool("election_results", {}, "turnout 52\\.3 %", "known answer: council election turnout 52.3 %")] },
  { id: "lfu-noise", source: "lfuNoise", module: "src/sources/risks.ts", refresh: "every five years (EU noise mapping)", description: "EU environmental noise maps 2022 for the Munich agglomeration: road, tram/U-Bahn and industry, Lden and Lnight.", questions: ["How loud is it at Landshuter Allee 51?"], checks: [http("https://www.lfu.bayern.de/gdi/wms/laerm/ballungsraeume?service=WMS&request=GetCapabilities&version=1.3.0", "aggroadlden2022", "noise map service lists the 2022 layers"), tool("noise_and_flood", { address: "Landshuter Allee 51" }, "Road traffic: 7\\d\\.\\d dB\\(A\\) Lden", "known answer: Landshuter Allee 51 is above 70 dB(A)")] },
  { id: "lfu-flood", source: "lfuFlood", module: "src/sources/risks.ts", refresh: "when the authority updates the maps", description: "Flood hazard areas (frequent, 100-year, extreme flood), protected areas and designated flood zones.", questions: ["Can the Flaucher flood?"], checks: [http("https://www.lfu.bayern.de/gdi/wms/wasser/ueberschwemmungsgebiete?service=WMS&request=GetCapabilities&version=1.3.0", "hwgf_hq100", "flood map service"), tool("noise_and_flood", { lat: 48.1105, lon: 11.5575 }, "100-year flood", "known answer: the Flaucher is in the 100-year flood area")] },
  { id: "city-budget", source: "budget", module: "src/sources/budget.ts", refresh: "yearly", description: "Ordinary income and expenses of about 200 city products per department since 2018.", questions: ["What does Munich spend on fire protection?"], checks: [ckan("ordentliche-ertraege-und-aufwendungen-produkte-der-lhm", { max_age_days: 500, columns: ["produkt", "referat", "jahr", "ordentliche ertraege rechnungsergebnis", "ordentliche aufwendungen rechnungsergebnis"] }), tool("city_budget", { query: "Brandschutz" }, "Brandschutz")] },
  { id: "damage-reports", source: "damageReports", module: "src/sources/reports.ts", refresh: "live", description: "Citizen reports of damage (street lights, potholes, litter) from the city's reporting platform (Open311).", questions: ["What has been reported broken near Leopoldstraße 50?"], checks: [http("https://machmuenchenbesser.de/api/georeport/v2/services.json", "service_code", "Open311 API"), tool("damage_reports_near", { address: "Leopoldstraße 50", radius_m: 1500 }, "citizen report")] },
  { id: "press-releases", source: "pressReleases", module: "src/sources/wiki-collector.ts", refresh: "daily", description: "The city's official press releases (Rathaus Umschau), collected daily into the wiki inbox.", questions: ["What did the council decide this week?"], checks: [http("https://ru.muenchen.de/rss", "<item>", "press release feed")] },
  { id: "bike-sharing", source: "bikeSharing", module: "src/sources/places.ts", refresh: "1 minute", description: "MyRadl (MVG Rad) stations with live bike availability (GBFS).", questions: ["Where can I rent a bike near Marienplatz?"], checks: [http("https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/station_status.json", "num_bikes_available", "GBFS feed"), tool("find_nearby", { category: "bike_sharing", address: "Marienplatz", radius_m: 800 }, "MyRadl")] },
  { id: "flood-portal", source: "floodPortal", module: "src/sources/environment.ts", refresh: "15 minutes", description: "Cross-state flood portal: current flood warning class for Bavarian gauges.", questions: ["Is there a flood warning on the Isar?"], checks: [http("https://api.hochwasserzentralen.de/public/v1/data/stations?states=BY", "lhpClass", "flood portal API")] },
  { id: "park-and-ride", source: "parkRide", module: "src/sources/places.ts", refresh: "monthly", description: "P+R and B+R sites with spaces and prices.", questions: ["Where can I park and ride near the U3?"], checks: [ckan("p-r-anlagen-muenchen", { max_age_days: 730 }), tool("find_nearby", { category: "park_and_ride", lat: 48.1, lon: 11.52, radius_m: 5000 }, "P\\+R")] },
  { id: "statistics", source: "stats", module: "src/sources/stats.ts", refresh: "monthly", description: "Statistisches Amt: about 100 datasets of indicators by district (Indikatorenatlas) and monthly city figures.", questions: ["Which district has the most single-person households?"], checks: [ckan("monatszahlen-bevoelkerung", { max_age_days: 120, columns: ["MONATSZAHL", "AUSPRAEGUNG", "JAHR", "MONAT", "WERT"] }), tool("district_stats", { dataset: "monatszahlen-verkehrsunfaelle" }, "Verkehrsunf")] },
  { id: "residents-assemblies", source: "assemblies", module: "src/sources/civic.ts", refresh: "yearly (schedule published in January)", description: "Dates and venues of the district residents' assemblies (Bürgerversammlungen).", questions: ["When is the Bürgerversammlung in Moosach?"], checks: [ckan("termine-buergerversammlungen-muenchen", { max_age_days: 400, columns: ["wochentag", "datum", "uhrzeit", "stadtbezirk_nummer", "veranstaltungsort", "strasse"] }), tool("citizens_assemblies", { district: "Moosach" }, "Moosach")] },
  { id: "facilities", source: "places", module: "src/sources/places.ts", refresh: "daily", description: "Facilities from the open data portal and GeoPortal: drinking fountains, toilets, playgrounds, Kitas, pools, markets, recycling, social and cultural venues.", questions: ["Where is the nearest drinking fountain to Viktualienmarkt?"], checks: [wfs("baug_wfs:trinkwasserbrunnen", 100), ckan("kindertagesbetreuungseinrichtungen-in-muenchen", { max_age_days: 400, columns: ["Name Einrichtung", "Geokoordinaten Breite", "Geokoordinaten Länge"] }), ckan("oeffentliche-spielplaetze-muenchen", { columns: ["ADDRESS.Bezeichnung", "ADDRESS.Lat", "ADDRESS.Lon"] }), tool("find_nearby", { category: "drinking_fountain", address: "Viktualienmarkt", radius_m: 1500 }, "brunnen")] },
  { id: "libraries", source: "library", module: "src/sources/places.ts", refresh: "monthly", description: "Branches of the Münchner Stadtbibliothek with opening details.", questions: ["Where is the nearest library?"], checks: [ckan("standortliste-der-muenchner-stadtbibliothek", { columns: ["bib_name", "lat", "lon"] }), tool("find_nearby", { category: "library", address: "Marienplatz", radius_m: 3000 }, "bibliothek")] },
  { id: "wiki", source: "wiki", module: "src/sources/wiki.ts", refresh: "daily collector, weekly maintainer", description: "The agent-maintained, cross-linked knowledge base compiled from council motions, press releases and datasets.", questions: ["What happened in Munich this week?"], checks: [tool("wiki_index", {}, "pages"), tool("wiki_read", { page: "overview" }, "This week in Munich")] },
];

for (const s of SEEDS) {
  const src = SOURCES[s.source];
  for (const c of s.checks) {
    if (c.type === "ckan") {
      const pkg = await packageShow(c.dataset as string);
      c.licence_id = pkg.license_id;
    }
  }
  const manifest = {
    id: s.id,
    name: src.name,
    description: s.description,
    publisher: src.publisher,
    licence: src.license,
    homepage: src.url,
    access: src.access,
    owner: "@munichmcp/maintainers",
    implementation: { kind: "code", module: s.module, source_id: s.source },
    refresh: s.refresh,
    questions: s.questions,
    checks: s.checks.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined))),
    added: "2026-09-25",
    reviewed: "2026-10-16",
  };
  ManifestSchema.parse(manifest);
  fs.writeFileSync(`catalog/${s.id}.yaml`, `# ${src.name}\n` + YAML.stringify(manifest, { lineWidth: 140 }));
  console.log("wrote", s.id);
}
