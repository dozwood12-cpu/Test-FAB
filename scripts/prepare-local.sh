#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env.local ]; then cp .env.example .env.local; fi
if node --env-file=.env.local -e 'const u=new URL(process.env.DATABASE_URL);process.exit(["127.0.0.1","localhost"].includes(u.hostname)&&u.username==="fab"&&u.pathname==="/fab"&&(!u.port||u.port==="5432")?0:1)'; then
  if docker container inspect fab-postgres >/dev/null 2>&1; then
    docker start fab-postgres >/dev/null
  else
    docker run -d --name fab-postgres -e POSTGRES_USER=fab -e POSTGRES_DB=fab \
      -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:5432:5432 \
      -v fab-pgdata:/var/lib/postgresql/data postgres:17 >/dev/null
  fi
  ready=false
  for attempt in {1..30}; do
    if docker exec fab-postgres pg_isready -U fab -d fab >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
  done
  if [ "$ready" != true ]; then echo 'PostgreSQL belum siap.' >&2; exit 1; fi
  tables=$(docker exec fab-postgres psql -U fab -d fab -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
  if [ "$tables" = 0 ] && [ -f data/bootstrap.dump ]; then
    docker exec -i fab-postgres pg_restore --exit-on-error -U fab -d fab < data/bootstrap.dump
  fi
fi
npm ci --cache /tmp/fab-npm-cache --no-audit --no-fund
node --env-file=.env.local scripts/setup.mjs
NEXT_TELEMETRY_DISABLED=1 npm run build
