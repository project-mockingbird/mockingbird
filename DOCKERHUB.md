# Mockingbird

**YAML-backed local Sitecore for SitecoreAI.** Edit, serialize, and serve Sitecore content from disk - no CM container, no SQL Server, no Solr. A drop-in Experience Edge-shaped GraphQL endpoint for headless rendering hosts.

## What it does

Mockingbird reads your repo's Sitecore Content Serialization (SCS) YAML files - templates, renderings, content items - and exposes:

- **GraphQL Layout Service** at `/sitecore/api/graph/edge` - same shape as Experience Edge, so existing headless rendering hosts target it with just a host swap. Browseable GraphiQL UI at `/graphiql`.
- **Web UI** at `/` and `/tree` - multi-tab content tree, field editors for the standard Sitecore field types, an Image Media Picker, and a Sitecore Package Builder that produces installable `.zip` packages.
- **REST + CLI** - scriptable CRUD over items.
- **PowerShell scripting** - in-browser ISE with a `Mockingbird` module exposing familiar cmdlets (`Get-Item`, `Set-ItemField`, `Find-Item -Where { ... }`).

Round-trips are byte-faithful: edits through the UI / CLI / PowerShell produce the same bytes `dotnet sitecore` would have written, so git diffs against existing serialization stay clean.

## Quick start

`docker-compose.yml`:

```yaml
services:
  mockingbird:
    image: ${MOCKINGBIRD_IMAGE}
    container_name: ${COMPOSE_PROJECT_NAME}
    ports:
      - "127.0.0.1:${MOCKINGBIRD_PORT}:3333"
    environment:
      PORT: 3333
      HOST: ${MOCKINGBIRD_HOST}
      MOCKINGBIRD_WORKSPACE: /workspaces
      MOCKINGBIRD_CONFIG_PATH: /workspaces/config.mockingbird
      INDEX_CACHE_PATH: /workspaces/.mockingbird/cache/index.json.gz
      SITE_ROOT_PATH: ${SITE_ROOT_PATH:-}
    volumes:
      - ${MOCKINGBIRD_WORKSPACE}:/workspaces
```

`.env`:

```ini
MOCKINGBIRD_IMAGE=projectmockingbird/mockingbird:latest
COMPOSE_PROJECT_NAME=mockingbird
MOCKINGBIRD_HOST=127.0.0.1
MOCKINGBIRD_PORT=3333
MOCKINGBIRD_WORKSPACE=<repository root>
```

```bash
docker compose up -d
```

Open `http://localhost:3333`. The first-run wizard walks the workspace mount to discover `sitecore.json` files for project selection. The first save creates `config.mockingbird` at the workspace root - commit it so the saved-projects list ships with your repo.

Full configuration reference, environment variables, GraphQL schema, and architecture details: [github.com/project-mockingbird/mockingbird](https://github.com/project-mockingbird/mockingbird).

## Tags

| Tag | Notes |
|---|---|
| `latest` | Most recent release |
| `0.16.3` | The "Overwrite existing" deploy conflict strategy now performs a faithful field-level diff instead of failing with a non-null-field error. It reads the target item via the Management API `serialize` query, compares it against the workspace item, and sends granular item-update commands (`UPDATE` / `RESET_FIELD` / `ADD_VERSION` / `REMOVE_VERSION` / `CHANGE_TEMPLATE`), converging each pushed item's fields, versions, and template the way `dotnet sitecore ser push` does. Statistics fields (`__Updated`, `__Revision`, ...) are excluded so an unchanged item is a no-op, and media fields compare by blob id. It converges the items you push and does not delete target items outside your selection. |
| `0.16.2` | Fix the GraphQL query-complexity gate over-counting queries that use inline fragments (`... on Type`). It now matches graphql-dotnet 2.4.0 exactly (verified against the real assembly): a selection set of only inline fragments halts traversal, so real head-app navigation queries score low and are accepted, while deep direct-field nesting still accumulates complexity. Fixes production navigation queries being wrongly rejected as "too complex". |
| `0.16.1` | The in-app Restart power button's Clear-Cache-and-Restart confirmation is now a themed in-app dialog instead of a native browser prompt, and the cold-start / re-index splash shows the layer currently being indexed (e.g. "Indexing `<layer name>`") on multi-layer workspaces instead of a generic label. |
| `0.16.0` | Deploy content (items + media) from a Mockingbird workspace up to a live SitecoreAI environment, preserving item GUIDs, via the Management API's `executeSerializationCommands` - reachable from the tree context menu, the package cart, or checkout, with a target-environment manager and streamed preview/install progress. GraphQL queries are now gated with Sitecore's own graphql-dotnet complexity metric (`maxComplexity` / `maxDepth` / `fieldImpact`), defaulting to the stock XM Cloud limits (10000 / 15 / 2) and overridable via `MOCKINGBIRD_GRAPHQL_MAX_COMPLEXITY` / `_MAX_DEPTH` / `_FIELD_IMPACT`, so an over-complex query fails the same way it would on the target. |
| `0.15.0` | Content-tree presentation and icons: reorder sibling items in the tree via a Sorting submenu (Move Up/Down/First/Last) or drag-and-drop, persisting spaced `__Sortorder` values on serialized items; render each item's real Sitecore `__Icon` sprite in the tree, behind the hidden `MOCKINGBIRD_ICONS` switch (default off = unchanged), with the full `Themes/Standard` sprite set baked into the image and served from `GET /api/icon/*`; and a Sitecore-style Change Icon picker (a detail-panel button opening a dialog with curated theme categories, a name filter, a sprite grid, and a Recent tab) that writes the chosen sprite to the item's `__Icon` shared field. Also orders Builder template fields like the content tree (sortorder then name) so they no longer reshuffle after a Refresh |
| `0.14.2` | Fix Builder template-field property edits (Type/Source/Shared/Unversioned) being lost on Save. They were folded into a composite `<fieldId>:<propId>` key and written as a ghost field on the template item instead of the field-definition item, so the value never reached the field and the template YAML accumulated junk entries. Property edits now route to the field-definition item; editing a Template Field/Section/Template item invalidates the memoized template-schema cache (a field-value edit does not bump tree generation); and these definition properties always write to the shared scope so they land where the schema reads them. The tree Refresh now also invalidates the detail `item` and `template-schema` queries, so a refreshed template's Builder updates without a full page reload |
| `0.14.1` | Faithful per-template GraphQL schema generation for real head-app codegen: base templates now emit as GraphQL interfaces with the concrete type renamed `C__<Name>`, each object implements every transitively-inherited base interface, and each field is typed by its Sitecore field subtype (`ImageField`/`DateField`/`LinkField`/...) instead of the generic `ItemField`; OOTB registry templates (e.g. the SXA `Tag` template) are now included in generation so fragments against them resolve, System-inherited standard-template fields are excluded, and boot-replayed headless workspaces generate their concrete template types instead of shipping an empty schema |
| `0.14.0` | Full Sitecore Experience Edge GraphQL schema parity: typed `Item`/`ItemField` interfaces with 13 field subtypes (LinkField, ImageField, DateField, MultilistField, ...), `search` returning full items with `total`/`orderBy`/the 8 Edge operators, `layout.item` as a full item, the complete `SiteInfo` surface (routes/redirects/dictionary/errorHandling), and underscore-preserving type/field naming so `f_`/`T_`-prefixed templates resolve exactly like real Edge. Breaking output changes: `id` defaults to Edge `N` format (use `id(format: "D")` for dashed), `jsonValue` is non-null, `DateField.dateValue` is `Long`, and `search` `where` is required with `first` defaulting to 10 |
| `0.13.0` | Add Serialization Root wizard: register a serialization root on an OOTB registry path (append to a module include or new file) and insert items under it, with coverage-driven Insert gating; multi-layer engine fixes for module reload, emit target, insert options, and file-path resolution; de-duplicates cross-database registry children so OOTB template fields no longer render twice in the item detail pane |
| `0.12.0` | Composed (page-design-aware) Layout editor; multi-layer fixes: SXA variants for env-fallback sites, dynamic-placeholder auto-assign, scope-aware new-item placement, file-path-derived provenance, and warm-start cache self-heal for items added while the container was down |
| `0.11.4` | GraphQL schema generator declares transitively-implemented interfaces, so inline fragments on a base interface resolve on every type that reaches it through an intermediate interface |
| `0.11.3` | Per-developer session state moved to `config.mockingbird.local` so team members don't stomp on each other in the tracked file |
| `0.11.2` | Security patch: clears 5 HIGH CVEs (pwsh 7.4.15, fast-uri 3.x override, npm bump) |
| `0.11.1` | First-contact fixes for canonical SCS repos (default serialization path, lazy-mode provenance fill) |
| `0.11.0` | First public release |

## Platform support

Linux containers, `linux/amd64`. Runs on Mac and Windows via Docker Desktop's WSL2 / virtualization layer; on Apple Silicon it currently runs under amd64 emulation (multi-arch `linux/arm64` is on the roadmap).

## Source + License

- Source: [github.com/project-mockingbird/mockingbird](https://github.com/project-mockingbird/mockingbird)
- License: [MIT](https://github.com/project-mockingbird/mockingbird/blob/main/LICENSE)

## Disclaimer

Mockingbird is an independent project. It is not affiliated with, endorsed by, or sponsored by Sitecore. "Sitecore", "Experience Edge", "SitecoreAI", and related marks are trademarks of their respective owners.
