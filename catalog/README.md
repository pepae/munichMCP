# Source catalog

Every data source munichMCP uses has one manifest here: `catalog/<id>.yaml`. The manifest says who publishes the data, under which licence, how munichMCP uses it, and how to tell that it still works.

```
catalog/<id>.yaml ──► generic adapter (no code)  ──► find_nearby category
                  └─► kind: code ──► src/sources/*.ts + src/tools/*.ts
                  └─► checks ──► daily health run ──► /status ──► weekly source doctor
```

## Add a source

**Without writing code.** Point data in a CSV on the open data portal, or a GeoPortal WFS layer, only needs a manifest. See [`ratschbankerl.yaml`](ratschbankerl.yaml) (CSV) and [`accessible-glass-containers.yaml`](accessible-glass-containers.yaml) (WFS). Templates in field values: `"Ratschbankerl {standort}"` fills in a column, a bare `standort` takes the column as is.

**With code.** Anything else gets a module in `src/sources/`, a tool in `src/tools/`, an entry in `src/lib/sources.ts`, and a manifest with `implementation.kind: code` that documents and monitors it.

**Or let the agent do it.** Propose the source with the `propose_data_source` tool from any connected assistant, or open a "New data source" issue. A maintainer labels it `intake-agent`, the intake agent ([`agents/source-intake.md`](../agents/source-intake.md)) checks the licence, explores the data, writes the manifest and checks, verifies everything and opens a pull request. A maintainer reviews and merges; the deploy workflow puts it live and runs the end-to-end tests.

## Checks

Every manifest needs at least one check; generic sources also need a known-answer check.

| Type | What it catches |
|---|---|
| `http` | Endpoint down or moved; `expect_text` catches a changed response |
| `ckan` | Dataset gone, **licence changed** (`licence_id`), **stale** (`max_age_days`), **schema drift** (`columns`) |
| `wfs` | Map layer gone or emptied (`min_features`) |
| `tool` | **Silently wrong answers**: asks munichMCP a question with a known answer, e.g. "Marienplatz 8 is in district 1" |

```bash
npm run catalog:validate                         # schema and consistency, no network
npm run check-sources                            # all checks against the public server
npm run check-sources -- --url http://localhost:8420/mcp --only ratschbankerl
```

The server runs the same checks daily (`HEALTH_INTERVAL_HOURS`) and publishes them at `/status` and `/status.json`. The weekly source doctor ([`agents/source-doctor.md`](../agents/source-doctor.md)) turns failures into repair pull requests or issues.

## Credentials

A manifest never contains a key. `auth.secret_env` names an environment variable; a maintainer stores the value in the deployment's secret store (the server's `.env`, GitHub environment secrets). Proposals that contain something looking like a key are rejected automatically.
