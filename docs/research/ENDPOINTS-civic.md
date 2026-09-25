# munichMCP: civic and administrative data endpoints (verified inventory)

Tested on 2026-09-25, roughly 13:25 to 14:10 UTC, with curl 8.12 and a descriptive User-Agent
(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) munichMCP-research/0.1`).
Rules followed: only GET (and a few HEAD) requests, a handful per endpoint, no accounts, no API keys,
no form submissions.

Status legend:

- **VERIFIED**: a real request returned the documented data.
- **PARTIAL**: parts verified, other parts not (explained inline).
- **NOT WORKING**: tested and failed, or no stateless GET endpoint exists (attempts listed).
- **NOT VERIFIED**: documented from page HTML/JS or third-party source code only, not executed (reason given).

License identifiers are given exactly as they appear in API metadata. Terms-of-use prose is
paraphrased with a link to the source page (verbatim quoting is kept to a minimum on purpose).
Sample responses are real but truncated (`...`), and personal names in samples are elided as `[...]`.

## Overview

| # | Source | Main endpoint(s) | Status | Auth | License / terms | Suggested TTL |
|---|---|---|---|---|---|---|
| 1 | RIS (risi.muenchen.de) | `/risi/rss?feed=...`, `/risi/sitzung/ical/gremium/{id}`, `/risi/dokument/v/{id}`, `/risi/suche?...` | VERIFIED | none | no open license; muenchen.de imprint terms; robots.txt blocks AI crawlers | feeds 15-30 min |
| 2 | München Transparent OParl | `/oparl/v1.0/body/{n}/list/paper` (and meeting, organization, person) | VERIFIED (website full-text search broken) | none | no license stated (mirror of RIS) | lists 1 h |
| 3 | PVOG Suchdienst | `https://pvog.fitko.net/suchdienst/api/v7/servicedescriptions/{ars}` | VERIFIED | none | API spec: CC BY-SA 4.0 | 24 h |
| 4 | Hugging Face it@M datasets | parquet via `/resolve/main/...` | VERIFIED | none | MIT | 7 d |
| 5 | AWM Abfuhrkalender | TYPO3 POST form, then ICS link | NOT VERIFIED (POST required) | none (session + signed form fields) | AWM site terms | 7 d per address |
| 6 | SWM pool/sauna occupancy | `https://www.swm.de/.rest/bath/visitorCount`, `https://counter.ticos-systems.cloud/api/gates/counter` | VERIFIED | none | SWM imprint: no reuse without written consent | 60-120 s |
| 7 | machmuenchenbesser.de | `https://machmuenchenbesser.de/api/georeport/v2/requests.json` | VERIFIED | none (read) | CC0-1.0 (open data portal) | 5 min |
| 8 | Münchner Stadtbibliothek | OAI-PMH `https://data-bib.muenchen.de/oai-pmh` | VERIFIED (OAI); OPAC NOT WORKING | none | CC0-1.0 (portal), keep OAI identifier | harvest daily |
| 9 | News collector | RU RSS, muenchen.de `rss.xml`, MVG JSON, CKAN search + Atom | VERIFIED (some feeds do not exist) | none | see section 9 | 2-30 min |
| 10 | Kitas / Schulen | CKAN CSV | VERIFIED | none | dl-by-de/2.0 | 7-30 d |
| 11 | Statistik (Indikatorenatlas, Monatszahlen) | CKAN CSV + datastore | VERIFIED | none | dl-by-de/2.0 | 7 d |

General advice for the MCP server: send a descriptive User-Agent with contact info, cache aggressively,
serialize requests per host (1 request/second or slower), and prefer user-initiated fetches over bulk crawling.

---

## 1. Munich city council information system (RIS), risi.muenchen.de

Status: **VERIFIED** (RSS, iCal, detail pages, PDFs, GET search). No JSON API exists; RSS and iCal are
the only structured formats, everything else is HTML (Apache Wicket app).

### 1.1 RSS feeds

URL template: `https://risi.muenchen.de/risi/rss?feed={name}[&{param}={id}]`

- Response: `application/rss+xml;charset=UTF-8`, RSS 2.0, no auth, no session needed.
- Unknown feed names return HTTP 404 (HTML). Tested negatives: `feed=DoesNotExist`, `feed=Sitzungsvorlagen`,
  `feed=StR-Sitzungsvorlagen` (all 404).
- Feed names were discovered from the "RSS" links on overview and detail pages (help entry
  `/risi/service/hilfe/detail/9` lists which object types offer RSS) and each was fetched once.

| feed | extra param | page carrying the link | items on 2026-09-25 | guid prefix | content |
|---|---|---|---|---|---|
| `StR-Antraege` | none | `/risi/antrag/str/uebersicht` | 29 (14.09. to 25.09.2026) | `StrAntraegeRSS` | StR-Anträge and StR-Anfragen (Typ: Antrag, Anfrage, Änderungsantrag) |
| `BA-Antraege` | none | `/risi/antrag/ba/baantraguebersicht` | 75 | `BAAntraegeRSS` | BA-Anträge, with Bezirksausschuss |
| `BV-Empfehlungen` | none | `/risi/antrag/ba/bvempfehlunguebersicht` | 696 (15.10.2025 to 28.07.2026, not strictly date-sorted) | `BVEmpfehlungenRSS` | Bürgerversammlung recommendations, with Stadtbezirk |
| `BV-Anfragen` | none | `/risi/antrag/ba/bvanfrageuebersicht` | 192 | `BVAnfragenRSS` | Bürgerversammlung questions |
| `StR-Sitzungen` | none | `/risi/sitzung/uebersicht`, `/risi/sitzung/kalender` | 21 (upcoming, 29.09. to 08.10.2026) | `StrSitzungenRSS` | upcoming council/committee sessions (pubDate = session start) |
| `BA-Sitzungen` | none | same | 11 (upcoming) | `BASitzungenRSS` | upcoming BA sessions |
| `ReferatSitzungsvorlagen` | `referatid` | `/risi/organisationseinheit/detail/{id}` | 1-2 per Referat | `StrReferatSitzungsvorlagenRSS` | newest Sitzungsvorlagen of one department |
| `StR-GremiumSitzungen` | `gremiumid` | `/risi/gremium/detail/{id}` | 15 (gremiumid=1) | `StrGremiumSitzungenRSS` | sessions of one committee |
| `StR-GremiumMitglieder` | `gremiumid` | same | 0 | none | only membership entries/exits |
| `StR-FraktionAntraege` | `gremiumid` (fraction) | `/risi/gremium/detail/31` | 6 | `StrFraktionStrAntraegeRSS` | motions of one fraction |
| `StR-MitgliedAntraege` | `personid` | `/risi/person/detail/{id}` | 6 | `StrMitgliedStrAntraegeRSS` | motions of one council member |
| `StR-Sitzungsdetails` | `sitzungid` | `/risi/sitzung/detail/{id}` (StR) | 4 | `StrSitzungRSS` | changes of one session and its agenda items |
| `BA-Sitzungsdetails` | `sitzungid` | `/risi/sitzung/detail/{id}` (BA) | 86 | `BASitzungRSS` | changes of one BA session and its agenda items |
| `BA-AusschussAntraege` | `gremiumid` (BA) | `/risi/gremium/detail/224` | 14 | `BAAusschussAntraegeRSS` | BA-Anträge, BV-Empfehlungen, BV-Anfragen of one BA |
| `BA-GremiumMitglieder` | `gremiumid` | same | 0 | none | membership changes |

There is **no global feed for Sitzungsvorlagen or Beschlüsse**. For Sitzungsvorlagen poll the 15
`ReferatSitzungsvorlagen` feeds or use the search (1.4, `objekt=2`). Decisions appear as `Beschluss.pdf`
on agenda pages and on `/risi/sitzung/top/{topid}/entscheidung` (1.3); session feeds (`*-Sitzungsdetails`)
announce agenda changes.

Verified ids:

- Referat ids (from `/risi/organisationseinheit/fachreferat/uebersicht`): 1 Direktorium, 2 Baureferat,
  3 Kommunalreferat, 4 Kreisverwaltungsreferat, 5 Kulturreferat, 6 Personal- und Organisationsreferat,
  7 Referat für Arbeit und Wirtschaft, 9 Referat für Stadtplanung und Bauordnung, 11 Sozialreferat,
  12 Stadtkämmerei, 2164191 Referat für Bildung und Sport, 4769009 IT-Referat, 6414098 Mobilitätsreferat,
  6440375 Gesundheitsreferat, 6440377 Referat für Klima- und Umweltschutz.
- Gremium ids: 1 = Vollversammlung, 31 = SPD-Stadtratsfraktion, 224 = BA 15 Trudering-Riem
  (list pages: `/risi/gremium/strausschuss/uebersicht`, `/risi/gremium/strfraktion/uebersicht`,
  `/risi/gremium/bezirksausschuss/uebersicht`).

Sample (`feed=StR-Antraege`, one item, truncated):

```xml
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0"><channel>
<title>StR-Anträge / Anfragen</title>
<item>
  <title>StR-Antrag Nr. 26-32 / F 00084 vom 25.09.2026</title>
  <link>https://risi.muenchen.de/risi/antrag/detail/10021308</link>
  <description>&lt;strong&gt;StR-Antrag Nr. 26-32 / F 00084 vom 25.09.2026&lt;/strong&gt;...
    &lt;strong&gt;Betreff:&lt;/strong&gt;&lt;br&gt;Baustellenchaos durch Starkregen&lt;br&gt;&lt;br&gt;
    &lt;strong&gt;Typ:&lt;/strong&gt; Anfrage&lt;br&gt;&lt;strong&gt;Gestellt von:&lt;/strong&gt; [...]&lt;br&gt;
    &lt;strong&gt;Vorgangs-Link:&lt;/strong&gt; &lt;a ... href="https://risi.muenchen.de/risi/antrag/detail/10021308"&gt;...</description>
  <pubDate>Fri, 25 Sep 2026 09:26:34 +0200</pubDate>
  <guid isPermaLink="false">StrAntraegeRSS;10021308</guid>
</item>
```

Other description variants (all HTML-escaped, label/value pairs separated by `<br>`):

- BA feeds: `Betreff`, `Bezirksausschuss: 15 - Trudering-Riem`.
- BV feeds: `Betreff`, `Stadtbezirk: 23 - Allach-Untermenzing`.
- Session feeds: `Sitzungsort`, `Sitzungs-Link`; title like `StR-Sitzung Kulturausschuss am Donnerstag, 8. Oktober 2026, 14:00 Uhr`.
- `ReferatSitzungsvorlagen`: title `Sitzungsvorlage 26-32 / V 01055 vom 17.09.2026 - {Betreff, cut at ~60 chars}`,
  description with `Typ: Bekanntgabe`, `Zuständiges Referat`, link `/risi/sitzungsvorlage/detail/{id}`.
- `*-Sitzungsdetails`: first item is the session, following items are agenda items with
  link `.../sitzung/detail/{sitzungid}/tagesordnung/oeffentlich?topid={topid}` and title suffix `- Öff. TOP-Nr. 11.`.

Field meaning:

- `title`: `{Kind} Nr. {Wahlperiode} / {Letter} {Number} vom {dd.mm.yyyy}`. Letters seen: A = StR-Antrag,
  F = StR-Anfrage, B = BA-Antrag, E = BV-Empfehlung, Q = BV-Anfrage, V = Sitzungsvorlage, T = TOP mit Vorgang.
- `link`: stable detail URL with the numeric RIS object id (same ids as in München Transparent, section 2).
- `pubDate`: registration or change time; in session feeds it is the (future) session start.
- `guid`: `{Prefix};{objectId}`; in `*-Sitzungsdetails` it is `{Prefix};{objectId}:{n}` where `n` looks like a
  change counter (treat the guid as opaque, dedupe on it).
- HTTP headers: feeds are sent with `Cache-Control: max-age=31536000` and an `Expires` one year ahead.
  Ignore this and use your own TTL.

TTL: global feeds 15-30 min; per-object feeds 1 h.

### 1.2 iCal session calendar

URL template: `GET https://risi.muenchen.de/risi/sitzung/ical/gremium/{gremiumid}` (0 = all committees)

- VERIFIED: `gremium/0` returned `text/calendar`, 449 KB, exactly 1000 VEVENTs (DTSTART 2026-01-07 to
  2027-12-21; 1000 may be a server cap). `gremium/1` (Vollversammlung) returned 24 events.
- Pitfall: the link on `/risi/sitzung/kalender` is relative (`./ical/gremium/0`) and resolves to
  `/risi/sitzung/ical/...`. The URL `/risi/sitzung/kalender/ical/gremium/0` is wrong (302 back to the HTML calendar).

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:RISI-LHM
X-WR-CALNAME:Alle Gremien
BEGIN:VEVENT
DTSTAMP:20260925T133049Z
DTSTART:20260107T173000Z
DURATION:PT1H
SUMMARY:Sitzung BA 06 - Vollgremium
UID:sitzung-9388272@ris-muenchen.de
LOCATION:Sitzungssaal im Sozialbürgerhaus Meindlstraße 16\, 81373 München ...
URL:https://risi.muenchen.de/risi/sitzung/detail/9388272
LAST-MODIFIED:20260409T110429Z
SEQUENCE:27
END:VEVENT
...
```

Fields: `UID` embeds the session id (`sitzung-{id}@...`), `URL` is the detail page, `DURATION` is always
`PT1H` (placeholder, not the real length), `LAST-MODIFIED`/`SEQUENCE` allow change detection.
TTL: 6 h.

### 1.3 Detail pages and documents (stable URLs)

All reachable without session cookies (the server appends `;jsessionid=...` to links; strip it, robots.txt
disallows URLs containing jsessionid):

- `https://risi.muenchen.de/risi/antrag/detail/{id}` (StR/BA-Anträge, BV-Empfehlungen, BV-Anfragen, TOP mit Vorgang)
- `https://risi.muenchen.de/risi/sitzungsvorlage/detail/{id}`
- `https://risi.muenchen.de/risi/sitzung/detail/{id}`, plus `/tagesordnung/oeffentlich` and `/tagesordnung/nichtoeffentlich`
- `https://risi.muenchen.de/risi/sitzung/top/{topid}/entscheidung`
- `https://risi.muenchen.de/risi/person/detail/{id}`, `/risi/gremium/detail/{id}`, `/risi/organisationseinheit/detail/{id}`
- Documents: `https://risi.muenchen.de/risi/dokument/v/{dokid}` returns the file directly. VERIFIED:
  `dokument/v/10021339` -> `200 application/pdf`, 293,690 bytes,
  `Content-Disposition: inline; filename="F%2000084_Baustellenchaos%20durch%20Starkregen.pdf"`.
  Document ids appear on detail pages as `../../dokument/v/{id}` and `?dokument=v{id}`.

Parsed fields (HTML labels) seen on detail pages:

- Antrag: Betreff, Gestellt am, Registriert am, Wahlperiode, Gestellt von, Zuständiges Referat, Art
  (Öffentlicher Vorgang), Typ, Bearbeitungs-Frist, status in the heading (e.g. "In Bearbeitung"),
  Dokumente (name + size), Ergebnisse, Historie (status transitions with dates).
- Sitzungsvorlage: status (e.g. "Vorläufiger Beschluss"), Betreff, Kurzinformationen (Anlass, Inhalt,
  Gesamtkosten, Klimaprüfung, Entscheidungsvorschlag, Ortsangabe), Freigabe, Wahlperiode, Zuständiges Referat,
  Referent*in, Typ (e.g. "Beschlussvorlage SB"), Stadtbezirk/e, Dokumente, Ergebnisse (Gremium, date, `Beschluss.pdf`).
- Sitzung: Gremium, Wahlperiode, Sitzungsort, Vorsitz, Tagesordnungen, Referat, next/previous session, Dokumente, Historie.
- Public agenda page (`/tagesordnung/oeffentlich`): per TOP number, title, linked Sitzungsvorlage/Anträge,
  Referent*in, Typ, `Beschluss.pdf` link, "Entscheidung" link.

TTL: detail pages 1-6 h; PDFs are immutable per id (cache 30 d or longer).

### 1.4 Search (GET, returns HTML)

URL template:
`https://risi.muenchen.de/risi/suche?von={YYYY-MM-DD}&bis={YYYY-MM-DD}&bereich={Vorgang|Dokument}&objekt={code}[&objekt={code}...]&text={query}&start=true`

- `start=true` is required, otherwise only the form is prefilled and no search runs (verified).
- `bereich=Vorgang` searches metadata only; `bereich=Dokument` also searches document full text.
  VERIFIED with `text=Radweg`, 2026-06-01 to 2026-09-25, `objekt=1`: Vorgang 2 hits, Dokument 11 hits.
- `objekt` codes (determined by which filter checkbox the server marks as checked):
  1 StR-Anträge/Anfragen, 2 Sitzungsvorlagen, 3 StR-Sitzungen, 6 BA-Initiative, 7 BA-Sitzungen,
  8 TOP mit Vorgang, 51 BA-Anträge, 52 BV-Empfehlung, 53 BV-Anfrage, -51 StR-Personen, -52 BA-Personen.
  Unknown codes (tested 4, 5, 9-12, 54-58, -1, -2, -3, -7) select all types. Codes for StR-/BA-Beschlüsse and Gremien were not found.
- Short form used by the header search box: `suche?scope=Vorgang&start=true&text={q}` (all types, default range one year).
- Result page: 10 hits per page, text like `1 - 10 von 11 Treffern`, capped at 500 ("mehr als 500 Treffer").
  Hit links: `./antrag/detail/{id}`, `./sitzungsvorlage/detail/{id}`, `./sitzung/detail/{id}`, plus document links.
  Paging and page size are stateful Wicket form controls, not addressable by GET, so keep queries narrow
  (short `von`/`bis` windows) instead of paging.

TTL: 15 min.

### License / terms (RIS)

- The RIS imprint (`/risi/service/impressum`) refers to the general city imprint
  https://stadt.muenchen.de/infos/impressum.html. Paraphrased: content may be copyrighted; official works in
  the sense of §5 UrhG (laws, ordinances, official decrees and announcements, decisions) are not protected,
  but the rules on source attribution and no alteration (§§ 62, 63 UrhG) apply; other reuse in publications
  needs consent; press releases and speeches may be reprinted with source attribution.
  No open-data license for RIS content.
- `https://risi.muenchen.de/robots.txt` fully disallows several AI/SEO crawlers by name (including
  ClaudeBot, GPTBot, Amazonbot, ia_archiver) and disallows `/*jsessionid*` for everyone. An MCP server that
  fetches RIS on behalf of an AI agent should limit itself to user-initiated, low-rate requests with caching,
  or prefer the München Transparent mirror (section 2) for bulk access.

---

## 2. München Transparent OParl API

Status: **VERIFIED** for OParl (still updated daily). Website full-text search: **NOT WORKING**.

Entry points:

- System: `GET https://www.muenchen-transparent.de/oparl/v1.0`
- Bodies: `GET https://www.muenchen-transparent.de/oparl/v1.0/list/body` (26 bodies: `body/0` = Stadtrat, `body/1` to `body/25` = Bezirksausschüsse 1 to 25)

Pitfall: the Body objects advertise list URLs such as `/oparl/v1.0/list/paper`, `/list/meeting`,
`/list/organization`, `/list/person`, and **all of these return 404**. The working lists are body-scoped
(found in the source, `protected/config/urls.php` of github.com/codeformunich/muenchen-transparent):

| Resource | URL template | Verified |
|---|---|---|
| Papers | `GET /oparl/v1.0/body/{body}/list/paper` | yes (body 0: 639 pages of 100, body 1 also) |
| Meetings | `GET /oparl/v1.0/body/{body}/list/meeting` | yes |
| Organizations | `GET /oparl/v1.0/body/{body}/list/organization` | yes (body 0: 86 = 66 `gremium` + 20 `referat`, unpaged) |
| Persons | `GET /oparl/v1.0/body/{body}/list/person` | yes (16 pages) |
| Single objects | `GET /oparl/v1.0/{type}/{id}` e.g. `paper/9737963`, `meeting/9141158`, `agendaitem/1193168`; `organization/{gremium or referat}/{id}` | yes (paper, meeting, agendaitem) |
| Files | `GET /oparl/v1.0/fileaccess/download/{id}` (attachment) and `/fileaccess/access/{id}` | download yes (`application/pdf`) |

Filtering and paging (VERIFIED):

- `created_since`, `created_until`, `modified_since`, `modified_until` with ISO 8601 timestamps including offset
  (encode `+` as `%2B`), e.g. `.../body/0/list/paper?modified_since=2026-01-01T00:00:00%2B01:00` (22 pages).
- 100 items per page; follow `links.next` which uses an id cursor (`?id=8609207&modified_since=...`);
  `pagination.totalPages` is given; lists are ordered by id ascending.
- No search/keyword filter in OParl.

Freshness (the question "is it still updated"):

- Newest paper: created `2026-09-25T13:03:04+02:00`, reference `26-32/A00136` (the day of testing).
  `created_since=2026-09-10` returned 2 pages; 56 of the first 100 carry new-term references (`26-32/...`).
- Meetings with `modified_since=2026-09-15`: 54, latest `start` 2026-09-29 (Finanzausschuss).
- Crawl timestamps cluster at several runs per day (about 03:00-04:00, 07:00, 13:00, 17:00, 21:00 local).
- MT uses the RIS ids: meeting `9141158` = `risi.muenchen.de/risi/sitzung/detail/9141158`, file `9980979` =
  `risi.muenchen.de/risi/dokument/v/9980979`. So RIS links can be derived from OParl objects.

Sample (`GET /oparl/v1.0/paper/9737963`, truncated):

```json
{"id": "https://www.muenchen-transparent.de/oparl/v1.0/paper/9737963",
 "type": "https://schema.oparl.org/1.0/Paper",
 "body": "https://www.muenchen-transparent.de/oparl/v1.0/body/0",
 "name": "Änderung des Flächennutzungsplanes mit integrierter Landschaftsplanung für den Bereich IV/43 ...",
 "reference": "26-32/V00818", "paperType": "Stadtratsvorlage",
 "auxiliaryFile": [{"id": ".../file/9977714", "type": "https://schema.oparl.org/1.0/File",
   "name": "ÄndFNP A 96 BE A1-5", "muenchenTransparent:nameRaw": "V 00818 AendFNP A 96 BE A1-5",
   "accessUrl": ".../fileaccess/access/9977714", "downloadUrl": ".../fileaccess/download/9977714",
   "fileName": "9977714 - ÄndFNP A 96 BE A1-5.pdf", "web": "https://www.muenchen-transparent.de/dokumente/9977714", "...": "..."}],
 "underDirectionOf": [".../organization/referat/..."], "web": "https://www.muenchen-transparent.de/antraege/9737963",
 "created": "2026-09-25T03:43:09+02:00", "modified": "...", "...": "..."}
```

Meeting sample (truncated): `{"id": ".../meeting/9141158", "type": ".../Meeting", "start": "2026-09-29T14:00:00+02:00",
"name": "Finanzausschuss", "organization": [".../organization/gremium/6"], "auxiliaryFile": [...],
"agendaItem": [{"id": ".../agendaitem/1193168", "number": "1.", "name": "Haushalt ... 2026; ...",
"consultation": ".../consultation/1193168", "resolutionText": ""}]}`

Field notes: `reference` = RIS number (`{Wahlperiode}/{Letter}{Number}`), `paperType` (Stadtratsantrag,
Stadtratsvorlage, ...), `underDirectionOf` = Referat, `created`/`modified` are MT crawl times (papers in the
lists have **no official `date` field**), very old records carry invalid timestamps (`-0001-11-30T00:00:00+00:53`).
Vendor extensions (`muenchenTransparent:*`) are documented in `docs/oparl.md` of the GitHub repo.

Search (what I tried):

- `GET https://www.muenchen-transparent.de/suche?suchbegriff=Radweg` -> HTTP 500.
- `GET https://www.muenchen-transparent.de/feed?krit_typ%5B%5D=volltext&krit_val%5B%5D=Radweg` (search as RSS,
  parameter format from `RISSucheKrits::getUrl`) -> HTTP 500, error page says the Solr backend
  (127.0.0.1:8983) is unreachable. So full-text search is currently down.
- Working instead: `GET https://www.muenchen-transparent.de/feed` (RSS of the 100 latest changes, e.g.
  status "Vorläufiger Beschluss => Endgültiger Beschluss"), VERIFIED.

License / terms: no data license on the API or on `/infos/api`; the software is AGPL-3.0 (GitHub). The data
mirrors RIS content, so the RIS copyright caveats apply. It is a volunteer project (Code for Munich), operator
details on `/infos/impressum`. robots.txt only disallows `/*/dav/`.

TTL: poll lists hourly with `modified_since`; objects 6-24 h; files immutable.

---

## 3. PVOG Suchdienst API (Portalverbund Online-Gateway)

Status: **VERIFIED**, callable without authentication.

- Base URL: `https://pvog.fitko.net/suchdienst/api` (from the `servers` entry of the OpenAPI document
  `https://pvog.fitko.net/suchdienst/api/v3/api-docs/suchen`, API version 11.18.2; linked from
  https://produktportal.pvog.fitko.de/api/suchdienst/portalverbund-suchdienst-rest-api/).
- The old host is gone: the docs announce that `pvog.fitko.de` production APIs were switched off on 01.08.2026;
  `https://pvog.fitko.de/suchdienst/api/v7/servicedescriptions/091620000000?q=Wohnsitz` now returns 404 (HTML). VERIFIED.
- Auth: the OpenAPI spec defines no security schemes, and the Suchdienst documentation
  (https://produktportal.pvog.fitko.de/docs/suchdienst/doku/) states that the external interfaces are publicly
  reachable without authentication. VERIFIED by calling without any header except `Accept: application/json`.
- Responses carry `Cache-Control: no-cache, no-store`; data are refreshed nightly (`lastUpdate` around 23:55 UTC).

Endpoints:

| Purpose | URL template | Status |
|---|---|---|
| Search services in a region | `GET /v7/servicedescriptions/{ars}?q={term}&page={0..100}&size={5..9999, default 10}&fuzzysearch={bool}&useArsHierarchy={bool, default true}&validDate={YYYY-MM-DD}&personalMatters={code}&facades={bool}` | VERIFIED (`ars=091620000000`: q=Wohnsitz 77 hits, q=Anmeldung 219, q=Personalausweis 48) |
| Full service description for a region | `GET /v6/servicedescriptions/{lbid}/detail?ars=091620000000` | VERIFIED (`L100042.LB.365`, `L100042.LB.362`) |
| Organisation unit (address, contact) | `GET /v5/organisationunits/detail?q={oeId}&ars={ars}&lbId={lbid}` | VERIFIED (`L100042.OE.2199`) |
| All services of a region as CSV | `GET /v5/servicedescriptions/csv?ars=091620000000` | VERIFIED (650 KB, 3,847 data rows, 3,447 distinct services) |
| Online service detail | `GET /v2/onlineservices/detail?q={odId}` | NOT TESTED |
| Autocomplete | `GET /v1/servicedescriptions/suggestions/{ars}?q={term}` | NOT TESTED |
| Life situations of a region | `GET /v1/personalmatters/{ars}` | NOT TESTED |
| Places / ARS lookup | `GET /v2/locations?q=`, `/v2/locations/reverse?lat=&lon=`, `/v3/locations/details?ort=&plz=&strasse=&hausnummer=` | NOT TESTED |

ARS for München: `091620000000` (Gemeinde level, as the spec recommends).

Search sample (`/v7/servicedescriptions/091620000000?q=Wohnsitz&size=5`, truncated):

```json
{"facades": {"personalMatters": []},
 "serviceDescriptions": {"content": [
   {"id": "L100042.LB.12466", "name": "Wohnsitz; Abmeldung", "ars": ["090000000000"], "arsFederalstate": ["09"],
    "availableLanguages": ["de", "en"], "description": "<p>Wenn Sie aus Ihrer Wohnung ausziehen ...</p>",
    "details": [{"code": "24", "title": "Kurzinfo", "text": "<p>...</p>", "xZufiCategory": "TEXT_MODUL"}, "..."],
    "leikakeys": ["..."], "onlineServiceLinks": [], "organisationIds": [], "lastUpdate": "...", "...": "..."},
   {"id": "L100042.LB.365", "name": "Wohnsitz; Anmeldung", "...": "..."}],
  "totalElements": 77, "totalPages": 16, "numberOfElements": 5, "pageable": {"pageNumber": 0, "pageSize": 5}}}
```

Detail sample (`/v6/servicedescriptions/L100042.LB.365/detail?ars=091620000000`, condensed):

```json
{"id": "L100042.LB.365", "name": "Wohnsitz; Anmeldung", "ars": ["090000000000"],
 "leikakeys": ["99115005104000", "99115005104002", "99115005104001", "99115003012000"],
 "details": [
   {"code": "08", "title": "Erforderliche Unterlagen", "text": "... Meldeschein ... Personalausweis und/oder Reisepass ..."},
   {"code": "98", "title": "Kosten & Gebühren", "xZufiCategory": "KOSTEN", "text": "keine", "details": []},
   {"code": "97", "title": "Fristen", "xZufiCategory": "FRIST", "text": "Die Anmeldung muss innerhalb von zwei Wochen nach dem Einzug erfolgen."},
   {"code": "94", "title": "Ursprungsportal", "links": [{"uri": "https://www.bayernportal.de/dokumente/leistung/8444082781?plz=80331&...", "title": "BayernPortal"}]},
   "..."],
 "forms": [{"id": "L100042.FO.12293", "name": "Wohnungsgeberbestätigung ... (Dateiformat: pdf)", "uri": "https://formularserver.bayern.de/..."}],
 "onlineServiceLinks": [{"id": "L100042.OD.223596_172433", "title": "Elektronische Wohnsitzanmeldung",
   "uri": "https://wohnsitzanmeldung.gov.de/?b=1620000", "description": "..."}],
 "organisations": [{"id": "L100042.OE.2199", "title": "Landeshauptstadt München",
   "role": {"name": "Zuständige Stelle und Ansprechpunkt", "code": "01"}}],
 "personalMatters": [{"code": "1000000", "name": "Lebenslagen für Bürgerinnen und Bürger", "children": ["..."]}],
 "lastUpdate": "2026-09-24T23:55:45.031954907Z", "validityPeriods": [{"validFrom": "1970-01-01", "validTo": "2999-12-31"}]}
```

A fee example (`L100042.LB.362` "Personalausweis; Beantragung", module 98): "Antragsteller ab 24 Jahren:
46,00 EUR, Antragsteller unter 24 Jahren: 27,60 EUR, Vorläufiger Personalausweis: 10,00 EUR, ..." and an
online service link to `https://stadt.muenchen.de/infos/status-personalausweis-reisepass.html`.

Organisation unit sample (`/v5/organisationunits/detail?q=L100042.OE.2199&ars=091620000000&lbId=L100042.LB.365`):
`title "Landeshauptstadt München"`, `location.addresses[]` (Hausanschrift Marienplatz 8, 80331 München with
`geo` lat 48.1378/lon 11.5753 EPSG:4326; Postanschrift 80313), `location.communications[]` (E-Mail
`rathaus@muenchen.de`, links), `internetAddresses`, `employees`, `bankAccounts`, `role`.

CSV sample (`/v5/servicedescriptions/csv?ars=091620000000`, pipe-separated, header + one row):

```
ID-LB|Leikaschlüssel|Name|Name2|Updatedatum|ID-OD|Bezeichnung OD|Links
B100019.LB.100673442|99102015039001|||24.09.2026 23:59|B100019.OD.110764763|Online-Dienstleistung Kraftfahrzeugsteuer auf dem Zoll-Portal|https://www.kraftst.zoll-portal.de/dienstleistungen/kraftfahrzeugsteuer
```

(One row per service and online service; `Name` is often empty, so use it as an id list and fetch details.)

Detail module codes seen (`details[].code`): 03 Leistungsname, 06 Beschreibung, 07 Rechtsgrundlage(n),
08 Erforderliche Unterlagen, 09 Voraussetzungen, 11 Verfahrensablauf, 15 weiterführende Informationen,
18 Urheber, 22 Zuständige Stelle, 23 Ansprechpunkt, 24 Kurzinfo, 25 Rechtsbehelf, 93 Fachliche Freigabe
(with `date`), 94 Ursprungsportal, 95 Bearbeitungsdauer, 97 Fristen (`FRIST`), 98 Kosten & Gebühren (`KOSTEN`).

Caveats:

- Keyword relevance is loose (q=Anmeldung ranks exam registrations first); filter results by name or LeiKa key.
- With `useArsHierarchy=true` (default) results for Munich are mostly Bavarian (`090000000000`, ids `L100042.*`,
  source BayernPortal) and federal (`000000000000`, ids `B100019.*`) texts. Munich-specific parts are the online
  service links (e.g. `?b=1620000`) and the organisation unit; the unit is the generic "Landeshauptstadt München"
  (Marienplatz 8), not the specific office (e.g. a Bürgerbüro).

License / terms: the OpenAPI `info.license` is `"Creative Commons Attribution Share Alike 4.0 (CC BY-SA 4.0)"`;
no separate license for the service texts was found in the responses (module 18 names the author, module 93 the
approving ministry). The FITKO docs site content is CC BY 4.0.

TTL: 24 h for search, details and CSV.

---

## 4. City services corpus by it@M on Hugging Face

Status: **VERIFIED** (metadata API, tree API, direct download URLs via HEAD, sample rows via datasets-server).

### 4.1 `it-at-m/munich-public-services`

- Metadata: `GET https://huggingface.co/api/datasets/it-at-m/munich-public-services` (sha `752c7d5804cebb30b8bb166d992e6f7efe396324`,
  lastModified 2025-01-16, not gated, tags include `license:mit`).
- Files: `GET https://huggingface.co/api/datasets/it-at-m/munich-public-services/tree/main` and `/tree/main/data`:

| File | Size | Direct URL |
|---|---|---|
| `data/train-00000-of-00001.parquet` | 39,682,949 B | https://huggingface.co/datasets/it-at-m/munich-public-services/resolve/main/data/train-00000-of-00001.parquet (302 to CDN, verified via HEAD) |
| `README.md` | 9,017 B | https://huggingface.co/datasets/it-at-m/munich-public-services/resolve/main/README.md |
| `LICENSE` | 1,088 B | https://huggingface.co/datasets/it-at-m/munich-public-services/resolve/main/LICENSE |

- Rows: 1,446 (single split `train`); `language`: de 810, en 636.
- Columns: `name` (string, article title), `language` (`de`/`en`), `description` (HTML teaser), `source`
  (URL `https://stadt.muenchen.de/service/info/{slug}/{id}/`, a sampled link resolved with 200), `public`
  (bool, always true), `id` (int64, article id), `lastModification` (timestamp UTC), `keywords` (list of strings),
  `embedding` (list of float64, 3,072 dims, computed with OpenAI `text-embedding-3-large` per README),
  `content` (full article as Markdown).
- Sample row via `GET https://datasets-server.huggingface.co/rows?dataset=it-at-m%2Fmunich-public-services&config=default&split=train&offset=5&length=1` (truncated):

```json
{"name": "Certificate of good conduct", "language": "en",
 "description": "<p>Certificates of good conduct are requested by various private and public bodies. ...",
 "source": "https://stadt.muenchen.de/service/info/certificate-of-good-conduct/10432751/",
 "public": true, "id": 10432751, "lastModification": "2024-10-28T07:55:45Z",
 "keywords": ["Adult", "Associations", "Certificate", "..."],
 "embedding": [0.0140, 0.0198, "... 3072 values"],
 "content": "\n# Certificate of good conduct\n\n## Summary\n\nCertificates of good conduct are requested by ..."}
```

- License: MIT (LICENSE file, copyright 2025 Landeshauptstadt München, it@M). The README also lists
  out-of-scope uses (use only for information about Munich services; no disinformation; do not use it to generate
  more "fake" articles).
- Note: query-side embeddings must use the same OpenAI model, which needs an OpenAI key. Alternative: ignore the
  column and use BM25 or your own embeddings over `content`.

### 4.2 `it-at-m/LHM-Dienstleistungen-QA`

- Metadata: `GET https://huggingface.co/api/datasets/it-at-m/LHM-Dienstleistungen-QA` (lastModified 2024-01-23, `license: mit` in the card; no LICENSE file).

| File | Size | Direct URL |
|---|---|---|
| `data/train-00000-of-00001-c163f2d954c3ad2a.parquet` | 594,407 B | https://huggingface.co/datasets/it-at-m/LHM-Dienstleistungen-QA/resolve/main/data/train-00000-of-00001-c163f2d954c3ad2a.parquet |
| `data/test-00000-of-00001-e0c77dcb61c4adeb.parquet` | 115,620 B | https://huggingface.co/datasets/it-at-m/LHM-Dienstleistungen-QA/resolve/main/data/test-00000-of-00001-e0c77dcb61c4adeb.parquet |
| `train/dataset.arrow`, `test/dataset.arrow` (+ `dataset_info.json`, `state.json`), `dataset_dict.json` | | same `resolve/main/{path}` pattern |
| `README.md`, 4 JPG charts | | |

- Rows: train 1,773; test 357.
- Columns: `id` (string), `title` (service name), `context` (text passage), `question`, `answers`
  (`{"answer_start": [int], "text": [string]}`, GermanQuAD/SQuAD style).
- Data basis per README: texts from the city's "Dienstleistungsfinder" as of 11/2022 (dated).
- Sample row (train, offset 0, truncated):

```json
{"id": "146492111", "title": "Verwarnungs- und Bußgeldverfahren Straßenverkehr",
 "context": "sind und einen begründeten Einwand haben, können Sie sich innerhalb einer Woche per Brief, ...",
 "question": "Wann bekommt man ein Bußgeld für Verkehrsverstöße?",
 "answers": {"answer_start": [536], "text": ["- wenn Sie eine Verwarnung nicht bezahlt haben\n- ..."]}}
```

TTL: 7 d (re-check the dataset `sha` via the metadata API to detect updates).

---

## 5. AWM waste collection calendar (Abfuhrkalender)

Status: **NOT VERIFIED end-to-end.** The lookup needs an HTTP POST with signed form fields, which I did not send
because this task allowed GET requests only. No JSON endpoint and no address-parameterized ICS URL that works
via plain GET was found.

Page: `https://www.awm-muenchen.de/abfall-entsorgen/muelltonnen/abfuhrkalender`
(legacy `https://www.awm-muenchen.de/entsorgen/abfuhrkalender` -> 307 to it). VERIFIED via GET.

How the site looks up an address (from the page HTML and scripts):

1. The page (TYPO3 Extbase plugin `tx_awmabfuhrkalender_abfuhrkalender`) embeds a hidden
   `<div id="strassenliste">` with 5,834 `<span>` street names in AWM spelling (abbreviated, e.g. `Marienpl.`,
   `Aachener Str.`). The street autocomplete (jQuery UI, `$('.strasse').autocomplete({source: strassenlisteArray})`)
   uses only this local list, no AJAX.
2. Form `abfuhrkalender`, `method="post"`, action
   `/abfall-entsorgen/muelltonnen/abfuhrkalender?tx_awmabfuhrkalender_abfuhrkalender%5Baction%5D=show&tx_awmabfuhrkalender_abfuhrkalender%5Bcontroller%5D=Abfuhrkalender&cHash={hash}`.
   Fields: `tx_awmabfuhrkalender_abfuhrkalender[strasse]`, `tx_awmabfuhrkalender_abfuhrkalender[hausnummer]` (max 5 chars),
   `tx_awmabfuhrkalender_abfuhrkalender[section]=address`, `tx_awmabfuhrkalender_abfuhrkalender[submitAbfuhrkalender]=true`,
   plus per-page-load hidden Extbase fields `[__referrer][@extension|@controller|@action|arguments|@request]` and
   `[__trustedProperties]` (HMAC-signed).
3. Follow-up flow, as implemented by the community project mampfes/hacs_waste_collection_schedule
   (`source/awm_muenchen_de.py`, last changed 2026-07-10; read, not executed): GET the page with a cookie session,
   POST the address (the backend checks the `Origin: https://www.awm-muenchen.de` header), then either the response
   contains one or more `a.downloadics` links, or it asks for selects `tx_awmabfuhrkalender_abfuhrkalender[stellplatz][restmuell|bio|papier]`
   (location ids such as `70050134`) and/or `tx_awmabfuhrkalender_abfuhrkalender[leerungszyklus][R|B|P]`
   (cycle codes such as `001;U` or `1/2;G`) which must be POSTed again. The final `a.downloadics` href is a GET
   URL of an `.ics` file whose parameters include the chosen stellplatz and leerungszyklus values. The project's
   test case "Marienplatz 1" needs cycle codes `001;U` (Restmüll) and `002;U` (Papier).

What I tried:

- `GET` of the page: 200, form and street list found (VERIFIED).
- `GET` of the same URL with the Extbase fields as query parameters (`strasse=Marienpl.`, `hausnummer=8`,
  `section=address`, `submitAbfuhrkalender=true`): **404** ("Die Seite konnte leider nicht gefunden werden"),
  because TYPO3 rejects unsigned query arguments without a valid `cHash`.
- CKAN search `q=abfuhr` on opendata.muenchen.de: 0 datasets (no open-data alternative).
- POST for "Marienplatz 8": not executed (GET-only rule). Testing it needs your explicit go-ahead.

Implementation notes: an MCP tool must script the session flow (GET page, parse hidden inputs and action URL,
POST address with Origin header, handle stellplatz/leerungszyklus selects, GET the ICS, parse VEVENTs).
Expect breakage when AWM changes the form. robots.txt allows the page (only TYPO3 system paths are disallowed).
TTL: 7 d per address (cache the ICS; schedules change rarely except for holiday shifts).

---

## 6. SWM pools and saunas live occupancy

Status: **VERIFIED**. The page now mostly uses an SWM endpoint; the ticos API still works on a new host.

Data source (from `https://www.swm.de/baeder/auslastung` HTML and the Vue component `BathCapacityItem` in
`/.resources/swmTemplates/themes/swm/js/main.bundle~...~cache.js`): each `<bath-capacity-item>` carries
`bath-name`, either `area-id` or `organization-unit-id`, and `endpoint-url`. The component does a plain
`fetch(url, {method: "GET"})` without extra headers:

- `area-id` items: `GET https://www.swm.de/.rest/bath/visitorCount?area_id={areaId}`; it searches
  `data[].area_list[]` for the area, free % = `100 - round(customer_amount / customer_amount_max * 100)`;
  area missing -> shown as closed.
- `organization-unit-id` items: `GET https://counter.ticos-systems.cloud/api/gates/counter?organizationUnitIds={id}`;
  free % = `100 - round(personCount / maxPersonCount * 100)`.

Endpoints:

| URL | Result |
|---|---|
| `GET https://www.swm.de/.rest/bath/visitorCount` (no parameter) | VERIFIED: all 10 locations with all areas, ids and names (best single call) |
| `GET https://www.swm.de/.rest/bath/visitorCount?area_id=66` | VERIFIED: only the location containing area 66 |
| `GET https://counter.ticos-systems.cloud/api/gates/counter?organizationUnitIds=30204` | VERIFIED without any header; with `abp-tenantid: 69` identical |
| `...?organizationUnitIds=30199,30204,30207` | VERIFIED: comma list returns all three; repeating the parameter returns only the last id |
| `GET https://functions.api.ticos-systems.cloud/api/gates/counter?organizationUnitIds=30204` (old scraper URL, header `abp-tenantid: 69`) | NOT WORKING: host does not resolve (DNS) |

Sample (`/.rest/bath/visitorCount`, one location):

```json
{"return_code": "success", "data": [
  {"location_id": 48, "location_name": "Südbad", "customer_amount": 63, "customer_amount_max": 560,
   "area_list": [{"area_id": 78, "area_name": "Südbad Hallenbad", "customer_amount": 54, "customer_amount_max": 360},
                 {"area_id": 81, "area_name": "Südbad Sauna", "customer_amount": 9, "customer_amount_max": 100},
                 {"area_id": 111, "area_name": "SB - Sauna", "customer_amount": 0, "customer_amount_max": 100}]},
  "..."]}
```

ticos sample: `[{"organizationUnitId":30204,"personCount":0,"maxPersonCount":70}]`

Ids and names as used on the page (2026-09-25):

| Section | Name | id type | id |
|---|---|---|---|
| Freibäder | Naturbad Georgenschwaige | area | 48 |
| Freibäder | Michaeli-Freibad | area | 6 |
| Freibäder | Naturbad Maria Einsiedel | area | 27 |
| Freibäder | Prinzregentenbad | area | 39 |
| Freibäder | Schyrenbad | area | 24 |
| Freibäder | Ungererbad | area | 21 |
| Freibäder | Freibad West | area | 15 |
| Hallenbäder | Bad Giesing-Harlaching | area | 90 |
| Hallenbäder | Cosimawellenbad | area | 72 |
| Hallenbäder | Dante-Winter-Warmfreibad | area | 30 |
| Hallenbäder | Michaelibad | area | 3 |
| Hallenbäder | Müller'sches Volksbad | area | 84 |
| Hallenbäder | Nordbad | area | 60 |
| Hallenbäder | Olympia-Schwimmhalle | area | 66 |
| Hallenbäder | Südbad | area | 78 |
| Hallenbäder | Westbad (closed for renovation per page) | ticos unit | 30199 |
| Saunen | Cosimawellenbad | area | 75 |
| Saunen | Dantebad | area | 33 |
| Saunen | Michaelibad | area | 9 |
| Saunen | Müller'sches Volksbad | ticos unit | 30204 |
| Saunen | Olympia-Schwimmhalle | area | 69 |
| Saunen | Nordbad | area | 63 |
| Saunen | Südbad | area | 81 |
| Saunen | Westbad (closed for renovation per page) | ticos unit | 30207 |

Observations: the API also lists areas that the page does not show (102 "DB - Sauna", 105 "WB - Sauna",
108 "MB - Sauna", 111, 114, 117, 120, 123 "OSH - Sauna"); at test time 123 showed 8/200 while page area 69 showed
0/199. Seasonal outdoor areas 48, 27, 39, 21 were absent from the API (closed for the season). ticos unit 30204 showed
0/70 while area 87 "Müller'sches Volksbad Sauna" in visitorCount showed 6/70 at the same time, so prefer
visitorCount and treat ticos as a fallback. To get ids now: parse the page for `area-id`/`organization-unit-id`, or
take ids and names directly from `/.rest/bath/visitorCount`.

License / terms: SWM imprint (https://www.swm.de/impressum), paraphrased: layout, texts and graphics of swm.de are
SWM copyright, and information or data may not be used without prior written consent of the publisher.
No open license; treat as display-only live info with attribution, and ask SWM before redistributing.
robots.txt does not block `/.rest/`.

TTL: 60-120 s (API sends `no-cache`; the page itself fetches once per load).

---

## 7. machmuenchenbesser.de (damage reporting, Open311 GeoReport v2)

Status: **VERIFIED**. The API moved behind the frontend proxy under `/api/`.

How it was found: the site is a Nuxt app (Mark-a-Spot). Its runtime config contains `useProxy: true,
proxyPath: "/api"`, and the client bundle (`/_nuxt/KZTdCDq1.js`) calls `/georeport/v2/requests.json` and
`/georeport/v2/requests/${id}.json` through that proxy.

| URL | Result |
|---|---|
| `https://machmuenchenbesser.de/georeport/v2/requests.json` (old, listed on the open data portal) | 404 (JSON) |
| `GET https://machmuenchenbesser.de/api/georeport/v2/requests.json` | VERIFIED |
| `GET https://machmuenchenbesser.de/api/georeport/v2/requests/{service_request_id}.json` e.g. `91732-2026` | VERIFIED (1-element array) |
| `GET https://machmuenchenbesser.de/api/georeport/v2/services.json` | VERIFIED (57 categories: `service_code`, `service_name`, `description`, `extended_attributes`) |
| `.../api/georeport/v2/discovery.json` | 403 |
| `.../api/georeport/v2/services.xml` | returns the HTML app shell, not XML |

Parameters for `requests.json`:

- Standard Open311: `start_date`, `end_date` (ISO 8601; VERIFIED window 2026-09-24 to 2026-09-25 -> 29 reports),
  `status` (`open`/`closed`, VERIFIED), `service_code` (NOT TESTED).
- Mark-a-Spot extras used by the site's own client: `extensions=true` (adds `extended_attributes.markaspot`),
  `meta=true` (wraps the list as `{"requests": [...], "meta": {"total", "limit", "offset"}}`), `sort=desc`,
  `limit`, `offset` (VERIFIED); `bbox={minLng},{minLat},{maxLng},{maxLat}` and `q={text}` (from client code, NOT TESTED).
- Without `meta`, the response is a plain JSON array; default order appeared ascending starting 2026-01-01.
- The site's client query: `?extensions=true&meta=true&sort=desc&start_date=2001-01-01&limit=20&offset=0`;
  `meta.total` was 1,625 (published reports; older ones seem archived even though ids reach `91737-2026`).

Sample (`?extensions=true&meta=true&sort=desc&start_date=2001-01-01&limit=5`, one item, truncated):

```json
{"requests": [
  {"service_request_id": "91732-2026", "title": "#91732-2026 Leuchte ausgefallen",
   "requested_datetime": "2026-09-25T12:41:09+02:00", "updated_datetime": "2026-09-25T13:17:00+02:00",
   "status": "open", "description": "... noch zwei Lampen ... ausgefallen.",
   "lat": 48.165686345289, "long": 11.634893905863,
   "address_string": "81927 München, Spilhofstraße 38", "zipcode": "81927",
   "service_name": "Leuchte ausgefallen", "service_code": "24.17",
   "status_notes": "<p>Vielen Dank für Ihre Meldung. ...</p>",
   "extended_attributes": {"markaspot": {"nid": "...", "status_descriptive_name": "In Bearbeitung",
     "status_hex": "#FFA500", "category_hex": "...", "status_notes": [{"status": "open", "status_descriptive_name": "Offen", "updated_datetime": "..."}, "..."],
     "published": true, "editable": false}}}],
 "meta": {"total": 1625, "limit": 5, "offset": 0}}
```

Fields: `service_request_id` (`{n}-{year}`), `status` (open/closed) plus `status_descriptive_name`
(Offen, In Bearbeitung, Erledigt/Beauftragt, ...), `lat`/`long` WGS84, `media_url` (comma-separated relative
URLs `/api/images/sites/default/files/...`, prefix with the host), `extended_attributes.markaspot.media[].url`
(internal cluster hostnames, not reachable), `status_notes` history with timestamps.

Auth: none for reading (creating reports was not touched).
License: CKAN dataset `meldungen-der-plattform-machmuenchenbesser-de`: `license_id: "CC0-1.0"` (the dataset still
lists the old URLs without `/api`). Privacy: descriptions are citizen free text published anonymized; do not try to
re-identify, and avoid republishing photos beyond linking.
TTL: 5 min (the site's own client uses `cacheTTL: 300000` ms).

---

## 8. Münchner Stadtbibliothek catalog

### 8.1 OAI-PMH

Status: **VERIFIED**. Base URL `https://data-bib.muenchen.de/oai-pmh`.

| Request | Result |
|---|---|
| `?verb=Identify` | repositoryName "Münchner Stadtbibliothek", earliestDatestamp 1993-11-16, granularity `YYYY-MM-DD`, deletedRecord `transient` |
| `?verb=ListMetadataFormats` | `marc_xml` (MARC21 slim), `oai_dc` |
| `?verb=ListSets` | `DE-M36` (all), `DE-M36:DE-M36b` Musikbibliothek, `DE-M36:DE-M36c` Juristische Bibliothek, `DE-M36:DE-M36d` Philatelistische Bibliothek, `DE-M36:DE-M36e` Monacensia |
| `?verb=ListRecords&metadataPrefix=oai_dc&from=2026-09-24&until=2026-09-25` | 50 records per page, `completeListSize="148"`, resumptionToken valid 1 h |
| `?verb=ListRecords&resumptionToken={token}` | next 50, cursor 50 (VERIFIED) |
| `?verb=ListIdentifiers&metadataPrefix=oai_dc&set=DE-M36:DE-M36e&from=2026-09-01` | `completeListSize="265"` (set + date filter works) |
| `?verb=ListIdentifiers&metadataPrefix=oai_dc` | `completeListSize="1163058"` (total records), some `status="deleted"` headers |
| `?verb=GetRecord&metadataPrefix=marc_xml&identifier=oai:muenchner-stadtbibliothek.de:06a9db56-5053-4a85-9a47-e2ffe1ac06af` | VERIFIED |
| `GetRecord` with an invalid identifier | OAI error `badArgument` |

Targeted queries: sets, `from`/`until` (day granularity), GetRecord by OAI identifier are supported.
There is **no search** (OAI-PMH has no query verb), and no lookup by ISBN or title.

Sample record (`oai_dc`):

```xml
<record>
  <header>
    <identifier>oai:muenchner-stadtbibliothek.de:06a9db56-5053-4a85-9a47-e2ffe1ac06af</identifier>
    <datestamp>2026-09-24</datestamp>
    <setSpec>DE-M36</setSpec>
  </header>
  <metadata><oai_dc:dc ...>
    <dc:title>Place of bones</dc:title>
    <dc:creator>[...]</dc:creator>
    <dc:description>ab 16</dc:description>
    <dc:date>2026</dc:date>
    <dc:type>visuelle Materialien</dc:type>
    <dc:identifier>(DE-M36)AK4677348</dc:identifier>
    <dc:language>ger</dc:language>
  </oai_dc:dc></metadata>
</record>
```

Fields: header `identifier` (stable UUID-based OAI id), `datestamp` (last change), `setSpec` (library);
`dc:identifier` holds the local catalog key `(DE-M36)AK...` and ISBN/ISMN when present; `dc:type` media type.
MARCXML of the same record contains 035 (catalog key), 041, 245, 264, 300, 336, 337, 338, 500, 521, 700 and 876
(`$t` = "1"; meaning undocumented, possibly a copy count). **No branch, shelf mark or availability** is included.

License / terms: CKAN dataset `katalogdaten-abfrage-aller-titelsaetze`: `license_id: "CC0-1.0"`. The Identify
`rightsManifest` is inconsistent: it is titled "CC0 1.0 Deed" but its `dc:identifier` points to the GNU FDL URL and a
second `rightsReference` points to CC BY-ND 2.0; its description asks (paraphrased) that the metadata may be reused
freely as long as the OAI identifier stays attached. Recommendation: treat as CC0 and always keep the OAI identifier.
TTL: incremental harvest once per day (`from={yesterday}`); GetRecord results 7 d.

### 8.2 OPAC (title search and branch availability)

Status: **NOT WORKING** for stateless GET.

- `https://www.muenchner-stadtbibliothek.de/katalog` redirects to `https://ssl.muenchen.de/aDISWeb/app/opac`
  (aDIS/BMS). The search form is `method="POST"` to a session-bound path `/aDISWeb/{sessiontoken}/app` with hidden
  fields (`identity`, `requestCount`, `keyCode`, ...), a search box `$Autosuggest` and a branch selector `SUCBER_1`
  (40+ locations, from Allach-Untermenzing to Westend incl. Bücherbusse and Monacensia).
- Tried the aDIS direct-link pattern from the library homepage with the catalog key from MARC 035:
  `https://ssl.muenchen.de/aDISWeb/app?service=direct/0/Home/$DirectLink&sp=SOPAC&sp=SAK4677348` -> redirected
  to `/aDISWeb/app/opac?sp=SAK4677348`, which only showed the OPAC start page (no record).
- No SRU, OpenSearch or RSS endpoint found on the OPAC pages.
- Availability per branch would require scripted POST sessions against the OPAC (not attempted; fragile and not
  offered as an API). Suggested approach: deep-link users to the OPAC and use OAI-PMH for bibliographic data.

---

## 9. News sources for a daily collector

### 9.1 Rathaus Umschau (city press releases)

Status: **VERIFIED**. `GET https://ru.muenchen.de/rss` (advertised via `<link rel="alternate" type="application/rss+xml">` on https://ru.muenchen.de/).

- RSS 2.0, 50 items (about 2.5 days on 2026-09-25), `Cache-Control: no-cache, private`.
- Channel `copyright`: "Portal München Betriebs-GmbH & Co. KG".
- Item fields: `title` (prefixed "Meldungen:", "Terminhinweis:", ...), `description` (CDATA, full HTML text),
  `link` = `guid` = `https://ru.muenchen.de/{year}/{issue}/{slug}-{id}`, `pubDate` (UTC).

```xml
<item>
  <title>Meldungen: Öffentliche Stadtrats-Sitzungen der kommenden Woche Dienstag, 29. September</title>
  <description><![CDATA[<p>14.00 Uhr Finanzausschuss ...</p> ...]]></description>
  <link>https://ru.muenchen.de/2026/184/Oeffentliche-Stadtrats-Sitzungen-der-kommenden-Woche-Dienstag-29-September-126230</link>
  <guid>https://ru.muenchen.de/2026/184/Oeffentliche-Stadtrats-Sitzungen-der-kommenden-Woche-Dienstag-29-September-126230</guid>
  <pubDate>Fri, 25 Sep 2026 10:07:18 +0000</pubDate>
</item>
```

Terms: the city imprint (https://stadt.muenchen.de/infos/impressum.html) allows reprinting and evaluating press
releases and speeches with source attribution (paraphrased). TTL: 15 min.

### 9.2 muenchen.de news

- No feed is advertised on https://www.muenchen.de/ or https://stadt.muenchen.de/ (no `rel=alternate`, no "rss" in the HTML).
- `GET https://www.muenchen.de/rss.xml`: **VERIFIED** (Drupal default front-page feed, not linked from the site):
  RSS 2.0, 10 items, editorial/tourism content (e.g. "Freizeit mit Kindern", weather, Oktoberfest events), `pubDate`
  per item, description with HTML teaser. Could disappear without notice.
- Tested and failing: `https://www.muenchen.de/aktuell/rss.xml` 404, `https://www.muenchen.de/feed` 404,
  `https://www.muenchen.de/aktuell` 301 to the homepage.
- City administration news articles live at `https://stadt.muenchen.de/news/{slug}.html`: no feed found,
  `https://stadt.muenchen.de/sitemap.xml` 404, `https://stadt.muenchen.de/news.html` redirects to `/rathaus.html`.
  Status: **NOT WORKING** (no feed). Fallback: the Rathaus Umschau feed.

Terms: www.muenchen.de is operated by Portal München Betriebs-GmbH & Co. KG with copyright on content; link and
summarize rather than republish full texts. TTL: 30 min.

### 9.3 MVG news and disruptions

- Press releases (`https://www.mvg.de/presse/pressemeldungen.html`): no RSS/Atom link found. **NOT WORKING** (no feed).
- Disruption ticker used by mvg.de (the bundle `/.resources/mvg-wastl/web/dist/bundle~...js` polls it every 60 s):
  `GET https://www.mvg.de/api/ems/slim` with `Accept: application/json` -> **VERIFIED**:
  `[{"id": "403ba927-4332-4803-8f08-8b1f5584cbd7", "title": "Bus 154 - Umleitung wegen Wasserrohrbruch"}]`
- Full messages: `GET https://www.mvg.de/api/bgw-pt/v3/messages` -> **VERIFIED** (347 KB, 273 messages:
  272 `SCHEDULE_CHANGE`, 1 `INCIDENT`):

```json
[{"title": "Umleitung wegen Wasserrohrbruch",
  "description": "<div>Liebe Fahrgäste,</div><div>wegen einer Vollsperrung der Lothstraße ... Umleitung der Linie 154 ...</div>",
  "publication": 1790341200000, "publicationDuration": {"from": 1790341200000, "to": 1790983800000},
  "incidentDurations": [{"from": 1790341200000, "to": 1790983800000}],
  "validFrom": 1790341200000, "validTo": 1790983800000, "type": "INCIDENT", "provider": "MVG", "links": [],
  "lines": [{"label": "154", "transportType": "BUS", "network": "swm", "divaId": "03154", "sev": false}],
  "stationGlobalIds": [], "eventTypes": []}, "..."]
```

  Fields: timestamps are epoch milliseconds; `type` INCIDENT vs SCHEDULE_CHANGE; `lines[]` affected lines
  (`sev` = rail replacement bus); `stationGlobalIds` affected stops.
- Both endpoints are undocumented website APIs, not official open data.
  Terms (MVG imprint https://www.mvg.de/impressum.html): processing of MVG content or data by third parties requires
  MVG's explicit consent; the imprint says: "Für private, nicht-kommerzielle Zwecke, wird eine gemäßigte Nutzung ohne
  unsere ausdrückliche Zustimmung geduldet." It further says any form of data mining is not moderate use and that the
  tolerance can be revoked (paraphrased). Keep request rates low and get consent for anything beyond private use.
- TTL: `ems/slim` 2 min; `v3/messages` 5 min.

### 9.4 Open data portal: recently changed datasets (CKAN 2.9.9)

- `GET https://opendata.muenchen.de/api/3/action/package_search?sort=metadata_modified%20desc&rows=20` -> **VERIFIED**
  (`count` 337; `package_list` has 369 names).
- Caveat: GeoPortal-harvested datasets get `metadata_modified` bumped daily (all top 20 on 2026-09-25 had
  06:47 local), so "recently modified" is noisy. Better signals: `extras` key `GeoPortal Last Modified Date`,
  resource `last_modified`, or `sort=metadata_created%20desc` for new datasets (VERIFIED; newest created
  2026-06-01 `bestattungsbezirke`).
- Atom feed: `GET https://opendata.muenchen.de/feeds/dataset.atom` -> **VERIFIED** ("Recently created or updated
  datasets", paged with `?page=`).
- Useful filters: `fq=organization:{org-name}` (e.g. `statistisches-amt`), `fl=name,title,metadata_modified`.

Sample (`package_search`, one result, truncated):
`{"success": true, "result": {"count": 337, "results": [{"name": "opendata_radentscheid_line", "metadata_modified":
"2026-09-25T06:47:20.285621", "organization": {"name": "mobilitaetsreferat", ...}, "license_id": "dl-by-de/2.0",
"num_resources": 7, "extras": [{"key": "GeoPortal Last Modified Date", "value": "2026-05-27T14:39:11"}, ...], ...}]}}`

TTL: 1 h (a daily run is enough).

---

## 10. Kita and school data (opendata.muenchen.de)

### 10.1 Kindertagesbetreuungseinrichtungen in München

Status: **VERIFIED**. `GET https://opendata.muenchen.de/api/3/action/package_show?id=kindertagesbetreuungseinrichtungen-in-muenchen`

- Organization `referat-fur-bildung-und-sport`, `license_id: "dl-by-de/2.0"`, frequency EU code `ANNUAL_2`
  (semiannual), metadata_modified 2026-04-10.
- Resources:
  - CSV (221,475 B, last_modified 2026-04-10, datastore active, resource id `b6e9a48f-4892-47c4-ae97-37d1bc7ec993`):
    https://opendata.muenchen.de/dataset/21d97a9e-1e94-4a0c-86d1-3c1539bcb18b/resource/b6e9a48f-4892-47c4-ae97-37d1bc7ec993/download/open_data-kitas_2026_04_09.csv
  - PDF list: https://opendata.muenchen.de/dataset/21d97a9e-1e94-4a0c-86d1-3c1539bcb18b/resource/95df96e6-d23a-44d2-b502-696e814b367c/download/open_data_kitas_2026_04_09.pdf
- Format: UTF-8 without BOM, comma-separated, CRLF, some fields quoted. The file name contains the export date,
  so always resolve the URL via `package_show`.
- Rows: 1,570 facilities plus 1 junk trailing line containing only a control character (skip rows without `Ort`).
- Columns (13): `Trägerschaft`, `Name Einrichtung`, `Einrichtungsart`, `Straße`, `Haus-nr.`, `Hausnummern-zusatz`,
  `PLZ`, `Ort`, `Stadtbezirk Name`, `Stadt-bezirknr.`, `Geokoordinaten Breite`, `Geokoordinaten Länge`, `ID Einrichtung`.
- Values: Trägerschaft `Freier Träger` 1,113 / `LHM` 457; Einrichtungsart `HAUS_FUER_KINDER` 743, `KINDERKRIPPE` 338,
  `KINDERGARTEN` 333, `HORT` 114, `TAGESHEIM` 42; Stadtbezirk 1 to 25; `ID Einrichtung` unique.
- **Coordinates: yes**, WGS84 decimal degrees (`Geokoordinaten Breite` = lat 48.06 to 48.22,
  `Geokoordinaten Länge` = lon 11.39 to 11.71), filled for all rows. Some addresses are a `Postfach`.
- No capacity or free places (the kita finder+ portal is not an API).

```
Trägerschaft,"Name Einrichtung",Einrichtungsart,Straße,Haus-nr.,Hausnummern-zusatz,PLZ,Ort,"Stadtbezirk Name",Stadt-bezirknr.,"Geokoordinaten Breite","Geokoordinaten Länge","ID Einrichtung"
LHM,"Haus für Kinder Franz-Nißl-Str. 57",HAUS_FUER_KINDER,Franz-Nißl-Str.,57,,80999,München,Allach-Untermenzing,23,48.189691,11.4548284,18993
```

- Datastore query (VERIFIED): `GET https://opendata.muenchen.de/api/3/action/datastore_search?resource_id=b6e9a48f-4892-47c4-ae97-37d1bc7ec993&filters={"Stadt-bezirknr.":"1"}&limit=2`
  (URL-encode the JSON) -> `total` 27. Datastore field names are transliterated (`Tragerschaft`, `Strasse`,
  `Geokoordinaten Lange`) and numeric columns are typed `numeric`.

TTL: 7 d.

### 10.2 Schulen und Schüler*innenzahlen in München

Status: **VERIFIED**. `GET https://opendata.muenchen.de/api/3/action/package_show?id=schulen-und-schuelerzahlen-in-muenchen`

- Organization `referat-fur-bildung-und-sport`, `license_id: "dl-by-de/2.0"`, metadata_modified 2026-08-10.
- 6 CSV resources, one per school year (all datastore active):

| School year | URL |
|---|---|
| 2025/26 | https://opendata.muenchen.de/dataset/4e7880e0-c91a-4f17-8e0f-9cd8e7d7215f/resource/5cfa8362-2dc5-43a1-8e17-62eafccd9729/download/schulen_schuelerzahlen_schuljahr_2025_26.csv |
| 2024/25 | https://opendata.muenchen.de/dataset/4e7880e0-c91a-4f17-8e0f-9cd8e7d7215f/resource/5f9b7f67-3e41-4ef7-8573-e1ae4c2952fa/download/schulen_schuelerzahlen_schuljahr_2024_25.csv |
| 2023/24 | https://opendata.muenchen.de/dataset/4e7880e0-c91a-4f17-8e0f-9cd8e7d7215f/resource/a9d6fe38-bd56-4128-979e-704b015eb9dd/download/schulen_schuelerzahlen_schuljahr_2023_24.csv |
| 2022/23 | https://opendata.muenchen.de/dataset/4e7880e0-c91a-4f17-8e0f-9cd8e7d7215f/resource/df83f3e3-57d5-40e3-b4ec-9f49a604ccd2/download/schulen_schuelerzahlen_schuljahr_2022_23.csv |
| 2021/22 | https://opendata.muenchen.de/dataset/4e7880e0-c91a-4f17-8e0f-9cd8e7d7215f/resource/3eff771f-5dca-41d6-b4ec-7d323905ee91/download/bearbeitet-opendata_rbs_a_b_schulen_schuelerzahlen-sj-2021_22.csv |
| 2020/21 | https://opendata.muenchen.de/dataset/4e7880e0-c91a-4f17-8e0f-9cd8e7d7215f/resource/00e6fc97-7613-4151-a067-1ecb1920f50d/download/bearbeitet-opendata_rbs_a_b_schulen_schuelerzahlen.csv |

- Each file: UTF-8 with BOM, about 640 bytes, 15 rows (one per school type), 5 columns:
  `Schularten`, `Anzahl_staedtischer_Schulen`, `Anzahl_staatlicher_Schulen`, `Anzahl_staedtischer_Schueler`,
  `Anzahl_staatlicher_Schueler` (the 2025/26 header has stray spaces: `Anzahl_ staatlicher_ Schueler`; normalize headers).
- **No per-school records, no addresses, no coordinates.** Category labels change between years
  (e.g. 2020/21 "Fachschulen Handwerkerhof" vs 2025/26 "Meisterschulen am Ostbahnhof").
- No school-location dataset was found on the portal (`package_search?q=schule` returns 4 datasets: this one and
  three Indikatorenatlas Grundschüler*innen datasets).

```
Schularten,Anzahl_staedtischer_Schulen,Anzahl_staatlicher_Schulen,Anzahl_staedtischer_Schueler,Anzahl_ staatlicher_ Schueler
Grundschulen,0,142,0,46941
Realschulen,20,5,10295,3756
```

TTL: 30 d.

---

## 11. Statistics: Indikatorenatlas and Monatszahlen (organization `statistisches-amt`)

Status: **VERIFIED**.

CKAN queries (all VERIFIED, add `fl=name,title,metadata_modified` to slim the response):

- All statistics datasets (102): `https://opendata.muenchen.de/api/3/action/package_search?fq=organization:statistisches-amt&rows=1000`
- Indikatorenatlas (68, all titles start with "Indikatorenatlas:"):
  `https://opendata.muenchen.de/api/3/action/package_search?fq=organization:statistisches-amt&q=title:Indikatorenatlas&rows=1000`
- Monatszahlen (19): `https://opendata.muenchen.de/api/3/action/package_search?fq=organization:statistisches-amt%20AND%20name:monatszahlen*&rows=1000`

In the 5 datasets inspected (3 Indikatorenatlas, 2 Monatszahlen) there is one CSV resource (datastore active),
`license_id: "dl-by-de/2.0"` and frequency `ANNUAL_2`; expect the same for the others but check per package.
Resolve CSV URLs via `package_show` (file names embed the export date, e.g. `indikat_2605..._18_05_26.csv`).
Background info pages: https://opendata.muenchen.de/pages/indikatorenatlas and https://opendata.muenchen.de/pages/monatszahlen-monitoring

### 11.1 Indikatorenatlas CSV structure (3 files checked)

| Dataset (`package_show?id=`) | Rows | Years | Ausprägung values |
|---|---|---|---|
| `indikatorenatlas-bevoelkerung-durchschnittsalter-83r65mct` | 2,028 | 2000-2025 | deutsch, nichtdeutsch, insgesamt |
| `indikatorenatlas-verkehr-motorisierungsgrad-personenkraftwagen-83r65mct` | 1,352 | 2000-2025 | insgesamt, privat |
| `indikatorenatlas-kinderbetreuung-altersgruppen` | 1,482 | 2007-2025 | bis 2 Jahre, 3 bis 7 Jahre (ohne Schulkinder), 5 bis 13 Jahre (Schulkinder) |

CSV URL example: https://opendata.muenchen.de/dataset/9b072087-6098-4558-b221-01e7d119b512/resource/9177f886-7341-49d2-9bfa-15d4d8631327/download/indikat_2605bevoelkerung_durchschnittsalter_18_05_26.csv

- UTF-8 without BOM, comma-separated, every field double-quoted, decimal point `.`.
- Columns: `Indikator`, `Ausprägung`, `Jahr`, `Raumbezug`, `Indikatorwert`, `Basiswert 1`, `Basiswert 2`,
  `Name Basiswert 1`, `Name Basiswert 2`. The info page says files carry up to five base values, so a loader must
  accept `Basiswert N` / `Name Basiswert N` for N = 1..5.
- `Raumbezug`: `Stadt München` or `NN Name` for the 25 Stadtbezirke, e.g. `01 Altstadt - Lehel`,
  `02 Ludwigsvorstadt - Isarvorstadt`, `04 Schwabing - West`. Names use " - " spacing, unlike other datasets
  (Kita CSV: `Altstadt-Lehel`), so join on the 2-digit code. All three sampled files contain exactly these 26 units;
  no Stadtbezirksteile. The info page says only Arbeitsmarkt and Kinderbetreuung indicators exist at
  Stadtbezirksteil level (split at 2011 into old and new district layout), but the sampled Kinderbetreuung file
  only had Stadtbezirke.

```
"Indikator","Ausprägung","Jahr","Raumbezug","Indikatorwert","Basiswert 1","Basiswert 2","Name Basiswert 1","Name Basiswert 2"
"Durchschnittsalter","deutsch","2025","Stadt München","42.2","47210399","1119494","Summe (Alter in Jahren * Hautwohnsitzbevölkerung im jeweiligen Altersjahr) (deutsch)","Hauptwohnsitzbevölkerung (deutsch)"
"Durchschnittsalter","deutsch","2025","01 Altstadt - Lehel","42.1","656393","15583","...","Hauptwohnsitzbevölkerung (deutsch)"
```

Stadtbezirksteil codes (for other datasets and joins): format `NN.N`, e.g. `01.1`.

- Dataset `bevoelkerung-stadtbezirksteile-muenchen` (VERIFIED): CSV
  https://opendata.muenchen.de/dataset/15aa8720-cd0c-45db-ba37-d90924a9dc5c/resource/ffcdc8ec-1fc4-4186-9fbf-9114448e80a7/download/bevoelkerung_hws_2017_12_stadtbezirksteile_korr_ohne_btnamen.csv
  (UTF-8 BOM, 108 rows, columns `Stadtbezirk`, `Bezirksteilnummer`, `Hauptwohnsitzbevölkerung im Dezember 2017`; no Bezirksteil names).
- GeoPortal WFS layer `gsm_wfs:vablock_bezirksteil` (CKAN `vablock_bezirksteil_opendata`), CSV output VERIFIED:
  `https://geoportal.muenchen.de/geoserver/gsm_wfs/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gsm_wfs:vablock_bezirksteil&outputFormat=csv`
  (944 KB, 110 features, columns `FID`, `bt_nummer`, `flaeche_qm`, `shape` as WKT polygon; coordinates look like
  ETRS89 / UTM 32N, CRS not verified; no names). GeoJSON: same URL with `outputFormat=application/json`.

### 11.2 Monatszahlen CSV structure

Example `monatszahlen-verkehrsunfaelle` (VERIFIED): https://opendata.muenchen.de/dataset/5e73a82b-7cfb-40cc-9b30-45fe5a3fa24e/resource/40094bd6-f82d-4979-949b-26c8dc00b9a7/download/verkehrsunfaelle.csv

- 2,450 rows; `MONATSZAHL`: Verkehrsunfälle, Alkoholunfälle, Fluchtunfälle; `AUSPRAEGUNG`: insgesamt,
  Verletzte und Getötete, mit Personenschäden; `JAHR` 2000-2026.
- Columns: `MONATSZAHL`, `AUSPRAEGUNG`, `JAHR`, `MONAT`, `WERT`, `VORJAHRESWERT`, `VERAEND_VORMONAT_PROZENT`,
  `VERAEND_VORJAHRESMONAT_PROZENT`, `ZWOELF_MONATE_MITTELWERT`.
- `MONAT` is `YYYYMM` or `Summe` (annual total row); missing values are the string `NA` (e.g. future months of the
  current year); latest non-NA month in this file: 202512 (upload 2026-05-18). City level only, no spatial column.
- `monatszahlen-bevoelkerung` (checked via datastore): identical columns; the datastore stores values as text.

```
"MONATSZAHL","AUSPRAEGUNG","JAHR","MONAT","WERT","VORJAHRESWERT","VERAEND_VORMONAT_PROZENT","VERAEND_VORJAHRESMONAT_PROZENT","ZWOELF_MONATE_MITTELWERT"
"Verkehrsunfälle","insgesamt",2025,"202501",3171,2978,-3.82,6.48,3526
"Verkehrsunfälle","insgesamt",2025,"Summe",44764,42122,NA,6.27,NA
```

Datastore access (VERIFIED): `datastore_search?resource_id={id}&filters={"MONAT":"202512"}`;
`datastore_search_sql` with `SELECT DISTINCT "Raumbezug" FROM "{resource_id}"` works; a `GROUP BY` query returned
HTTP 503 once, so avoid heavy SQL and prefer downloading the CSV.

Generic loader sketch:

- Indikatorenatlas: key (`Indikator`, `Ausprägung`, `Jahr`, `Raumbezug`); split `Raumbezug` into
  `code` (`00` for "Stadt München", else the leading 2 digits) and `name`; parse `Indikatorwert` as float;
  collect `Basiswert N` with its `Name Basiswert N` into a list for N = 1..5.
- Monatszahlen: key (`MONATSZAHL`, `AUSPRAEGUNG`, `MONAT`); `MONAT == "Summe"` is the annual total for `JAHR`;
  map `NA` to null; parse numbers as float.

TTL: 7 d (updates are monthly to yearly; check `metadata_modified` of the package first).

---

## Summary

Verified and usable without keys: RIS RSS feeds (15 types, including per-Referat, per-committee, per-person and
per-session feeds), RIS iCal, direct PDF URLs and a GET search with document full text; München Transparent OParl
(current to the minute, but only via body-scoped list URLs; its full-text search is down); PVOG Suchdienst on the new
host pvog.fitko.net (old host is gone); both it@M Hugging Face datasets; SWM occupancy via the new
`/.rest/bath/visitorCount` endpoint (ticos works on `counter.ticos-systems.cloud` without the tenant header, old host
dead); machmuenchenbesser Open311 under `/api/georeport/v2/`; Stadtbibliothek OAI-PMH (sets, from/until, GetRecord);
Rathaus Umschau RSS, muenchen.de `rss.xml`, MVG JSON messages, CKAN search and Atom; Kita CSV with coordinates;
school statistics (aggregates only); Indikatorenatlas and Monatszahlen CSVs.

Not working or not verified: AWM calendar (needs a scripted POST session; not executed under the GET-only rule),
library OPAC availability (session and POST based), feeds for stadt.muenchen.de news and MVG press releases.

Legal caveats: only machmuenchenbesser and library metadata (CC0), open data portal datasets (dl-by-de/2.0) and the
Hugging Face sets (MIT) carry open licenses. RIS and muenchen.de content fall under the city imprint (official works
free under §5 UrhG, others need consent; press releases reusable with attribution), and RIS robots.txt blocks AI
crawlers by name. SWM forbids data use without written consent, and MVG only tolerates moderate private,
non-commercial use (no data mining).
