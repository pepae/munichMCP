import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { add, esc, fmtDistance, h } from "./dom.js";
import type { Host } from "./view.js";

export interface MapView {
  kind: "map";
  title: string;
  subtitle?: string;
  center: { lat: number; lon: number };
  zoom?: number;
  origin?: { lat: number; lon: number; label: string };
  radius_m?: number;
  banner?: { tone: "good" | "bad"; text: string };
  markers?: { lat: number; lon: number; label: string; sublabel?: string; href?: string; color?: string; details?: Record<string, string> }[];
  shapes?: { geometry: any; label?: string; sublabel?: string; color?: string }[];
  cards?: { title: string; lines: string[]; tone?: string; links?: { label: string; href: string }[] }[];
  attribution?: string;
}

const TILE = (dark: boolean) =>
  `https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_${dark ? "grau" : "farbe"}/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png`;

export function renderMap(root: HTMLElement, v: MapView, host: Host) {
  const mapEl = h("div", { class: "map" });
  const list = h("ul", { class: "list" });
  add(
    root,
    h("h1", null, v.title),
    v.subtitle ? h("div", { class: "sub" }, v.subtitle) : null,
    v.banner ? h("div", { class: `banner ${v.banner.tone}` }, v.banner.text) : null,
    v.cards?.length ? renderCards(v.cards, host) : null,
    mapEl,
    list,
    h("div", { class: "attr" }, `Map: © GeoBasis-DE / BKG (${new Date().getFullYear()}) CC BY 4.0. Data: ${v.attribution ?? "Landeshauptstadt München"}. Unofficial munichMCP.`),
  );

  const map = L.map(mapEl, { zoomControl: true, attributionControl: false, scrollWheelZoom: false }).setView([v.center.lat, v.center.lon], v.zoom ?? 15);
  L.tileLayer(TILE(host.dark), { maxZoom: 19, maxNativeZoom: 18, minZoom: 10 }).addTo(map);
  const bounds = L.latLngBounds([[v.center.lat, v.center.lon], [v.center.lat, v.center.lon]]);

  if (v.radius_m) L.circle([v.center.lat, v.center.lon], { radius: v.radius_m, color: "#0b5cad", weight: 1, fillOpacity: 0.04 }).addTo(map);

  for (const s of v.shapes ?? []) {
    try {
      const layer = L.geoJSON(s.geometry, { style: { color: s.color ?? "#d9480f", weight: 2, fillOpacity: 0.25 } }).addTo(map);
      if (s.label) layer.bindPopup(`<strong>${esc(s.label)}</strong>${s.sublabel ? `<br>${esc(s.sublabel)}` : ""}`);
      bounds.extend(layer.getBounds());
    } catch {
      /* ignore malformed geometry */
    }
  }

  const markerRefs: L.CircleMarker[] = [];
  (v.markers ?? []).forEach((m, i) => {
    const mk = L.circleMarker([m.lat, m.lon], { radius: 7, color: "#fff", weight: 2, fillColor: m.color ?? "#2b8a3e", fillOpacity: 0.95 }).addTo(map);
    const det = m.details ? Object.entries(m.details).slice(0, 6).map(([k, val]) => `${esc(k.replace(/_/g, " "))}: ${esc(String(val))}`).join("<br>") : "";
    mk.bindPopup(`<strong>${esc(m.label)}</strong>${m.sublabel ? `<br>${esc(m.sublabel)}` : ""}${det ? `<br>${det}` : ""}`);
    markerRefs.push(mk);
    bounds.extend([m.lat, m.lon]);
    list.append(
      h(
        "li",
        {
          onclick: () => {
            map.setView([m.lat, m.lon], Math.max(map.getZoom(), 16));
            mk.openPopup();
          },
        },
        h("div", { class: "n" }, `${i + 1}. ${m.label}`),
        m.sublabel ? h("div", { class: "d" }, m.sublabel) : null,
        m.href ? h("a", { onclick: (e: Event) => { e.stopPropagation(); host.openLink(m.href!); } }, "Details") : null,
      ),
    );
  });

  if (v.origin) {
    L.circleMarker([v.origin.lat, v.origin.lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#c92a2a", fillOpacity: 1 })
      .addTo(map)
      .bindPopup(`<strong>${esc(v.origin.label)}</strong>`);
  }
  if ((v.markers?.length ?? 0) + (v.shapes?.length ?? 0) > 0) map.fitBounds(bounds.pad(0.15), { maxZoom: v.zoom ?? 17 });
  // Leaflet needs a size recalculation once the iframe has laid out.
  setTimeout(() => map.invalidateSize(), 50);
  setTimeout(() => map.invalidateSize(), 400);
}

function renderCards(cards: NonNullable<MapView["cards"]>, host: Host) {
  return h(
    "div",
    { class: "cards" },
    cards.map((c) =>
      h(
        "div",
        { class: `card ${c.tone ?? ""}` },
        h("div", { class: "t" }, c.title),
        c.lines.filter(Boolean).map((l) => h("div", { class: "v" }, l)),
        (c.links ?? []).map((l) => h("div", null, h("a", { onclick: () => host.openLink(l.href) }, l.label))),
      ),
    ),
  );
}

export { fmtDistance };
