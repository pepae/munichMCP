import { liveCache } from "../lib/cache.js";
import { containsPoint, type LonLat } from "../lib/geo.js";
import { urlExists } from "../lib/http.js";
import { cite, type Citation } from "../lib/sources.js";
import { featureInfo, getLayer } from "../lib/wfs.js";

/**
 * Address intelligence: point-in-polygon lookups across the City of Munich's
 * planning and administrative layers. This is the kind of question web search
 * cannot answer ("which zoning plan / Milieuschutz area / parking zone is this
 * address in?").
 */

export const ADDRESS_LAYERS = {
  district: "gsm_wfs:vablock_stadtbezirk",
  districtPart: "gsm_wfs:vablock_bezirksteil",
  quarter: "gsm_wfs:vablock_viertel",
  residentParking: "mor_wfs:ruhver_prm_gebiete_poly",
  lowEmissionZone: "mor_wfs:miv_umweltzone_poly",
  tempo30: "mor_wfs:rad_rsp_tempo30zone_poly",
  pedestrianZone: "mor_wfs:rad_rsp_fussg_zone",
  chimneySweep: "rku_wfs:kehrbezirke",
  // Open-data outline layer (dl-de/by-2.0). The richer WMS layer with PDF links
  // requires a separate agreement with the city, so PDF links are built from the
  // plan numbers and checked instead.
  zoningPlans: "gsm_wfs:vagrund_baug_umgriff_opendata",
} as const;

export interface AddressFacts {
  district?: { number: string; name: string; district_part?: string; quarter?: string };
  zoning_plans: { plan_number: string; kind: string; note: string; plan_pdf?: string; text_pdf?: string }[];
  milieuschutz?: { area: string; valid_from?: string; map_pdf?: string; statute_pdf?: string; justification_pdf?: string };
  resident_parking?: { area: string; status?: string; measure?: string; opened?: string; enforcement?: string; details_url?: string };
  low_emission_zone?: { inside: boolean; name?: string };
  traffic_calming?: { kind: string; status?: string };
  pedestrian_zone: boolean;
  chimney_sweep_district?: string;
  solar_potential?: { roof_kwp: number; yield_kwh_per_year: number; co2_saving_kg_per_year?: number; modules?: number; monument_protection?: string; more_info?: string }[];
  errors: string[];
  citations: Citation[];
}

const PLAN_PDF = (kind: "p" | "t", va: string, nr: string) => `https://www.muenchen.info/plan/bebauungsplan/${kind}_${va}_${nr}.pdf`;

/** The city publishes plan drawing (p_) and text (t_) PDFs for legally binding plans; check they exist. */
async function planPdfs(va: string, nr: string): Promise<{ plan_pdf?: string; text_pdf?: string }> {
  const { value } = await liveCache.get(`bplan-pdf:${va}:${nr}`, 7 * 86_400_000, async () => {
    const [p, t] = await Promise.all([urlExists(PLAN_PDF("p", va, nr)), urlExists(PLAN_PDF("t", va, nr))]);
    return { plan_pdf: p ? PLAN_PDF("p", va, nr) : undefined, text_pdf: t ? PLAN_PDF("t", va, nr) : undefined };
  });
  return value;
}

async function safe<T>(label: string, errors: string[], fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

export async function addressFacts(at: LonLat): Promise<AddressFacts> {
  const errors: string[] = [];
  const within = async (typeName: string) => {
    const layer = await getLayer(typeName);
    return layer.features.filter((f) => containsPoint(f, at));
  };

  const [district, part, quarter, prm, lez, t30, fz, kehr, plans, erhalt, solar] = await Promise.all([
    safe("district", errors, () => within(ADDRESS_LAYERS.district)),
    safe("district part", errors, () => within(ADDRESS_LAYERS.districtPart)),
    safe("quarter", errors, () => within(ADDRESS_LAYERS.quarter)),
    safe("resident parking", errors, () => within(ADDRESS_LAYERS.residentParking)),
    safe("low emission zone", errors, () => within(ADDRESS_LAYERS.lowEmissionZone)),
    safe("tempo 30", errors, () => within(ADDRESS_LAYERS.tempo30)),
    safe("pedestrian zone", errors, () => within(ADDRESS_LAYERS.pedestrianZone)),
    safe("chimney sweep", errors, () => within(ADDRESS_LAYERS.chimneySweep)),
    safe("zoning plans", errors, () => within(ADDRESS_LAYERS.zoningPlans)),
    safe("Erhaltungssatzung", errors, () => featureInfo("plan:satz_erhalt_poly", at.lon, at.lat)),
    safe("solar potential", errors, () => featureInfo("rku:solar_gebaeudepotenzial_pv", at.lon, at.lat)),
  ]);

  const d = district?.[0]?.properties;
  const facts: AddressFacts = {
    district: d
      ? {
          number: String(d.sb_nummer),
          name: String(d.sb_name),
          district_part: part?.[0]?.properties.bt_nummer,
          quarter: quarter?.[0]?.properties.vi_nummer,
        }
      : undefined,
    zoning_plans: await Promise.all(
      (plans ?? []).map(async (f) => {
        const nr = String(f.properties.nr_plan ?? "?");
        const va = String(f.properties.nr_va ?? "");
        const pdfs = va ? await planPdfs(va, nr).catch(() => ({}) as { plan_pdf?: string; text_pdf?: string }) : {};
        return {
          plan_number: nr,
          kind: pdfs.plan_pdf ? "Bebauungsplan" : "Planning area without a published plan",
          note: pdfs.plan_pdf
            ? "Legally binding zoning plan; the plan and text PDFs are authoritative."
            : "Bebauungsplan in preparation, Außenbereichssatzung or Umlegungsgebiet; the city publishes no plan PDF for it.",
          ...pdfs,
        };
      }),
    ),
    milieuschutz: erhalt?.[0]
      ? {
          area: String(erhalt[0].gebietname),
          valid_from: erhalt[0].gueltig_ab ?? undefined,
          map_pdf: erhalt[0].p_url ?? undefined,
          statute_pdf: erhalt[0].t_url ?? undefined,
          justification_pdf: erhalt[0].d_url ?? undefined,
        }
      : undefined,
    resident_parking: prm?.[0]
      ? {
          area: String(prm[0].properties.name),
          status: prm[0].properties.status,
          measure: prm[0].properties.massnahme,
          opened: prm[0].properties.eroeffnung,
          enforcement: prm[0].properties.ueberwachung,
          details_url: prm[0].properties.einzeluebersicht_link,
        }
      : undefined,
    low_emission_zone: lez ? { inside: lez.length > 0, name: lez[0]?.properties.bezeichnung } : undefined,
    traffic_calming: t30?.[0] ? { kind: String(t30[0].properties.typ || "Tempo-30-Zone / verkehrsberuhigter Bereich").trim() || "Tempo-30-Zone", status: t30[0].properties.status_bedeutung } : undefined,
    pedestrian_zone: (fz ?? []).length > 0,
    chimney_sweep_district: kehr?.[0]?.properties.kehr_nr,
    solar_potential: (solar ?? [])
      .filter((s) => typeof s.p_peak === "number")
      .slice(0, 3)
      .map((s) => ({
        roof_kwp: Math.round(s.p_peak * 10) / 10,
        yield_kwh_per_year: Math.round(Number(s.e_ac)),
        co2_saving_kg_per_year: s.co2_red ? Math.round(Number(s.co2_red)) : undefined,
        modules: s.n_modles ? Number(s.n_modles) : undefined,
        monument_protection: s.denkmal_te && s.denkmal_te !== "-" ? s.denkmal_te : undefined,
        more_info: s.link ?? undefined,
      })),
    errors,
    citations: [cite("geoportal", Date.now())],
  };
  return facts;
}
