import { containsPoint, distanceToFeature, representativePoint, roundGeometry, type GeoFeature, type LonLat } from "../lib/geo.js";
import { cite, type Citation } from "../lib/sources.js";
import { getLayer } from "../lib/wfs.js";

/**
 * Official micromobility rules from the Mobilitätsreferat's geodata:
 * where e-scooters / bike sharing / mopeds / cargo bikes may (not) be parked
 * or ridden, plus designated parking areas nearby.
 */

const L = {
  scooterNoRide: "mor_wfs:ruhver_mim_fahrverbot_ts",
  scooterNoPark: "mor_wfs:ruhver_mim_abstellverbot_ts",
  // "Digital no-parking zones" of ~100 m around each shared parking area: inside
  // them a rental can only be ended on the parking area itself.
  scooterGeofence: "mor_wfs:ruhver_mim_geofences_poly",
  scooterParking: "mor_wfs:ruhver_mim_abstellfl_ts",
  bikeshareNoPark: "mor_wfs:ruhver_mim_abstellverbot_bs",
  bikeshareParking: "mor_wfs:ruhver_mim_abstellfl_bs",
  mopedParking: "mor_wfs:ruhver_mim_abstellfl_ms",
  cargoParking: "mor_wfs:ruhver_mim_abstellfl_ls",
  pedestrianZone: "mor_wfs:rad_rsp_fussg_zone",
} as const;

export const MOBILITY_LAYERS = Object.values(L);

type Vehicle = "escooter" | "bikesharing" | "moped" | "cargobike";

interface ZoneHit {
  id: string | number | undefined;
  name?: string;
  valid_from?: string;
  valid_until?: string;
  event?: string;
  applies_to: string[];
}

interface ParkingSpot {
  name: string;
  description?: string;
  distance_m: number;
  lat: number;
  lon: number;
  allowed: string[];
  /** View-only geometry, stripped before results reach the model. */
  _geometry?: GeoFeature["geometry"];
}

const flags = (p: Record<string, any>) =>
  [
    p.tretrollersharing === "Ja" && "e-scooter",
    p.bikesharing === "Ja" && "bike sharing",
    p.motorrollersharing === "Ja" && "e-moped sharing",
    p.lastenradsharing === "Ja" && "cargo bike sharing",
  ].filter(Boolean) as string[];

function activeNow(p: Record<string, any>, now = new Date()): boolean {
  const parse = (s?: string | null) => {
    const m = s ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s) : null;
    return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) : undefined;
  };
  const from = parse(p.gueltigkeit_datum_start);
  const until = parse(p.gueltigkeit_datum_ende);
  if (from && now < from) return false;
  if (until && now > new Date(until.getTime() + 86_400_000)) return false;
  return p.status === undefined || String(p.status) === "2";
}

function zoneHits(features: GeoFeature[], at: LonLat): ZoneHit[] {
  return features
    .filter((f) => containsPoint(f, at) && activeNow(f.properties))
    .map((f) => ({
      id: f.properties.mim_avz_id ?? f.properties.mim_fvz_id ?? f.id,
      name: f.properties.standort_name ?? undefined,
      valid_from: f.properties.gueltigkeit_datum_start ?? undefined,
      valid_until: f.properties.gueltigkeit_datum_ende ?? undefined,
      event: f.properties.veranstaltung_name ?? undefined,
      applies_to: flags(f.properties),
    }));
}

function nearestSpots(features: GeoFeature[], at: LonLat, n = 3, radiusM = 600): ParkingSpot[] {
  const degPad = radiusM / 70_000;
  return features
    .filter((f) => f.bbox && at.lon >= f.bbox[0] - degPad && at.lon <= f.bbox[2] + degPad && at.lat >= f.bbox[1] - degPad && at.lat <= f.bbox[3] + degPad)
    .filter((f) => activeNow(f.properties))
    .map((f) => ({ f, d: distanceToFeature(f, at) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(({ f, d }) => {
      const c = representativePoint(f)!;
      return {
        name: f.properties.standort_name ?? "Abstellfläche",
        description: f.properties.standort_beschreibung ?? undefined,
        distance_m: Math.round(d),
        lat: c.lat,
        lon: c.lon,
        allowed: flags(f.properties),
        _geometry: roundGeometry(f.geometry),
      };
    });
}

export interface MobilityRules {
  location: LonLat;
  escooter: {
    riding_prohibited: ZoneHit[];
    parking_prohibited: ZoneHit[];
    /** Within ~100 m of a shared parking area: rentals can only end on the area. */
    must_use_designated_area: boolean;
    on_designated_area: boolean;
    verdict: string;
    nearest_parking: ParkingSpot[];
  };
  bikesharing: { parking_prohibited: ZoneHit[]; verdict: string; nearest_parking: ParkingSpot[] };
  moped: { nearest_parking: ParkingSpot[] };
  cargobike: { nearest_parking: ParkingSpot[] };
  pedestrian_zone: boolean;
  citation: Citation;
}

export async function mobilityRulesAt(at: LonLat): Promise<MobilityRules> {
  const [noRide, noParkTs, geofence, parkTs, noParkBs, parkBs, parkMs, parkLs, fz] = await Promise.all(
    [L.scooterNoRide, L.scooterNoPark, L.scooterGeofence, L.scooterParking, L.bikeshareNoPark, L.bikeshareParking, L.mopedParking, L.cargoParking, L.pedestrianZone].map((t) => getLayer(t)),
  );
  const rideBan = zoneHits(noRide.features, at).filter((z) => z.applies_to.includes("e-scooter") || z.applies_to.length === 0);
  const parkBanTs = zoneHits(noParkTs.features, at).filter((z) => z.applies_to.includes("e-scooter"));
  const parkBanBs = [...zoneHits(noParkBs.features, at), ...zoneHits(noParkTs.features, at).filter((z) => z.applies_to.includes("bike sharing"))];
  const onArea = parkTs.features.some((f) => containsPoint(f, at) && activeNow(f.properties));
  const inGeofence = !onArea && zoneHits(geofence.features, at).length > 0;
  const inPedZone = fz.features.some((f) => containsPoint(f, at));
  const nearestTs = nearestSpots(parkTs.features, at);
  const nearestBs = nearestSpots(parkBs.features, at);

  const verdict = (v: Vehicle, bans: ZoneHit[], rideBans: ZoneHit[] = []) => {
    if (rideBans.length) return `No: this spot is inside an e-scooter no-riding zone (Fahrverbotszone)${rideBans[0].event ? ` (${rideBans[0].event})` : ""}. Riding and parking shared e-scooters is not allowed here.`;
    if (bans.length) return `No: parking shared ${v === "escooter" ? "e-scooters" : "bikes"} is prohibited here (Abstellverbotszone${bans[0].event ? `: ${bans[0].event}` : ""}); the app will not let you end the rental. Use a designated parking area.`;
    if (v === "escooter" && onArea) return "Yes: this spot is on a designated shared parking area (Abstellfläche) for e-scooters.";
    if (v === "escooter" && inGeofence)
      return `Not here: this spot is within ~100 m of a designated shared parking area, where the city's geofence only lets you end an e-scooter rental on the area itself${nearestTs[0] ? ` (nearest: ${nearestTs[0].name}, ${nearestTs[0].distance_m} m)` : ""}.`;
    return `Not in a no-parking zone. Park considerately (not blocking footpaths, entrances or bike lanes); designated areas are preferred.`;
  };

  return {
    location: at,
    escooter: {
      riding_prohibited: rideBan,
      parking_prohibited: parkBanTs,
      must_use_designated_area: inGeofence,
      on_designated_area: onArea,
      verdict: verdict("escooter", parkBanTs, rideBan),
      nearest_parking: nearestTs,
    },
    bikesharing: { parking_prohibited: parkBanBs, verdict: verdict("bikesharing", parkBanBs), nearest_parking: nearestBs },
    moped: { nearest_parking: nearestSpots(parkMs.features, at) },
    cargobike: { nearest_parking: nearestSpots(parkLs.features, at) },
    pedestrian_zone: inPedZone,
    citation: cite("mobility", Math.min(noRide.fetchedAt, noParkTs.fetchedAt, parkTs.fetchedAt)),
  };
}
