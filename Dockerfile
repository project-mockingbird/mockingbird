# Stage 0: Build the SPE C# provider DLL.
# The C# class library is loaded at runtime by pwsh so that Mockingbird
# cmdlets can expose Sitecore-shaped objects ($item["Field"] indexer,
# master: PSDrive). Compiled here in an isolated stage and copied into
# the production image; the builder stage doesn't need .NET so it stays
# on plain node:alpine.
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS dotnet-builder
WORKDIR /build
COPY src/spe/provider-csharp/ ./src/spe/provider-csharp/
RUN dotnet build src/spe/provider-csharp/Mockingbird.Provider/Mockingbird.Provider.csproj \
    -c Release -o /build/data/spe --nologo

# Stage 1: Build Node.js API
FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/engine/ src/engine/
COPY src/api/ src/api/
COPY src/cli/ src/cli/
# SPE host (TS) is referenced by src/api/server.ts + routes/spe.ts. The
# PowerShell module and C# provider DLL are runtime assets - module/ is
# copied straight into the production image below; the DLL is built in
# the dotnet-builder stage above and also copied into prod.
COPY src/spe/host/ src/spe/host/
RUN npm run build

# Build web UI
COPY src/web/package.json src/web/package-lock.json* /app/src/web/
RUN cd /app/src/web && npm install
COPY src/web/ /app/src/web/
RUN cd /app/src/web && npm run build

# Stage 2: Production image
FROM node:24-alpine

# Install PowerShell 7.4 LTS (musl build for Alpine). pwsh hosts the SPE
# scripting feature: the API spawns one pwsh child per session and pipes
# script frames over stdio. Pwsh ships its own .NET runtime, which loads
# the C# provider DLL. Runtime libs (icu-libs, libssl3, etc.) are required
# for pwsh culture and crypto support; lttng-ust and userspace-rcu are
# pwsh tracing deps.
RUN apk add --no-cache \
      ca-certificates \
      icu-libs \
      krb5-libs \
      libgcc \
      libintl \
      libssl3 \
      libstdc++ \
      lttng-ust \
      ncurses-terminfo-base \
      tzdata \
      userspace-rcu \
      zlib \
  && wget -O /tmp/pwsh.tar.gz \
      "https://github.com/PowerShell/PowerShell/releases/download/v7.4.15/powershell-7.4.15-linux-musl-x64.tar.gz" \
  && mkdir -p /opt/microsoft/powershell/7 \
  && tar zxf /tmp/pwsh.tar.gz -C /opt/microsoft/powershell/7 \
  && chmod +x /opt/microsoft/powershell/7/pwsh \
  && ln -s /opt/microsoft/powershell/7/pwsh /usr/bin/pwsh \
  && rm /tmp/pwsh.tar.gz \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /app
COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/src/web/out /app/dist/web/out
COPY package.json ./

# SPE provider DLL (built in dotnet-builder stage) and PowerShell module.
# server.ts:121 looks up the DLL at <repoRoot>/data/spe/Mockingbird.Provider.dll
# and the module manifest at <repoRoot>/src/spe/module/Mockingbird.psd1, where
# repoRoot resolves to /app at runtime.
COPY --from=dotnet-builder /build/data/spe/Mockingbird.Provider.dll /app/data/spe/Mockingbird.Provider.dll
COPY src/spe/module/ /app/src/spe/module/

# Registry stays baked - it's ~1 MB and rarely changes
COPY data/registry.json.gz* /app/data/

ENV REGISTRY_PATH=/app/data/registry.json.gz

# Run as the built-in non-root `node` user (uid/gid 1000). /app owns the
# bind-mount targets (/scs, /scs-content, /data/cache) plus the baked
# registry, so giving `node` ownership lets the engine write the cache.
# Bind-mounted host paths still need to be readable/writable by uid 1000
# on the host.
#
# Also pre-create /data/cache as node:node so when docker mounts an empty
# named volume there at runtime, the volume inherits node ownership and
# the engine can write per-layer cache files into it.
RUN mkdir -p /data/cache && chown -R node:node /app /data
USER node

# Documentation port matching the typical MOCKINGBIRD_PORT=3333 set by
# docker-compose.yml. The actual listen port is decided at runtime via
# the PORT env var (defaults to 3000 in src/api/index.ts when unset),
# so EXPOSE is informational rather than load-bearing.
EXPOSE 3333

# /api/status is exempted from the readiness gate, so it reports HTTP 200
# the moment Fastify is listening - even before YAML indexing completes.
# That makes it a good liveness probe: the container is "healthy" once the
# server can accept connections, and indexing progress is visible in the
# response body for callers that need to wait on readiness specifically.
# Using the runtime $PORT env so `docker run -e PORT=3333` (compose default)
# probes the right port.
#
# Timeout 30s (was 5s pre-0.9.2.2): on slow-I/O setups (Docker Desktop +
# WSL2 + 9p, network-mounted volumes) the same probe that takes 42ms when
# idle can hang for 5+ seconds during early-boot cache load and
# indexInBackground synchronous chunks. Two consecutive 5s timeouts
# pushed the first healthy mark to +85s, gating Traefik / load-balancer
# routing for that whole window. 30s is conservative - a genuinely-broken
# server still trips after Retries × Interval ≈ 90s, vs ~30s today, which
# is acceptable for a Docker-level health gate. Restore the original 5s
# only if your deployment runs on a fast-I/O host where the early-boot
# probe is reliably fast.
HEALTHCHECK --interval=30s --timeout=30s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://localhost:${PORT:-3000}/api/status" || exit 1

CMD ["node", "dist/api/index.js"]
