import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addIssue,
  addRecord,
  communityGeoJson,
  communityStats,
  getCollection,
  listContributions,
  personalDataHint,
  publicView,
  publishedRecords,
  resetContributions,
  reviewContribution,
} from "../src/community/contributions.js";
import { config } from "../src/config.js";

const MARIENPLATZ = { lat: 48.13725, lon: 11.57549 };
let tmp: string;
let saved: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "munichmcp-community-"));
  saved = config.dataDir;
  config.dataDir = tmp;
  resetContributions();
});

afterAll(async () => {
  config.dataDir = saved;
  resetContributions();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("community contributions", () => {
  it("detects personal data", () => {
    expect(personalDataHint("Ruf mich an: 0176 1234 5678")).toBe("a phone number");
    expect(personalDataHint("max@example.org")).toBe("an e-mail address");
    expect(personalDataHint("Bordstein an der Kreuzung Lindwurmstraße 50, 80337 München")).toBeUndefined();
  });

  it("stores a record as pending and keeps its text private until published", async () => {
    const r = await addRecord({ collection: "barriers", title: "Kerb without drop", description: "No kerb drop at the crossing, wheelchairs cannot cross.", ...MARIENPLATZ });
    expect(r.outcome).toBe("stored");
    if (r.outcome !== "stored") return;
    expect(r.contribution.status).toBe("pending");
    expect(r.contribution.checks).toContain("place is in Munich");
    expect(publicView(r.contribution)).not.toHaveProperty("description");
    expect(await publishedRecords()).toHaveLength(0);
  });

  it("counts the same thing nearby as a confirmation", async () => {
    const r = await addRecord({ collection: "barriers", title: "Missing kerb drop", description: "Same crossing, still no kerb drop for wheelchairs.", lat: MARIENPLATZ.lat + 0.0001, lon: MARIENPLATZ.lon });
    expect(r.outcome).toBe("confirmed");
    if (r.outcome === "confirmed") expect(r.contribution.confirmations).toBe(1);
    expect(await listContributions({ kind: "record" })).toHaveLength(1);
  });

  it("rejects personal data, places outside Munich and missing required places", async () => {
    await expect(addRecord({ collection: "ideas", title: "Bench please", description: "Write to me at max@example.org" })).rejects.toThrow(/personal data/);
    await expect(addRecord({ collection: "ideas", title: "Bench please", description: "A bench at the bus stop.", lat: 48.37, lon: 10.9 })).rejects.toThrow(/outside/);
    await expect(addRecord({ collection: "barriers", title: "Steps only", description: "Entrance only via steps." })).rejects.toThrow(/needs a place/);
  });

  it("hands over to the official channel instead of storing defects", async () => {
    const r = await addRecord({ collection: "defects", title: "Pothole", description: "Deep pothole in the cycle lane.", ...MARIENPLATZ });
    expect(r.outcome).toBe("official_channel");
    expect((await listContributions()).filter((c) => c.collection === "defects")).toHaveLength(0);
  });

  it("opens a new collection when a maintainer publishes its first record", async () => {
    const r = await addRecord({ collection: "shade-spots", title: "Shady bench", description: "Bench under old trees, cool in summer.", ...MARIENPLATZ, properties: { seats: 4 } });
    expect(r.outcome).toBe("stored");
    if (r.outcome !== "stored") return;
    expect(r.contribution.new_collection).toBe(true);
    await expect(reviewContribution(r.contribution.id, { status: "resolved" })).rejects.toThrow(/can be set to/);
    const pub = await reviewContribution(r.contribution.id, { status: "published", collection_label: "Shady places", note: "Thanks" });
    expect(pub.new_collection).toBeUndefined();
    expect((await getCollection("shade-spots"))?.label).toBe("Shady places");
    const near = await publishedRecords({ near: MARIENPLATZ, radiusM: 100 });
    expect(near.map((c) => c.id)).toEqual([pub.id]);
    const geo = await communityGeoJson();
    expect(geo.features[0].properties).toMatchObject({ id: pub.id, seats: 4 });
  });

  it("records data issues against catalog sources and tracks them", async () => {
    await expect(addIssue({ source_id: "no-such-source", issue_type: "wrong", title: "Wrong", description: "Something is wrong here." })).rejects.toThrow(/Unknown source/);
    const { contribution } = await addIssue({ tool: "find_nearby", issue_type: "outdated", title: "Fountain removed", description: "The fountain at the square was removed in spring." });
    const again = await addIssue({ tool: "find_nearby", issue_type: "outdated", title: "Fountain was removed", description: "It is gone." });
    expect(again.confirmed).toBe(true);
    expect((await communityStats()).issues_open).toBe(1);
    await reviewContribution(contribution.id, { status: "forwarded", note: "Sent to the publisher" });
    expect((await communityStats()).issues_open).toBe(0);
  });
});
