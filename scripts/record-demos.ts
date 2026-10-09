/**
 * Records the README GIFs from the live playground.
 *   npm run demos                       # all scenes against the public server
 *   npm run demos -- noise-flood        # one scene
 * Env: PLAYGROUND_URL (default https://munichmcp.duckdns.org/playground),
 *      CHROME_PATH (a local Chrome or Edge), FFMPEG (default "ffmpeg").
 *
 * Headless Chrome opens the playground (a real MCP Apps host), hides its
 * developer panel, shows the question as a caption, calls the tool and
 * captures the page with the DevTools screencast. ffmpeg turns the frames
 * into a GIF in docs/media/.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Frame, type Page, type Protocol } from "puppeteer-core";

const BASE = process.env.PLAYGROUND_URL ?? "https://munichmcp.duckdns.org/playground";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const OUT_DIR = path.resolve("docs/media");
const W = 900;
const H = 620;

const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => fs.existsSync(p));

/** Stage: hide the developer panel and show a caption above the real view. */
const STAGE_CSS = `
  header, .wrap > .panel, .wrap > div > h2, #out { display: none !important; }
  html, body { background: #f3f1eb !important; }
  .wrap { display: block !important; padding: 0 18px 18px !important; }
  iframe#view { border-radius: 12px !important; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  #demo-cap { padding: 16px 18px 12px; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1d2433; }
  #demo-cap .q { display: inline-block; background: #fff; border: 1px solid #e4e1d8; border-radius: 14px; padding: 9px 14px; min-height: 42px; max-width: 100%; }
  #demo-cap .q:empty::after { content: "\\200b"; }
  #demo-cap .t { margin-top: 7px; font: 12.5px ui-monospace, Menlo, Consolas, monospace; color: #5b6475; min-height: 18px; }
`;

interface Stage {
  page: Page;
  ask(question: string, tool: string, args: Record<string, unknown>, settleMs?: number): Promise<void>;
  view(): Promise<Frame>;
  scrollTo(y: number, ms?: number): Promise<void>;
  wait(ms: number): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function stage(page: Page): Stage {
  return {
    page,
    wait: sleep,
    async view() {
      const el = await page.$("#view");
      const f = await el!.contentFrame();
      if (!f) throw new Error("view frame not found");
      return f;
    },
    async scrollTo(y, ms = 1200) {
      const from = await page.evaluate(() => window.scrollY);
      const steps = Math.max(1, Math.round(ms / 40));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        await page.evaluate((v) => window.scrollTo(0, v), from + (y - from) * e);
        await sleep(40);
      }
    },
    async ask(question, tool, args, settleMs = 3500) {
      await this.scrollTo(0, 500);
      await page.evaluate(() => {
        document.querySelector("#demo-cap .q")!.textContent = "";
        document.querySelector("#demo-cap .t")!.textContent = "";
      });
      for (let i = 1; i <= question.length; i += 2) {
        await page.evaluate((s) => (document.querySelector("#demo-cap .q")!.textContent = s), question.slice(0, i));
        await sleep(28);
      }
      await page.evaluate((s) => (document.querySelector("#demo-cap .q")!.textContent = s), question);
      await sleep(350);
      await page.evaluate((s) => (document.querySelector("#demo-cap .t")!.textContent = s), `→ munichMCP · ${tool}`);
      await page.evaluate(
        ({ tool, args }) => {
          (document.getElementById("tool") as HTMLSelectElement).value = tool;
          (document.getElementById("args") as HTMLTextAreaElement).value = JSON.stringify(args);
          document.getElementById("out")!.textContent = "Calling…";
          document.getElementById("run")!.click();
        },
        { tool, args },
      );
      await page.waitForFunction(() => document.getElementById("out")!.textContent !== "Calling…", { timeout: 60_000 });
      await sleep(settleMs);
    },
  };
}

/** Click an element inside the view whose text contains `text`. */
async function clickText(f: Frame, selector: string, text: string) {
  const ok = await f.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.includes(t));
      el?.click();
      return Boolean(el);
    },
    selector,
    text,
  );
  if (!ok) throw new Error(`no ${selector} with text "${text}" in the view`);
}

const SCENES: Record<string, (s: Stage) => Promise<void>> = {
  "address-report": async (s) => {
    await s.ask("What applies at Wörthstraße 10?", "address_report", { address: "Wörthstraße 10" }, 5000);
    await s.scrollTo(250, 1800);
    await s.wait(3500);
  },
  "noise-flood": async (s) => {
    await s.ask("How loud is it at Landshuter Allee 51, and can it flood?", "noise_and_flood", { address: "Landshuter Allee 51" }, 4500);
    await s.scrollTo(150, 900);
    const f = await s.view();
    await clickText(f, ".leaflet-control-layers-overlays label", "Road noise (Lden)");
    await clickText(f, ".leaflet-control-layers-overlays label", "Road noise (night)");
    await s.wait(2800);
    await s.ask("And down by the Isar at the Flaucher?", "noise_and_flood", { lat: 48.1105, lon: 11.5575 }, 4500);
    await s.scrollTo(150, 900);
    await s.wait(3000);
  },
  "getting-around": async (s) => {
    await s.ask("When does the next U-Bahn leave Sendlinger Tor?", "departures", { station: "Sendlinger Tor", transport_types: ["UBAHN"], limit: 8 }, 3500);
    await s.ask("How do I get from Marienplatz to the airport?", "plan_trip", { from: "Marienplatz", to: "Flughafen München" }, 4500);
    await s.scrollTo(180, 1000);
    await s.wait(2500);
  },
  rent: async (s) => {
    await s.ask("Is €1,540 fair for 70 m² at Wörthstraße 10, built 1965?", "estimate_rent", { address: "Wörthstraße 10", living_area_m2: 70, year_built: 1965, current_rent_eur: 1540 }, 3500);
    const f = await s.view();
    await f.evaluate(() => {
      const label = [...document.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Wohnlage"));
      const sel = label?.querySelector("select");
      if (!sel) throw new Error("Wohnlage select not found");
      sel.value = "zentral_gut";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await s.wait(900);
    await clickText(f, "button", "Recalculate");
    await s.wait(4500);
  },
  civic: async (s) => {
    await s.ask("Where were the Greens strongest in the 2026 council election?", "election_results", { party: "GRÜNE" }, 3000);
    await s.ask("Where does the city's money go?", "city_budget", {}, 3500);
    await s.ask("When is the Bürgerversammlung in Moosach?", "citizens_assemblies", { district: "Moosach" }, 4000);
  },
};

async function record(name: string, scene: (s: Stage) => Promise<void>, browser: Browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.getElementById("status")?.textContent?.startsWith("Connected"), { timeout: 30_000 });
  await page.addStyleTag({ content: STAGE_CSS });
  await page.evaluate(() => {
    const cap = document.createElement("div");
    cap.id = "demo-cap";
    cap.innerHTML = `<div class="q"></div><div class="t"></div>`;
    document.body.prepend(cap);
    const view = document.getElementById("view") as HTMLIFrameElement;
    view.style.height = "120px";
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `demo-${name}-`));
  const frames: { file: string; t: number }[] = [];
  const cdp = await page.createCDPSession();
  cdp.on("Page.screencastFrame", (f: Protocol.Page.ScreencastFrameEvent) => {
    const file = path.join(tmp, `f${String(frames.length).padStart(5, "0")}.png`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "png", maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await sleep(300);
  await scene(stage(page));
  await sleep(500);
  await cdp.send("Page.stopScreencast");
  await page.close();
  if (frames.length < 2) throw new Error(`${name}: no frames captured`);

  // Concat list with each frame shown until the next one; hold the last frame.
  const lines: string[] = [];
  frames.forEach((fr, i) => {
    const next = frames[i + 1]?.t ?? fr.t + 2.5;
    lines.push(`file '${fr.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.04, next - fr.t).toFixed(3)}`);
  });
  lines.push(`file '${frames.at(-1)!.file.replace(/\\/g, "/")}'`);
  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(list, lines.join("\n"));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${name}.gif`);
  execFileSync(FFMPEG, [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", "fps=10,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
    "-loop", "0", out,
  ]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${name}.gif: ${frames.length} frames, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}

if (!CHROME) throw new Error("No Chrome or Edge found; set CHROME_PATH");
const only = process.argv[2];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
try {
  for (const [name, scene] of Object.entries(SCENES)) {
    if (only && name !== only) continue;
    await record(name, scene, browser);
  }
} finally {
  await browser.close();
}
