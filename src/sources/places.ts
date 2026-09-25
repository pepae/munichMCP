import { datasetCsv } from "../lib/ckan.js";
import { DAY, liveCache } from "../lib/cache.js";
import { fetchJson } from "../lib/http.js";
import { distanceToFeature, haversine, parseCoordinate, representativePoint, type GeoFeature, type LonLat } from "../lib/geo.js";
import { cite, type Citation, type SourceId } from "../lib/sources.js";
import { fold } from "../lib/text.js";
import { getLayer } from "../lib/wfs.js";

/**
 * Point-of-interest registry over City of Munich open data: facilities,
 * mobility infrastructure and Isar spots. Each category knows how to load
 * itself (WFS layer or CSV dataset) and map rows to a uniform Place.
 */

export interface Place {
  id: string;
  category: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
  url?: string;
  details: Record<string, string>;
}

interface CategoryDef {
  id: string;
  label: string;
  group: "everyday" | "family" | "social" | "mobility" | "culture" | "isar";
  source: SourceId;
  dataset: string;
  load: () => Promise<{ items: Place[]; fetchedAt: number }>;
}

const clean = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return !s || s === "NA" || s === "null" || s === "/" ? undefined : s;
};

function details(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const c = clean(v);
    if (c) out[k] = c;
  }
  return out;
}

function fromLayer(
  category: string,
  typeName: string,
  map: (p: Record<string, any>, f: GeoFeature) => { name: string; address?: string; url?: string; details: Record<string, unknown> },
) {
  return async () => {
    const layer = await getLayer(typeName);
    const items: Place[] = [];
    layer.features.forEach((f, i) => {
      const pt = representativePoint(f);
      if (!pt) return;
      const m = map(f.properties, f);
      items.push({ id: `${category}:${f.id ?? i}`, category, name: m.name, lat: pt.lat, lon: pt.lon, address: clean(m.address), url: clean(m.url), details: details(m.details) });
    });
    return { items, fetchedAt: layer.fetchedAt };
  };
}

function fromCsv(
  category: string,
  dataset: string,
  map: (r: Record<string, string>) => { name?: string; lat?: unknown; lon?: unknown; address?: string; url?: string; details: Record<string, unknown> } | null,
) {
  return async () => {
    const { rows, fetchedAt } = await datasetCsv(dataset, { maxAgeMs: DAY });
    const items: Place[] = [];
    rows.forEach((r, i) => {
      const m = map(r);
      if (!m) return;
      const lat = parseCoordinate(m.lat);
      const lon = parseCoordinate(m.lon);
      if (lat === undefined || lon === undefined || !m.name) return;
      items.push({ id: `${category}:${i}`, category, name: m.name, lat, lon, address: clean(m.address), url: clean(m.url), details: details(m.details) });
    });
    return { items, fetchedAt };
  };
}

const addr = (...parts: unknown[]) => parts.map(clean).filter(Boolean).join(" ");

/** MyRadl (MVG Rad's successor, operated by nextbike) GBFS 2.3 feed, CC0, TTL 60 s. */
const GBFS = "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de";

async function loadBikeSharing(): Promise<{ items: Place[]; fetchedAt: number }> {
  const { value, fetchedAt } = await liveCache.get("gbfs:nextbike_ml", 60_000, async () => {
    const [info, status] = await Promise.all([
      fetchJson<{ data: { stations: any[] } }>(`${GBFS}/station_information.json`),
      fetchJson<{ data: { stations: any[] } }>(`${GBFS}/station_status.json`),
    ]);
    const st = new Map(status.data.stations.map((s) => [String(s.station_id), s]));
    return info.data.stations
      .filter((s) => String(s.region_id) === "1301")
      .map((s): Place => {
        const x = st.get(String(s.station_id)) ?? {};
        const count = (type: string) => (x.vehicle_types_available ?? []).find((v: any) => String(v.vehicle_type_id) === type)?.count ?? 0;
        return {
          id: `bike_sharing:${s.station_id}`,
          category: "bike_sharing",
          name: `MyRadl ${s.name}`,
          lat: s.lat,
          lon: s.lon,
          url: s.rental_uris?.web,
          details: details({
            bikes_available: String(x.num_bikes_available ?? 0),
            classic_bikes: String(count("346")),
            e_bikes: String(count("348")),
            renting: x.is_renting === false ? "no" : "yes",
            last_reported: x.last_reported ? new Date(x.last_reported * 1000).toISOString().slice(11, 16) + " UTC" : undefined,
          }),
        };
      });
  });
  return { items: value, fetchedAt };
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: "drinking_fountain", label: "Drinking fountains (Trinkbrunnen)", group: "everyday", source: "places", dataset: "opendata_trinkwasserbrunnen",
    load: fromLayer("drinking_fountain", "baug_wfs:trinkwasserbrunnen", (p) => ({ name: p.bezeichnung ?? "Trinkbrunnen", details: { note: p.bemerkung } })),
  },
  {
    id: "public_toilet", label: "Public toilets", group: "everyday", source: "places", dataset: "wc_finder",
    load: fromLayer("public_toilet", "gsm_wfs:wc_finder_opendata", (p) => ({
      name: p.name ?? "Öffentliche Toilette",
      address: addr(p.strasse, p.hausnr),
      details: { opening_hours: p.oeffnungszeiten, category: p.kategorie, price_eur: p.preis, baby_changing: p.wickeln, condition: p.zustand, restrictions: p.einschraenkungen, location: p.standort_beschreibung },
    })),
  },
  {
    id: "playground", label: "Public playgrounds", group: "family", source: "places", dataset: "oeffentliche-spielplaetze-muenchen",
    load: fromCsv("playground", "oeffentliche-spielplaetze-muenchen", (r) => ({
      name: r["ADDRESS.Bezeichnung"]?.replace(/^Spielplatz\s*/, "Spielplatz ").replace(/"/g, ""),
      lat: r["ADDRESS.Lat"], lon: r["ADDRESS.Lon"],
      details: { features: r["Besondere Angebote"], age_group: r["Altersgruppe"], inclusive: r["Inklusives Spielangebot"], other: r["Sonstige Angebote"] },
    })),
  },
  {
    id: "kita", label: "Childcare (Kitas, Krippen, Kindergärten)", group: "family", source: "places", dataset: "kindertagesbetreuungseinrichtungen-in-muenchen",
    load: fromCsv("kita", "kindertagesbetreuungseinrichtungen-in-muenchen", (r) => ({
      name: r["Name Einrichtung"],
      lat: r["Geokoordinaten Breite"], lon: r["Geokoordinaten Länge"],
      address: addr(r["Straße"], `${r["Haus-nr."] ?? ""}${r["Hausnummern-zusatz"] ?? ""}`, r["PLZ"]),
      url: "https://kitafinder.muenchen.de",
      details: { type: r["Einrichtungsart"], operator: r["Trägerschaft"], district: r["Stadtbezirk Name"] },
    })),
  },
  {
    id: "library", label: "Public libraries (Münchner Stadtbibliothek)", group: "culture", source: "library", dataset: "standortliste-der-muenchner-stadtbibliothek",
    load: fromCsv("library", "standortliste-der-muenchner-stadtbibliothek", (r) => ({
      name: r.bib_name, lat: r.lat, lon: r.lon, address: addr(r.bib_strasse, r.bib_plz), url: r.webseite,
      details: { type: r.bib_type, open_library_self_service: r.open_library, accessibility: r.barrierefreiheit, workplaces: r.anzahl_arbeitsplaetze },
    })),
  },
  {
    id: "swimming_pool", label: "Swimming pools (M-Bäder)", group: "everyday", source: "places", dataset: "schwimmbaeder-in-muenchen",
    load: fromCsv("swimming_pool", "schwimmbaeder-in-muenchen", (r) => ({
      name: r.name, lat: r.latitude, lon: r.longitude, address: addr(r.strasse, r.plz), url: r.informationen,
      details: { type: r.art, opening_hours: r.oeffnungszeiten_bad, sauna: r.sauna_vorhanden, sauna_hours: r.oeffnungszeiten_sauna, live_occupancy: r.echtzeitauslastung },
    })),
  },
  {
    id: "market", label: "Markets (Wochenmärkte, Viktualienmarkt, ...)", group: "everyday", source: "places", dataset: "maerkte",
    load: fromLayer("market", "gsm_wfs:maerkte", (p) => ({ name: clean(p.inhalt)?.split(",")[0] ?? p.rubrik ?? "Markt", address: p.adresse, url: p.link, details: { type: p.rubrik, info: p.inhalt } })),
  },
  {
    id: "glass_container", label: "Recycling islands (glass, cans, clothes)", group: "everyday", source: "places", dataset: "awm_container_opendata",
    load: fromLayer("glass_container", "gsm_wfs:awm_container", (p) => ({
      name: `Wertstoffinsel ${clean(p.adresse) ?? ""}`.trim(), address: p.adresse,
      details: { glass: p.glas_weiss || p.glas_gruen || p.glas_braun ? "yes" : undefined, clothes: p.altkleider ? "yes" : undefined, packaging_lvp: p.lvp ? "yes" : undefined },
    })),
  },
  {
    id: "recycling_center", label: "Recycling centres (Wertstoffhöfe)", group: "everyday", source: "places", dataset: "awm_wertstoffhoefe_opendata",
    load: fromLayer("recycling_center", "gsm_wfs:awm_wertstoffhoefe", (p) => ({ name: `Wertstoffhof ${clean(p.adresse) ?? ""}`.trim(), address: p.adresse, url: p.link, details: {} })),
  },
  {
    id: "senior_center", label: "Senior service centres (Alten- und Service-Zentren)", group: "social", source: "places", dataset: "bestand_asz_opendata",
    load: fromLayer("senior_center", "soz_wfs:bestand_asz", (p) => ({ name: p.name ?? "Alten- und Service-Zentrum", address: addr(p.st2, p.za3), details: { operator: p.v4 } })),
  },
  {
    id: "social_center", label: "Social citizen centres (Sozialbürgerhäuser)", group: "social", source: "places", dataset: "bestand_sbh_opendata",
    load: fromLayer("social_center", "soz_wfs:bestand_sbh", (p) => ({ name: p.name ?? "Sozialbürgerhaus", address: addr(p.st2, p.za3), details: { social_regions: p.sozialregi } })),
  },
  {
    id: "neighborhood_center", label: "Neighbourhood meeting points (Nachbarschaftstreffs)", group: "social", source: "places", dataset: "bestand_nachbarschaftstreffs_opendata",
    load: fromLayer("neighborhood_center", "soz_wfs:bestand_nachbarschaftstreffs", (p) => ({ name: `Nachbarschaftstreff ${addr(p.st2, p.za3)}`, address: addr(p.st2, p.za3), details: {} })),
  },
  {
    id: "care_home", label: "Residential care homes (vollstationäre Pflege)", group: "social", source: "places", dataset: "vollst_pflegeeinrichtung_opendata",
    load: fromLayer("care_home", "soz_wfs:vollst_pflegeeinrichtung", (p) => ({ name: p.name ?? "Pflegeeinrichtung", address: p.st2, details: { operator: p.traeger } })),
  },
  {
    id: "cemetery", label: "Municipal cemeteries", group: "social", source: "places", dataset: "liste-staedtische-friedhoefe-muenchen",
    load: fromCsv("cemetery", "liste-staedtische-friedhoefe-muenchen", (r) => ({
      name: r.bezeichnung, lat: r.latitude, lon: r.longitude, address: addr(r.strasse, r.plz), url: r.weblink,
      details: { area_ha: r["flaeche_(hektar)"], graves: r.graeberzahl, funeral_hall: r.aussegnungshalle },
    })),
  },
  {
    id: "culture_venue", label: "Municipal cultural venues", group: "culture", source: "places", dataset: "staedtische-kultureinrichtungen",
    load: fromCsv("culture_venue", "staedtische-kultureinrichtungen", (r) => ({
      name: r.name, lat: r.latitude, lon: r.longitude, address: addr(r["straße"], r.hausnummer, r.plz), url: r.url, details: { type: r.art },
    })),
  },
  {
    id: "sight", label: "Tourist sights and attractions", group: "culture", source: "places", dataset: "touristische-points-of-interests-poi-muenchen",
    load: fromCsv("sight", "touristische-points-of-interests-poi-muenchen", (r) => ({
      name: r.name, lat: r["geo-latitude"], lon: r["geo-longitude"], address: r.address, url: r.url, details: { type: r.bayernCloudType, description: r.description?.slice(0, 300) },
    })),
  },
  {
    id: "sports_program", label: "Free/low-cost city indoor sports sessions (Hallensportprogramm)", group: "everyday", source: "places", dataset: "hallensportprogramm",
    load: fromCsv("sports_program", "hallensportprogramm", (r) => ({
      name: `${r.sportangebot}${r["sportangebot-detail"] ? ` (${r["sportangebot-detail"]})` : ""}`,
      lat: r.latitude, lon: r.longitude, address: addr(r.strasse, r.hausnummer), url: r.webseite,
      details: { weekday: r.wochentag, time: `${r.uhrzeit_start}-${r.uhrzeit_ende}`, venue: r.schulnamen, hall: r["hn-zusatz"], info: r.zusatzinfomationen },
    })),
  },
  {
    id: "bike_sharing", label: "MVG Rad / MyRadl bike-sharing stations (live availability)", group: "mobility", source: "bikeSharing", dataset: "gbfs-nextbike_ml",
    load: loadBikeSharing,
  },
  {
    id: "ev_charging", label: "Public EV charging stations", group: "mobility", source: "mobility", dataset: "ruhver_els_standort_point",
    load: fromLayer("ev_charging", "mor_wfs:ruhver_els_standort_point", (p) => ({
      name: `Ladestation ${clean(p.standort) ?? ""}`.trim(), address: p.standort,
      details: { charge_points: p.anzahl_ladepunkte, speed: p.kat_ladegeschwindigkeit, operator: p.betreiber, parking_spaces: p.anzahl_stellplaetze },
    })),
  },
  {
    id: "disabled_parking", label: "Disabled parking spaces", group: "mobility", source: "mobility", dataset: "behindertenparkplaetze",
    load: fromLayer("disabled_parking", "mor_wfs:behindertenparkplaetze", (p) => ({
      name: `Behindertenparkplatz ${clean(p.bezeichnung) ?? ""}`.trim(), address: p.bezeichnung,
      details: { spaces: p.anzahl_stellplaetze, status: p.status, time_limits: p.zeitliche_einschraenkung, note: p.hinweis, permanently_available: p.dauerhaft_verfuegbar },
    })),
  },
  {
    id: "park_and_ride", label: "Park + Ride (P+R) sites", group: "mobility", source: "parkRide", dataset: "p-r-anlagen-muenchen",
    load: fromCsv("park_and_ride", "p-r-anlagen-muenchen", (r) => ({
      name: `P+R ${r.name_anlage}`, lat: r.latitude, lon: r.longitude, address: r.adresse, url: "https://www.parkundride.de",
      details: { spaces: r.stellplaetze_gesamt, ev_spaces: r.stellplaetze_elektro, price_day: r.parkpreis_einzel, price_month: r.parkpreis_monat_eur, max_stay: r.hoechstparkdauer, transit: r["oepnv-anbindung"], type: r.bauform, clearance: r.einfahrtshoehe },
    })),
  },
  {
    id: "bike_and_ride", label: "Bike + Ride (B+R) bike parking at stations", group: "mobility", source: "parkRide", dataset: "b-r-anlagen",
    load: fromCsv("bike_and_ride", "b-r-anlagen", (r) => ({
      name: `B+R ${r.name_anlage}`, lat: r.latitude, lon: r.longitude, address: r.adresse,
      details: { bike_spaces: r.abstellplaetze, transit: r["oepnv-anbindung"], type: r.bauform },
    })),
  },
  {
    id: "parking_garage", label: "Parking garages", group: "mobility", source: "places", dataset: "parkhaeuser-munchen",
    load: fromCsv("parking_garage", "parkhaeuser-munchen", (r) => ({
      name: r.places__title, lat: r.places__location__lat, lon: r.places__location__lng, address: addr(r.places__street, r.places__streetNumber), details: {},
    })),
  },
  {
    id: "mobility_point", label: "Mobility points (sharing hubs)", group: "mobility", source: "mobility", dataset: "opendata_ruhver_mp_standort_point",
    load: fromLayer("mobility_point", "mor_wfs:ruhver_mp_standort_point", (p) => ({
      name: `Mobilitätspunkt ${clean(p.name) ?? ""}`.trim(), address: p.adresse,
      details: {
        carsharing_spaces: p.anz_stellpl_cs, charge_points_ac: p.anzahl_ladepunkte_ac, charge_points_dc: p.anzahl_ladepunkte_dc,
        escooter_parking: p.gaf_ts_vorhanden, bikesharing_parking: p.gaf_bs_vorhanden, cargo_bike: p.gaf_ls_vorhanden, moped_sharing: p.gaf_ms_vorhanden,
      },
    })),
  },
  {
    id: "carsharing_station", label: "Station-based carsharing parking", group: "mobility", source: "mobility", dataset: "ruhver_carsharing_station",
    load: fromLayer("carsharing_station", "mor_wfs:ruhver_carsharing_station", (p) => ({
      name: `Carsharing ${clean(p.anbietername) ?? ""} ${clean(p.sonderparken_standortname) ?? ""}`.trim(), address: p.sonderparken_standortname, details: { provider: p.anbietername, type: p.sonderparken_typ_text },
    })),
  },
  {
    id: "bike_service_station", label: "Bike service stations (air pump, tools)", group: "mobility", source: "mobility", dataset: "ruhver_radservicestation_point",
    load: fromLayer("bike_service_station", "mor_wfs:ruhver_radservicestation_point", (p) => ({ name: p.standort ?? "Radservicestation", address: p.ortsangabe, details: { pump: p.luftpumpe, tools: p.servicestation, note: p.bemerkung } })),
  },
  {
    id: "bike_counter", label: "Permanent bike counting stations", group: "mobility", source: "mobility", dataset: "opendata_raddauerzaehlstellen",
    load: fromLayer("bike_counter", "mor_wfs:raddauerzaehlstellen", (p) => ({
      name: `Raddauerzählstelle ${clean(p.zaehlstelle_lang) ?? clean(p.zaehlstelle) ?? ""}`.trim(), details: { this_year_total: p.gesamt_sum_year, last_month: p.gesamt_sum_monat, directions: addr(p.richtung_1, "/", p.richtung_2) },
    })),
  },
  {
    id: "parcel_box", label: "Parcel lockers (Paketboxen on public ground)", group: "everyday", source: "mobility", dataset: "paketboxen",
    load: fromLayer("parcel_box", "mor_wfs:paketboxen", (p) => ({
      name: `Paketbox ${clean(p.betreiber) ?? ""}`.trim(),
      details: { operator: p.betreiber, hours: p.oeffnungszeiten, carriers: ["dhl", "ups", "hermes", "gls", "dpd", "fedex", "amazon"].filter((c) => p[c] === "Ja").join(", ") },
    })),
  },
  {
    id: "isar_danger_spot", label: "Isar danger spots (weirs, currents)", group: "isar", source: "places", dataset: "gefahrenstellen_isar_opendata",
    load: fromLayer("isar_danger_spot", "rku_wfs:isar_gefahrenstellen", (p) => ({ name: p.lage ?? "Gefahrenstelle", details: { warning_de: p.hinweis, warning_en: p.warning, affects: p.betrifft } })),
  },
];

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];
export const categoryIds = CATEGORY_IDS;

export function getCategory(id: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export interface NearbyResult {
  category: string;
  label: string;
  items: (Place & { distance_m: number })[];
  total_in_radius: number;
  citation: Citation;
}

export async function findNearby(categoryId: string, at: LonLat, opts: { limit?: number; radiusM?: number; query?: string } = {}): Promise<NearbyResult> {
  const cat = getCategory(categoryId);
  if (!cat) throw new Error(`Unknown category "${categoryId}". Valid: ${CATEGORY_IDS.join(", ")}`);
  const { items, fetchedAt } = await cat.load();
  const limit = Math.min(opts.limit ?? 5, 25);
  const radius = opts.radiusM ?? 2000;
  const q = opts.query ? fold(opts.query) : undefined;
  const scored = items
    .filter((p) => !q || fold(`${p.name} ${p.address ?? ""} ${Object.values(p.details).join(" ")}`).includes(q))
    .map((p) => ({ ...p, distance_m: Math.round(haversine(at, p)) }))
    .filter((p) => p.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m);
  return {
    category: cat.id,
    label: cat.label,
    items: scored.slice(0, limit),
    total_in_radius: scored.length,
    citation: { ...cite(cat.source, fetchedAt), url: `https://opendata.muenchen.de/dataset/${cat.dataset}` },
  };
}

/** Distance to the nearest feature of a polygon/line layer (for mobility rules etc.). */
export function nearestFeatures(features: GeoFeature[], at: LonLat, max = 3, radiusM = 1000) {
  return features
    .map((f) => ({ f, d: distanceToFeature(f, at) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, max);
}
