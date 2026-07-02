<p align="center">
  <img src="mockingbird-logo.png" alt="Mockingbird" width="180" />
</p>

<h1 align="center">Project Mockingbird</h1>

<p align="center">
  A YAML-backed local Sitecore for SitecoreAI. Edit, serialize, and serve content from disk. No CM container required.
</p>

## Why

SitecoreAI moved the CM role to the cloud. The classic local-dev loop (run a CM locally, serialize through SCS, branch / PR / merge) went with it.

You can still spin up a CM container - the official images work - but they're heavy: multi-GB on disk, SQL Server + Solr alongside, minutes to boot, gigabytes of RAM at idle. Pointing local rendering at prod Edge instead couples your inner loop to a shared service somebody else owns.

Mockingbird is the third option. It reads your repo's SCS (Sitecore Content Serialization) YAML directly, exposes the same `layout(site, routePath, language)` GraphQL shape a head app already calls against Edge, and lets you author items through a Web UI, CLI, PowerShell module, or package builder - with byte-faithful round-trips, so git diffs against `dotnet sitecore`-written files stay clean.

## Is this like running Sitecore CM in Docker?

Sort of. In the same way a bicycle is like a car. Both move you down the road; the difference is what's underneath.

A Sitecore CM container is the real thing: SQL Server, Solr, the full Sitecore back-end, the Content Editor, workflow, security, the Experience Editor, the rules engine, all of it. It's also multi-GB on disk, several minutes to boot, gigabytes of RAM at idle, and it usually wants Windows containers or one of the SitecoreAI image variants. If you need any of the CM-only features, run the CM container.

Mockingbird is a YAML-first shim. It does the parts of CM that matter for the local development loop - read the items in your repo, expose them via REST + GraphQL, render layouts with the Edge query shape, let you edit fields and templates and serialize the result back to disk - without running a database or reimplementing the back-end. The image is ~735 MB (alpine + Node + a baked pwsh runtime for the in-browser ISE). It boots in under 20 seconds and asynchronously parses your YAML in the background. It runs on Linux containers. It handles tens of thousands of items on a developer laptop without breaking a sweat.

The two are not mutually exclusive. Most teams running Mockingbird still have a CM upstream (UAT, production); Mockingbird is the local-loop tool, and the SCS YAML it reads and writes is the same format the upstream CM authors with `dotnet sitecore ser pull`. Pull from upstream, work locally, commit to source control, ship.

## Features

A few worth calling out:

- **GraphQL Layout Service.** Experience Edge-shaped endpoint at `/sitecore/api/graph/edge` matching the headless layout query, so existing rendering hosts and Sitecore tooling can target Mockingbird with just a host swap. Browseable GraphiQL UI at `/graphiql` for ad-hoc query authoring.
- **Multi-tab content tree.** A familiar tree view at `/tree` with a horizontal 2-pane split: per-pane tab strip, drag-to-resize handle, "Split right" / "Move to other pane" on tab right-click, "Open in new tab" from the tree, dirty-state confirm when closing a tab with unsaved field edits, and tabs persisted across reloads via localStorage.
- **Runtime layer management.** Each project is a stack of layers - each layer a `sitecore.json` reference with a name, color, and visibility toggle. Add, remove, or replace layers from the project sidebar without restarting the container. The engine merges layers via SCS `allowedPushOperations` strength (CreateOnly < CreateAndUpdate < CreateUpdateAndDelete) on every reopen. Projects sync to a team-shared `config.mockingbird` at the workspace root; the per-user auto-restore-on-load toggle stays in browser localStorage.
- **Field editors for the standard Sitecore field types.** Single-line / multi-line text, rich text, lookup / multilist / treelist (with GUID resolution to readable names), name value list, name lookup value list, password, number, integer, datetime (with a calendar picker), checkbox, image (with the Media Picker dialog), rendering / layout, file. The shapes match what `dotnet sitecore` would write back.
- **SXA Headless scaffolding.** Right-click `/sitecore/content` -> Insert -> Headless Site Collection to scaffold a tenant with the standard cross-cutting folder structure under each Project root (Templates, Media, Placeholder Settings, Renderings, Settings, Branches). Right-click a tenant -> Insert -> Headless Site to scaffold a site with JSSSettings, Site Definition, and StartItem auto-wired. The mechanism is a faithful TypeScript port of Sitecore's SPE scaffolding scripts (Add-JSSTenant + New-JSSSite + the Invoke-* action pipeline); curated definition items ship in the registry so the dialog is functional on a fresh install, and authors can extend the catalogue by adding Definition Items to their content tree.
- **Image Media Picker dialog.** Pick an image from the site's media library (site-scoped via `query:$siteMedia`) with a filterable tree picker, thumbnail preview, alt text, dimensions (Keep Aspect Ratio with auto-recompute), and spacing fields. Round-trips to the same XML attribute set Sitecore persists.
- **Sitecore Package Builder.** Right-click any item in the tree to add a single item, a subtree, or a path-rooted predicate to the package cart. The cart panel summarizes sources and total item count; checkout produces a Sitecore-installable `.zip` in the standard Sitecore-3.x package format (`installer/version` + `metadata` + `items/master/` + `properties`). Drop the zip into the Package Installer on a real CM and the items land.
- **REST API.** CRUD over items, validation, schema introspection, template-schema lookups, and descendants by path.
- **CLI.** `mockingbird init / validate / tree / info / create / move / delete` for scriptable one-shot operations.
- **PowerShell scripting.** In-browser ISE at `/scripts` with Monaco + xterm. The `Mockingbird` PowerShell module is auto-imported and exposes a familiar set of cmdlets (`Get-Item`, `Set-ItemField`, `New-Item`, `Find-Item -Where { ... }`, `Get-ItemTemplate`, `Get-ItemReference`, etc.) backed by a `master:` PSDrive. Dry-run by default; flip `-Apply` to commit.
- **Byte-faithful SCS round-trip.** Custom Rainbow-grammar parser + writer so edits through the Web UI, CLI, or PowerShell produce the same bytes `dotnet sitecore` would have written (leading whitespace preserved, Rainbow quoting rules, UTF-8 BOM + CRLF by default). The parser is a bug-compatible port of `Sitecore.DevEx.Serialization.Client.YamlReader`; the writer matches `Rainbow.Storage.Yaml.YamlWriter.WriteMapInternal` byte-for-byte.
- **SXA layout resolution + Page Designs.** Page Design composition (partial designs + page-level renderings, merged in that order), template mapping via the `TemplatesMapping` field on `<siteParent>/Presentation/Page Designs`, per-item `Page Design` field overrides, `local:` datasources scoped to the owning partial design, dynamic-placeholder normalization, and declared-keys-aware orphan-rendering pruning.
- **Async indexing.** The API answers `503 {status:"indexing",progress}` while parsing; `/api/status` reports `scanned/total` and is always ungated. Container startup is under 20s even on a large content tree.
- **Persistent index cache.** Gzipped parsed tree per layer at `<workspace>/.mockingbird/cache/index-<sha1>.json.gz`; warm-cache restart in ~60s on unchanged content. A post-ready signature verifier deletes the cache and rebuilds on the next boot if it detects drift from disk.
- **OOTB registry baked in.** Sitecore's standard templates, renderings, and settings (tens of thousands of items, ~1 MB compressed) ship in the image so your content items can reference them without an external CM.

## Quick start

```bash
docker compose up -d
```

Mockingbird boots with the OOTB Sitecore registry loaded but no serialized items. Open `http://localhost:3333` and the first-run wizard lets you browse the workspace mount, pick a `sitecore.json` to use as a layer, and stack additional layers into a named project.

By default the compose mounts the directory you ran it from (`./`) at `/workspaces` inside the container. To point at a broader directory so the wizard can browse multiple repos, set `MOCKINGBIRD_WORKSPACE` in `.env`:

```
MOCKINGBIRD_WORKSPACE=C:/projects   # Windows
MOCKINGBIRD_WORKSPACE=~/code         # macOS / Linux
```

> **Pin the version in shared environments.** `:latest` is fine for a quick local kick of the tires, but in CI or any team-shared compose file, set `MOCKINGBIRD_IMAGE=projectmockingbird/mockingbird:0.13.0` in `.env` so a Hub republish doesn't move the floor.

## Project registry: `config.mockingbird`

Mockingbird stores the saved-projects list in a workspace-local file:

    ./config.mockingbird

Each saved project is a named, ordered stack of layers - each layer is a reference to one `sitecore.json` in the workspace, with a display name, color, and visibility toggle. The file lives at the workspace root. **Commit it.** Anyone who clones the repo and runs mockingbird gets the team's saved projects in the "Open existing project" wizard for free - no per-developer setup needed.

The file is plain JSON. Mockingbird reads it on startup via `GET /api/config` and writes it back via `PUT /api/config` whenever the project list changes.

### Per-developer session state: `config.mockingbird.local`

Per-developer ephemeral state - which project this dev currently has open (`lastOpenedHash`) and when they last opened each project (`lastOpenedAt`) - lives in a sibling file next to the tracked one:

    ./config.mockingbird          # team-shared, commit it
    ./config.mockingbird.local    # per-developer, gitignore it

The split exists so team members don't stomp on each other with constant churn in `lastOpenedAt` / `lastOpenedHash`. Add `config.mockingbird.local` to your repo's `.gitignore`. Mockingbird reads both files and merges them when serving `GET /api/config`; `PUT /api/config` writes per-dev fields back into the `.local` file only.

### Cache: `.mockingbird/cache/`

Engine cache artifacts live under `.mockingbird/cache/` in the workspace mount.
On first cache write, mockingbird:
- creates `.mockingbird/cache/.gitkeep`
- appends `.mockingbird/` to root `.gitignore` (idempotent)

This is purely transient state. Safe to delete; rebuilds on next open. If you have an orphaned `mockingbird-cache` Docker volume from an older setup (back when the cache lived in a named volume), reclaim it with `docker volume rm mockingbird-cache`.

### Per-user preferences (auto-restore, theme, etc.)

Some settings stay per-user in browser localStorage: theme, sidebar collapsed state, panel sizes, auto-restore toggle. The "last opened project" pointer that auto-restore replays lives server-side as `lastOpenedHash` in `config.mockingbird.local`, so a fresh browser - or a headless consumer - reopens the right project. The browser-local settings are intentionally NOT shared via `config.mockingbird` since they don't make sense across the team.

## Endpoints

| What | URL |
|---|---|
| Web UI launcher | `http://localhost:3333/` |
| Multi-tab content tree | `http://localhost:3333/tree` |
| GraphiQL (browseable GraphQL UI) | `http://localhost:3333/graphiql` |
| GraphQL Layout Service | `http://localhost:3333/sitecore/api/graph/edge` |
| In-browser PowerShell ISE | `http://localhost:3333/scripts` |
| REST item tree | `http://localhost:3333/api/tree` |
| Async-indexing status | `http://localhost:3333/api/status` |

The GraphQL endpoint mirrors Experience Edge's route convention - it accepts the `sc_apikey` query param (the value is ignored) and supports both `GET` with a query string and `POST` with a JSON body, so any tool already configured for Edge can target Mockingbird with just a host swap.

### `/api/status` response shape

Always-ungated readiness probe. Returns 200 the moment Fastify is listening - even before YAML indexing completes, which makes it suitable as a Docker `HEALTHCHECK` target.

```json
{
  "state": "initializing" | "ready" | "error" | "no-project",
  "progress": { "scanned": 0, "total": 0 },
  "error": null,
  "itemCount": 0,
  "registryLoaded": true,
  "cacheStale": false
}
```

| Field | Meaning |
|---|---|
| `state` | `initializing` while parsing, `ready` once the tree is queryable, `error` on a fatal init failure, `no-project` when booted without a workspace (Open Repository mode) |
| `progress` | Live scan counter; populated during `initializing` |
| `error` | Error message string when `state` is `error`, otherwise `null` |
| `itemCount` | Total parsed-tree items once `state` is `ready` (zero before) |
| `registryLoaded` | `true` when the baked OOTB Sitecore registry was loaded successfully |
| `cacheStale` | Set to `true` when the post-ready signature verifier detects the served-from-cache tree drifted from on-disk YAML. The cache file is deleted at that point so the next start rebuilds, but the in-memory tree continues to serve the stale snapshot for the rest of the session. |

### API error semantics

| Status | Meaning | Examples |
|---|---|---|
| `2xx` | Success | `200` for queries, `201` for newly-created items |
| `4xx` | Caller error | `400` malformed request body or missing required field; `404` item id / path not found |
| `5xx` | Engine fault | `500` engine throw, validation panic, write-file failure (PUT and trim-versions snapshot a draft and only commit on a successful write, so a 5xx from those routes leaves the in-memory tree unchanged) |
| `503` | Indexing in progress | All `/api/*` routes return this with `{status:"indexing", progress:{scanned, total}}` until the engine reaches `ready`. `/api/status` itself is exempt and always 200. |

## Best Practices

- **Pin a specific image tag in any shared environment.** `:latest` for a quick local poke is fine; in CI, dev environments, and team-shared compose files, set `MOCKINGBIRD_IMAGE` in `.env` to a specific version (`projectmockingbird/mockingbird:0.13.0` at the time of writing).
- **Commit serialized YAML alongside the code that depends on it.** Author items in Mockingbird, let the file watcher emit clean YAML, and PR the YAML alongside the React / Next.js changes that consume it. Reviewers see the item changes in the diff.
- **One `sitecore.json` per layer.** Each layer points at one `sitecore.json` and resolves modules relative to its own dir, matching `dotnet sitecore ser pull` semantics. A project is a stack of layers - common shapes are one layer (single repo) or two (e.g. a tenant template layer + a content layer) - merged at open time via SCS `allowedPushOperations` strength (CreateOnly < CreateAndUpdate < CreateUpdateAndDelete).
- **Treat the cache as disposable.** `.mockingbird/cache/index-*.json.gz` are derived artifacts; they rebuild from your YAML on the next boot. Safe to delete at any time, gitignored by default, safe to skip backing up.
- **Use the Package Builder to ship a slice upstream.** Browse to a subtree, right-click `Add to Package`, check out, and the resulting `.zip` installs in a real Sitecore CM via the standard Package Installer. Useful for promoting a developer's locally-authored items to a UAT instance without serializing through the upstream pipeline.

## Pitfalls

- **Mockingbird isn't a full Content Editor.** Parity with the CM back-end isn't the goal; the local-dev loop is. Workflow, security, the Experience Editor, Personalization rules, locking, and the rules engine aren't here today. Some may show up in future cycles, others probably won't. If you need one of them right now, run the CM container alongside.
- **Hostname routing requires real Site Grouping items in your content tree.** With a synthetic single-site setup (`SITE_ROOT_PATH=/sitecore/content/<tenant>/<site>/Home` and no Site Grouping items), the head app must pass the derived site name as `?site=<site>`, or the resolved-site lookup falls through to the synthetic fallback.
- **Image upload isn't shipped yet.** The Media Picker dialog can pick from existing media items; uploading new media + emitting the BLOB sidecars Sitecore expects is on the roadmap. For now, add new media via `dotnet sitecore` or your upstream CM and Mockingbird will pick them up on the next reindex.
- **Compose binds the port to loopback.** The default `docker-compose.yml` binds `127.0.0.1:3333` so Mockingbird isn't accidentally exposed to a coffee-shop / hostile LAN. To reach it from another device on a trusted LAN, drop the `127.0.0.1` prefix on the `ports:` line.

## GraphQL API

Four root queries are exposed:

| Query | Purpose |
|---|---|
| `layout(site, routePath, language)` | Resolved layout for a route - the headless layout query shape |
| `item(path, language)` | Single item by Sitecore path |
| `search(where, first, after)` | Item search with paging (`AND`-clause `SearchWhere`) |
| `site` | Site-grouping introspection (resolved sites + per-site root paths) |

Items expose `id`, `name`, `path`, `template { id name baseTemplates }`, `url`, `field(name)`, and `children(...)`. The `field` resolver returns typed views (`value`, `jsonValue`, `boolValue`, `numberValue`, `dateValue`, `targetItem`, `targetItems`) so a client can pick the shape that matches the field's data type.

Open `/graphiql` in a browser to explore the schema, autocomplete queries, and run them against your local content tree. Example queries:

```graphql
# Resolved page layout - headless layout shape, returned as a single JSON blob
query {
  layout(site: "your-site", routePath: "/", language: "en") {
    item { rendered }
  }
}

# Single item with selected fields
query {
  item(path: "/sitecore/content/your-site/Home", language: "en") {
    id
    name
    template { id name }
    field(name: "Title") { value }
  }
}
```

## Connecting a head app

Mockingbird's `layout` query is shape-compatible with Sitecore's headless layout query, and the `sitecore` query namespace lines up with Experience Edge's. Most apps written for Edge can point at Mockingbird by changing two config values: the GraphQL endpoint URL, and (if your tooling sends one) the API key.

### Endpoint URL

Point your head app at:

```
http://localhost:3333/sitecore/api/graph/edge
```

This is the same path Experience Edge serves on, so a head app already wired for Edge needs only a host swap. Both `GET` with query-string and `POST` with a JSON body are accepted.

### API keys

Mockingbird does not check `sc_apikey`. The endpoint accepts the param so existing configs don't 401, but the value is ignored. Don't ship a real Edge key in your dev `.env`; use an obviously fake placeholder so it's clear at a glance which environment a config is targeting.

### Site resolution

The `layout(site, routePath, language)` query takes a `site` name. Mockingbird resolves it in this order:

1. `?site=` query param on the request, matched against real Site Grouping items in the content tree
2. `Host:` header, matched against each Site Grouping's `HostName` field
3. Synthetic fallback: a single site whose `name` is derived from the penultimate segment of `SITE_ROOT_PATH` and whose `hostname` is `*`

If the head app already passes a `site` variable that matches one of your Site Grouping items, no further config is needed. For single-site dev with no Site Grouping items in the content tree, set `SITE_ROOT_PATH` to `/sitecore/content/<tenant>/<site>/Home` and use the derived site name (the penultimate segment, here `<site>`) in your queries.

### Cross-origin development

If the head app's dev server runs on a different origin than Mockingbird (typical: head app on `:3000`, Mockingbird on `:3333`), browser fetches will be CORS-rejected by default. The `MOCKINGBIRD_ALLOWED_ORIGINS` env var (comma-separated origins) controls the allowlist. The default compose doesn't wire it through, so set it via a `docker-compose.override.yml`:

```yaml
services:
  mockingbird:
    environment:
      MOCKINGBIRD_ALLOWED_ORIGINS: http://localhost:3000
```

Server-side fetches (route handlers, build-time queries, anything running in Node rather than the browser) bypass the browser's CORS check entirely, so the allowlist only matters when the browser is hitting Mockingbird directly.

## PowerShell scripting

Mockingbird ships pwsh + a small PowerShell module + a C# class library inside the image. The API spawns one short-lived `pwsh` child per session and pipes script frames over stdio. The launch page links to an in-browser ISE at `/scripts` (Monaco editor + xterm output).

### What's available

The Mockingbird module is auto-imported in every session and exposes:

| Cmdlet | Purpose |
|---|---|
| `Get-Item -Path /sitecore/content/...` | Read an item by Sitecore path |
| `Get-ChildItem -Path /sitecore/content/...` | List children |
| `Get-ItemField`, `Set-ItemField` | Read / write an individual field |
| `New-Item`, `Remove-Item` | Create / delete items |
| `Find-Item -Where { ... }` | Predicate search across the content tree |
| `Get-ItemTemplate`, `Get-ItemReference`, `Get-ItemReferrer` | Template + link-graph helpers |

A `master:` PSDrive mounts the content tree; `$item["FieldName"]` indexer reads typed field values.

### Dry-run by default

`Set-ItemField`, `New-Item`, and `Remove-Item` do **not** mutate the content tree unless you pass `-Apply`. Without it, each cmdlet returns a unified-diff preview of what would change. The web UI also has an Apply toggle in the top-right; the toggle and the per-cmdlet switch must both be set for writes to land. This is intentional - scripted edits against a live content tree are risky, so the default refuses to take action.

## Volumes

A single bind mount: `${MOCKINGBIRD_WORKSPACE}:/workspaces`. The host path comes from `.env`; the shipped `.env.example` defaults it to `./` (the directory you ran compose from).

Everything mockingbird needs lives under that mount:

| Path under workspace | Purpose |
|---|---|
| `sitecore.json` | SCS root config (the same file `dotnet sitecore` uses) - one per layer; the wizard's folder browser picks them as you build a project |
| `config.mockingbird` | Team-shared project registry. Commit it - new devs cloning the repo get the project list for free |
| `config.mockingbird.local` | Per-developer session state (last-opened project, last-opened times). Gitignore it - keeps team members from stomping on each other |
| `.mockingbird/cache/` | Engine-internal parsed-item index. Gitignored. Safe to delete; rebuilds on next boot |

The OOTB IARs that ship with the CM images on Docker Hub are baked into the Mockingbird image for full support - no extra mount needed.

## Environment variables

`.env` feeds host paths and the image tag into the container via `docker-compose.yml` interpolation. Copy `.env.example` to `.env` and tweak from there.

### Set in `.env`

| Variable | Purpose | Default |
|---|---|---|
| `MOCKINGBIRD_WORKSPACE` | Host path bound to `/workspaces` in the container. The first-run wizard's folder browser navigates this mount so you can pick `sitecore.json` files as project layers. | `./` |
| `MOCKINGBIRD_IMAGE` | Docker image tag pulled by compose. Pin to a specific version (e.g. `projectmockingbird/mockingbird:0.13.0`) in shared environments. | `projectmockingbird/mockingbird:latest` |
| `MOCKINGBIRD_PORT` | Host port mockingbird binds (loopback-only). Container always listens on 3333 internally. | `3333` |
| `MOCKINGBIRD_HOST` | Container's internal listener address. `0.0.0.0` so Docker's port-NAT can forward; almost never needs changing. | `0.0.0.0` |
| `COMPOSE_PROJECT_NAME` | Override the docker container name. | `mockingbird` |
| `SITE_ROOT_PATH` | Synthetic-fallback site root for single-site dev. When real Site Grouping items exist in the content tree, requests resolve via `?site=` query param > `Host:` header > this fallback. Mirrors Sitecore's `<site name="website" hostName="*"/>` default-site role. | *(empty - hostname routing only)* |

### Optional override knobs (not wired in default compose)

These engine knobs are read by mockingbird at startup but the default `docker-compose.yml` doesn't pass them through. To set any of them, drop a `docker-compose.override.yml` alongside the default compose:

```yaml
services:
  mockingbird:
    environment:
      MOCKINGBIRD_ALLOWED_ORIGINS: http://localhost:3000
      MOCKINGBIRD_GRAPHQL_QUERY_DEPTH: 30
```

| Variable | Purpose | Default |
|---|---|---|
| `MOCKINGBIRD_ALLOWED_ORIGINS` | Comma-separated origins (scheme://host[:port]) allowed for cross-origin `/api/*` requests. Empty = same-origin only. | *(empty)* |
| `MOCKINGBIRD_WS_ALLOWED_ORIGINS` | Same shape, for WebSocket upgrades on `/ws`. | *(empty)* |
| `MOCKINGBIRD_GRAPHQL_QUERY_DEPTH` | Max GraphQL query depth before mercurius rejects. | `20` |
| `MOCKINGBIRD_SPE_SESSION_TTL_MIN` | Per-session TTL for PowerShell scripting sessions, in minutes. | `30` |
| `MOCKINGBIRD_SPE_MAX_SESSIONS` | Concurrent PowerShell session cap; beyond this, new sessions return 429. | `8` |

### Container-internal (hardcoded in compose)

These are pinned values inside the compose `environment:` block; not configurable via `.env`. Listed here for reference and for anyone running mockingbird outside compose.

| Variable | Value | Purpose |
|---|---|---|
| `MOCKINGBIRD_WORKSPACE` | `/workspaces` | Container-side workspace path - distinct from the host-side `MOCKINGBIRD_WORKSPACE` in `.env` (which is the volume SOURCE; this is the volume TARGET). Read by the engine to anchor `.mockingbird/staging/` for atomic writes. |
| `MOCKINGBIRD_CONFIG_PATH` | `/workspaces/config.mockingbird` | Where the project registry lives. |
| `INDEX_CACHE_PATH` | `/workspaces/.mockingbird/cache/index.json.gz` | Persistent engine cache. |
| `PORT` | `3333` | The app's internal listen port. Container always speaks on 3333 regardless of what host port `MOCKINGBIRD_PORT` maps it to. |

## Troubleshooting

**`503 indexing in progress` on every `/api/*` request just after startup.** Expected - the engine is parsing YAML in the background. Check `/api/status` (ungated) for `progress.scanned/total`. On a slow Windows bind-mount with a large content tree this can take 5+ minutes; rebuilds with a warm `INDEX_CACHE_PATH` finish in ~60s.

**Linux container can't write to the bind-mounted workspace (`EACCES` on `.mockingbird/cache/`).** The container runs as `node` (uid/gid 1000). Make the host workspace writable by uid 1000: `sudo chown -R 1000:1000 ./.mockingbird` (or the whole workspace if you want full read/write). On Docker Desktop (Windows / Mac), uid mapping is transparent and this rarely surfaces.

**Browser fetches to `/api/*` blocked with CORS errors.** Mockingbird defaults to same-origin only. If your head app's dev server is on a different origin (e.g. head app on `:3000`, Mockingbird on `:3333`), add the head-app origin to `MOCKINGBIRD_ALLOWED_ORIGINS`. Server-side fetches (Next.js route handlers, `getStaticProps`, build-time queries) bypass the browser CORS check and are unaffected.

**`GraphQL query too deep` errors on a real client query.** Default cap is depth 20, which covers the typical `children -> results -> ... on Type` four-times-deep navigation pattern. Raise via `MOCKINGBIRD_GRAPHQL_QUERY_DEPTH` if a deeper query is genuinely needed.

**`/api/status` reports `cacheStale: true`.** The post-ready signature verifier detected the served-from-cache tree drifted from on-disk YAML. The cache file has already been deleted, so a container restart will rebuild against current disk state. The in-memory tree continues to serve the stale snapshot for the rest of the session.

**Container starts but `EADDRINUSE` on the port.** Another process is bound to the host-side `MOCKINGBIRD_PORT`. Check `netstat -ano | findstr :3333` (Windows) or `lsof -i :3333` (Linux/Mac) and stop the other process or change `MOCKINGBIRD_PORT` in `.env`.

**The image won't pull (`manifest unknown` or 404).** Confirm the tag exists: `docker pull projectmockingbird/mockingbird:0.13.0`. The Hub repo at <https://hub.docker.com/r/projectmockingbird/mockingbird/tags> lists every published tag.

**Docker build fails on `chown -R node:node /app`.** Almost always a slow bind-mount or a previous `npm install` that ran as root and left files the `node` user can't traverse. Clear the build cache (`docker builder prune`) and retry; if the problem persists, check that no `.dockerignore`-excluded path is being COPYed into stage 2.

## Architecture

Four layers, all implemented and tested:

1. **YAML Engine** (`src/engine/`) - Rainbow-grammar parser + writer, in-memory item tree, module config (`*.module.json` + `sitecore.json`), directory scanner, validation, GUID generator, file watcher, IAR registry loader, package builder (Sitecore-3.x zip emitter). The parser is a bug-compatible port of `Sitecore.DevEx.Serialization.Client.YamlReader` (itself a near-verbatim fork of `Rainbow.Storage.Yaml.YamlReader`); the writer matches `Rainbow.Storage.Yaml.YamlWriter.WriteMapInternal` byte-for-byte.
2. **CLI** (`src/cli/`) - `mockingbird init / validate / tree / info / create / move / delete` via commander.
3. **REST + GraphQL API** (`src/api/`) - Fastify + Mercurius, WebSocket for live updates, an `onRequest` hook returning `503 {status:"indexing",progress}` for `/api/*` until the engine is ready (`/api/status` exempt).
4. **Web UI** (`src/web/`) - tree view with OOTB + serialized items, database selector, Quick Info panel, field editor with GUID resolution, template builder, Image Media Picker dialog, package cart with checkout-to-zip.

### Layout Resolution Pipeline (`src/engine/layout/`)

- `rendering-xml.ts` - parse `__Final Renderings` XML to flat `RenderingEntry[]`
- `placeholder-tree.ts` - flat entries to nested placeholder tree (with dynamic-placeholder normalization and declared-keys-aware orphan pruning)
- `field-formatter.ts` - raw field values to typed headless-layout shapes
- `component-resolver.ts` - rendering GUIDs to component names, datasources to formatted fields. Uses `ownerItemPath` per-node so `local:` resolves relative to the owning partial design, not the page
- `page-design.ts` - SXA Page Design composition (partial designs + template mapping + page-level renderings)
- `route-builder.ts` - orchestrates the full pipeline

Public API: `resolveLayout(routePath, engine, { siteRootPath, mediaBaseUrl, language? })` returns `LayoutRoute | null`.

### SXA Page Design Composition

The final layout of a page is the union of:

1. **Partial-design renderings** - `<siteParent>/Presentation/Page Designs` has a `TemplatesMapping` field mapping template IDs to Page Design items. Each Page Design has a `PartialDesigns` multilist whose items each carry their own versioned `__Final Renderings` XML.
2. **Page's own renderings** - the versioned `__Final Renderings` field on the page item itself.

Merge order: **partials first, then page**. Per-item `Page Design` field overrides the `TemplatesMapping` lookup. Template-to-design lookup walks the base-template chain; first match wins.

### Async Indexing

Parsing a large SCS content tree (11,000+ items) on a slow Windows bind-mount can take 5+ minutes. The API avoids blocking on this:

- `Engine.startInit()` loads modules + registry synchronously (fast) and kicks off `indexInBackground()`
- `app.listen()` happens immediately - container responds in <20s
- `/api/*` requests return `503 {status:"indexing",progress:{scanned,total}}` until indexing completes
- `/api/status` is exempt and always 200
- `close()` during indexing is race-safe

## Contributing

```bash
# Install
npm install && (cd src/web && npm install)

# Unit tests (Vitest)
npx vitest run

# Typecheck (API side - the gate Docker enforces; src/web has its own Vite build)
npx tsc --noEmit -p tsconfig.json --rootDir src

# Run the API without Docker (set MOCKINGBIRD_WORKSPACE to your workspace root)
npm run api

# Run the CLI without Docker
npm run cli -- tree /sitecore/content

# Build the Docker image (compose template has no build: section,
# so docker build is the path - tag whatever you want and reference
# it via MOCKINGBIRD_IMAGE in .env)
docker build -t projectmockingbird/mockingbird:dev .

# For images published to Hub, build via buildx with SBOM + provenance
# attestations so Docker Scout's supply-chain card stays compliant.
# Default buildx builders use the docker driver which cannot emit
# attestations - spin up a docker-container builder per release and
# remove it when done.
docker buildx create --name attestation-builder --driver docker-container --bootstrap
docker buildx build --builder attestation-builder \
  --platform linux/amd64 \
  --sbom=true --provenance=mode=max \
  --push \
  -t projectmockingbird/mockingbird:<version> \
  -t projectmockingbird/mockingbird:latest .
docker buildx rm attestation-builder

# Releases are infrequent enough that the ~150 MB buildkit pull on the
# next release is a worthwhile trade for not having an idle buildkit
# container, and a fresh builder guarantees the SBOM attestation reflects
# the current build with no stale-cache surprises. (The 0.11.2 re-push
# cycle hit exactly that stale-attestation bug.)

# Dev Web UI with hot reload on :5173 (proxies /api -> http://localhost:3333)
npm run dev:web
```

### Opt-in broader round-trip validation

`tests/engine/serializer.test.ts` ships a byte-parity round-trip sweep gated on the `MOCKINGBIRD_EXTERNAL_CONTENT_TREE` env var. Point it at any real SCS authoring tree and the suite walks every `.yml` under it, asserting each round-trips byte-identically:

```bash
MOCKINGBIRD_EXTERNAL_CONTENT_TREE=/path/to/authoring/items npx vitest run tests/engine/serializer.test.ts
```

Leave the var unset in CI / fresh clones; the test is a no-op.

## Tech stack

- **Runtime**: Node.js LTS, TypeScript (ESM), `tsx` for direct `.ts` execution
- **API**: Fastify, Mercurius (GraphQL), pino (logging), `fflate` (package zip emit)
- **Web UI**: Vite 7, React 19, Tailwind v4, shadcn/ui (Sitecore Blok V2 registry), `@mdi/js` icons, `react-day-picker`, `@tanstack/react-query`
- **Tests**: Vitest
- **Packaging**: Docker (alpine multi-stage build, final image ~735 MB - includes a baked pwsh runtime for the in-browser ISE)

## Disclaimer

Mockingbird is an independent project. It is not affiliated with, endorsed by, or sponsored by Sitecore. "Sitecore", "Experience Edge", "SitecoreAI", and related marks are trademarks of their respective owners; uses in this README and in source code are nominative, identifying the third-party formats and APIs Mockingbird interoperates with.

Released under the MIT License (see [LICENSE](LICENSE)).

## TL;DR

You read all that, didn't you?

If you have questions or bugs, open an issue at <https://github.com/project-mockingbird/mockingbird/issues>. Loose discussion, ideas, and "have you considered..." live in the same repo's Discussions tab.

If you ship something interesting built on Mockingbird - a head app, a CI integration, anything - the README will happily link to it. Send a PR.
