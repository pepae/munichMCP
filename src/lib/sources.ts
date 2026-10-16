/**
 * Attribution registry. Every tool result lists the sources it used, with
 * licence and retrieval time. dl-de/by-2.0 and CC BY require attribution.
 */
export interface SourceInfo {
  id: string;
  name: string;
  publisher: string;
  license: string;
  url: string;
  access: "open-data" | "public-api" | "tolerated-unofficial";
  notes?: string;
}

const DL_BY = "Datenlizenz Deutschland Namensnennung 2.0 (dl-de/by-2.0)";

export const SOURCES = {
  services: {
    id: "services",
    name: "Münchner Verwaltungs-Dienstleistungen (Dienstleistungsfinder corpus)",
    publisher: "Landeshauptstadt München, it@M",
    license: "MIT (Hugging Face dataset it-at-m/munich-public-services)",
    url: "https://huggingface.co/datasets/it-at-m/munich-public-services",
    access: "open-data",
  },
  onlineServices: {
    id: "onlineServices",
    name: "Liste aller verfügbaren Onlinedienste der Landeshauptstadt München",
    publisher: "Landeshauptstadt München, IT-Referat",
    license: DL_BY,
    url: "https://opendata.muenchen.de/dataset/liste-aller-verfuegbaren-onlinedienste-der-landeshauptstadt-muenchen",
    access: "open-data",
  },
  geoportal: {
    id: "geoportal",
    name: "GeoPortal München (WFS/WMS open geodata)",
    publisher: "Landeshauptstadt München, GeodatenService",
    license: DL_BY,
    url: "https://geoportal.muenchen.de/portal/opendata/",
    access: "open-data",
  },
  addressIndex: {
    id: "addressIndex",
    name: "GeoPortal München address search index",
    publisher: "Landeshauptstadt München, GeodatenService",
    license: "Public search service of the GeoPortal (address data published as open data under dl-de/by-2.0)",
    url: "https://geoportal.muenchen.de/",
    access: "public-api",
  },
  photon: {
    id: "photon",
    name: "Photon geocoder (OpenStreetMap data)",
    publisher: "komoot / OpenStreetMap contributors",
    license: "ODbL (OpenStreetMap)",
    url: "https://photon.komoot.io",
    access: "public-api",
    notes: "Fallback geocoder, fair use.",
  },
  mietspiegel: {
    id: "mietspiegel",
    name: "Mietspiegel für München 2025",
    publisher: "Landeshauptstadt München, Sozialreferat",
    license: "Official publication (methodology and tables), reproduced for calculation",
    url: "https://2025.mietspiegel-muenchen.de/",
    access: "open-data",
  },
  mvg: {
    id: "mvg",
    name: "MVG live departures and messages (unofficial mvg.de API)",
    publisher: "Münchner Verkehrsgesellschaft (MVG)",
    license: "Not licensed; MVG tolerates moderate private, non-commercial use",
    url: "https://www.mvg.de",
    access: "tolerated-unofficial",
    notes: "Cached aggressively. An official munichMCP would use an official MVG/MVV realtime feed.",
  },
  ris: {
    id: "ris",
    name: "Ratsinformationssystem München (RSS feeds)",
    publisher: "Landeshauptstadt München, Direktorium",
    license: DL_BY,
    url: "https://risi.muenchen.de",
    access: "open-data",
  },
  roadworks: {
    id: "roadworks",
    name: "Baustellen: temporäre Einschränkungen beim Gehen, Fahren und Parken",
    publisher: "Landeshauptstadt München, Mobilitätsreferat",
    license: DL_BY,
    url: "https://opendata.muenchen.de/dataset/baustellen_4_weeks_opendata",
    access: "open-data",
  },
  gkd: {
    id: "gkd",
    name: "Hochwassernachrichtendienst / Gewässerkundlicher Dienst Bayern (gauge München 16005701)",
    publisher: "Bayerisches Landesamt für Umwelt (LfU)",
    license: "Read from the public HND/GKD web tables; CC BY 4.0 formally covers the GKD download data",
    url: "https://www.hnd.bayern.de/pegel/isar/muenchen-16005701",
    access: "public-api",
    notes: "No public API exists; an official munichMCP should use a licensed LfU feed.",
  },
  dwd: {
    id: "dwd",
    name: "Deutscher Wetterdienst open data via Bright Sky",
    publisher: "Deutscher Wetterdienst (DWD), API by Bright Sky",
    license: "DWD open data (GeoNutzV / CC BY 4.0 compatible attribution)",
    url: "https://brightsky.dev",
    access: "open-data",
  },
  uba: {
    id: "uba",
    name: "Umweltbundesamt air quality data",
    publisher: "Umweltbundesamt (UBA) with Bayerisches Landesamt für Umwelt",
    license: "dl-de/by-2.0",
    url: "https://www.umweltbundesamt.de/daten/luft/luftdaten",
    access: "open-data",
  },
  dwdPollen: {
    id: "dwdPollen",
    name: "DWD pollen forecast",
    publisher: "Deutscher Wetterdienst (DWD)",
    license: "DWD open data",
    url: "https://opendata.dwd.de/climate_environment/health/alerts/",
    access: "open-data",
  },
  mobility: {
    id: "mobility",
    name: "Mobilitätsreferat open geodata (sharing zones, parking, charging, mobility points)",
    publisher: "Landeshauptstadt München, Mobilitätsreferat",
    license: DL_BY,
    url: "https://opendata.muenchen.de/organization/mobilitaetsreferat",
    access: "open-data",
  },
  elections: {
    id: "elections",
    name: "Election results and polling precincts (Wahlamt München)",
    publisher: "Landeshauptstadt München, Kreisverwaltungsreferat, Wahlamt",
    license: "Datenlizenz Deutschland Namensnennung 2.0 (dl-de/by-2.0)",
    url: "https://opendata.muenchen.de/dataset/stadtratswahl-2026-ergebnisse-muenchen",
    access: "open-data",
  },
  lfuNoise: {
    id: "lfuNoise",
    name: "Environmental noise maps 2022 (Umgebungslärmkartierung, Ballungsraum München)",
    publisher: "Bayerisches Landesamt für Umwelt (Datenquelle: Bayerisches Landesamt für Umwelt, www.lfu.bayern.de)",
    license: "CC BY 4.0",
    url: "https://www.lfu.bayern.de/laerm/umgebungslaerm/index.htm",
    access: "open-data",
  },
  lfuFlood: {
    id: "lfuFlood",
    name: "Flood hazard areas and designated flood zones (Hochwassergefahrenflächen, Überschwemmungsgebiete)",
    publisher: "Bayerisches Landesamt für Umwelt (Datenquelle: Bayerisches Landesamt für Umwelt, www.lfu.bayern.de)",
    license: "CC BY 4.0",
    url: "https://www.lfu.bayern.de/wasser/hw_ue_gebiete/index.htm",
    access: "open-data",
  },
  budget: {
    id: "budget",
    name: "Ordentliche Erträge und Aufwendungen der Produkte der LHM (city budget results by product)",
    publisher: "Landeshauptstadt München, Stadtkämmerei",
    license: "Datenlizenz Deutschland Namensnennung 2.0 (dl-de/by-2.0)",
    url: "https://opendata.muenchen.de/dataset/ordentliche-ertraege-und-aufwendungen-produkte-der-lhm",
    access: "open-data",
  },
  damageReports: {
    id: "damageReports",
    name: "machmuenchenbesser.de citizen damage reports (Open311 GeoReport v2)",
    publisher: "Landeshauptstadt München, Baureferat",
    license: "CC0 1.0",
    url: "https://machmuenchenbesser.de",
    access: "open-data",
  },
  pressReleases: {
    id: "pressReleases",
    name: "Rathaus Umschau (official press releases of the City of Munich)",
    publisher: "Landeshauptstadt München, Presse- und Informationsamt",
    license: "Press releases may be reprinted with source attribution (city imprint)",
    url: "https://ru.muenchen.de",
    access: "public-api",
  },
  bikeSharing: {
    id: "bikeSharing",
    name: "MyRadl / MVG Rad bike sharing (GBFS 2.3 feed nextbike_ml)",
    publisher: "nextbike GmbH for MVV/MVG",
    license: "CC0 1.0 (declared in the feed)",
    url: "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/gbfs.json",
    access: "open-data",
  },
  floodPortal: {
    id: "floodPortal",
    name: "Länderübergreifendes Hochwasserportal (LHP) public API",
    publisher: "Hochwasserzentralen der Länder (Datenquelle: www.hochwasserzentralen.de)",
    license: "CC BY 4.0",
    url: "https://www.hochwasserzentralen.de",
    access: "open-data",
  },
  parkRide: {
    id: "parkRide",
    name: "P+R Park & Ride GmbH: P+R and B+R sites, occupancy forecasts",
    publisher: "P+R Park & Ride GmbH München",
    license: DL_BY,
    url: "https://opendata.muenchen.de/organization/p-r-park-ride-gmbh-muenchen",
    access: "open-data",
  },
  stats: {
    id: "stats",
    name: "Statistisches Amt München: Indikatorenatlas and Monatszahlen",
    publisher: "Landeshauptstadt München, Statistisches Amt",
    license: DL_BY,
    url: "https://opendata.muenchen.de/organization/statistisches-amt",
    access: "open-data",
  },
  assemblies: {
    id: "assemblies",
    name: "Bürgerversammlungen: dates and venues",
    publisher: "Landeshauptstadt München, Direktorium",
    license: DL_BY,
    url: "https://opendata.muenchen.de/dataset/termine-buergerversammlungen-muenchen",
    access: "open-data",
  },
  places: {
    id: "places",
    name: "City of Munich open data (facilities and points of interest)",
    publisher: "Landeshauptstadt München (various departments)",
    license: `${DL_BY} unless noted`,
    url: "https://opendata.muenchen.de",
    access: "open-data",
  },
  library: {
    id: "library",
    name: "Münchner Stadtbibliothek catalog (OAI-PMH) and branch list",
    publisher: "Münchner Stadtbibliothek",
    license: "CC0 1.0",
    url: "https://opendata.muenchen.de/dataset/katalogdaten-abfrage-aller-titelsaetze",
    access: "open-data",
  },
  wiki: {
    id: "wiki",
    name: "munichMCP wiki (agent-maintained, cross-linked Markdown knowledge base)",
    publisher: "munichMCP contributors and maintainer agents; every page cites its primary sources",
    license: "CC BY 4.0 (pages); underlying sources keep their own licences",
    url: "https://github.com/pepae/munichMCP/tree/main/wiki",
    access: "open-data",
  },
} satisfies Record<string, SourceInfo>;

export type SourceId = keyof typeof SOURCES;

export interface Citation {
  name: string;
  publisher: string;
  license: string;
  url: string;
  retrieved?: string;
  note?: string;
}

export function cite(id: SourceId, retrieved?: number | string, note?: string): Citation {
  const s: SourceInfo = SOURCES[id];
  return {
    name: s.name,
    publisher: s.publisher,
    license: s.license,
    url: s.url,
    retrieved: retrieved === undefined ? undefined : new Date(retrieved).toISOString(),
    note: note ?? s.notes,
  };
}
