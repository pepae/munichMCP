/**
 * Regenerate wiki/index.md for the seed wiki in the repo and print lint results.
 *   npx tsx scripts/build-wiki-index.ts [wikiDir=wiki]
 */
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { WikiStore } from "../src/sources/wiki.js";

const dir = path.resolve(process.argv[2] ?? "wiki");
const store = new WikiStore(dir);
await store.load();
const fm = { title: "Index", type: "meta", summary: "Catalog of every page in the wiki, grouped by type.", updated: new Date().toISOString().slice(0, 10), updated_by: "build-wiki-index" };
await fs.writeFile(path.join(dir, "index.md"), `---\n${YAML.stringify(fm).trim()}\n---\n\n${store.renderIndex()}`, "utf8");
await store.load();
const lint = await store.lint();
console.log(`index.md: ${lint.pages} pages`);
console.log(`broken links: ${lint.broken_links.map((b) => `${b.page} -> ${b.link}`).join(", ") || "none"}`);
console.log(`orphans: ${lint.orphans.join(", ") || "none"}`);
console.log(`unsourced: ${lint.unsourced.join(", ") || "none"}`);
console.log(`missing from index: ${lint.missing_from_index.join(", ") || "none"}`);
process.exit(lint.broken_links.length ? 1 : 0);
