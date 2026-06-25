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
