#!/bin/sh
set -eu

# A deployment platform may provide external DATABASE_URL and DIRECT_URL
# values (for example Supabase). Docker Compose local development omits them,
# so the URL is built safely from the local PostgreSQL service instead.
if [ -z "${DATABASE_URL:-}" ]; then
  : "${POSTGRES_USER:?POSTGRES_USER is required when DATABASE_URL is empty}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required when DATABASE_URL is empty}"
  : "${POSTGRES_DB:?POSTGRES_DB is required when DATABASE_URL is empty}"

  # Percent-encode every credential component. This keeps strong passwords
  # containing @, :, /, # or % valid.
  DATABASE_URL="$(
    node -e 'const [user, password, database] = process.argv.slice(1); process.stdout.write(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@postgres:5432/${encodeURIComponent(database)}?schema=public`);' \
      "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$POSTGRES_DB"
  )"
fi
export DATABASE_URL

if [ -z "${DIRECT_URL:-}" ]; then
  case "$DATABASE_URL" in
    *:6543/*)
      echo "DIRECT_URL is required when DATABASE_URL uses a transaction pooler on port 6543." >&2
      exit 1
      ;;
  esac
  DIRECT_URL="$DATABASE_URL"
fi
export DIRECT_URL

# Commands:
#   serve (default)  apply migrations, optionally seed, then run the API.
#   seed             apply migrations and create demo data, then exit. Used by
#                    scripts/start-ioc.ps1 on a fresh database through
#                    `docker compose exec api ./docker-entrypoint.sh seed`, so the
#                    database URL is derived exactly as the running API derives it.
#                    Loads the official demo dataset (prisma/demo) into an empty database only.
#   seed-replace     apply migrations and REPLACE an existing demo dataset (older sample data) with the
#                    current one. Refuses to touch a database that holds real locality data.
#   demo-status      print "IOC_DATA <empty|demo|real> <current version> <latest version>" for start-ioc.
#   bootstrap        apply migrations and create only the first ADMIN account
#                    (ADMIN_USERNAME / ADMIN_PASSWORD) for a real locality without
#                    demo data; the locality is then configured at /admin/thiet-lap.
case "${1:-serve}" in
  bootstrap)
    npx prisma migrate deploy --schema=prisma/schema.prisma
    exec npx tsx prisma/bootstrap.ts
    ;;
  seed)
    npx prisma migrate deploy --schema=prisma/schema.prisma
    ALLOW_DEMO_SEED=true exec npx tsx prisma/seed.ts
    ;;
  seed-replace)
    npx prisma migrate deploy --schema=prisma/schema.prisma
    ALLOW_DEMO_SEED=true exec npx tsx prisma/seed.ts --replace
    ;;
  demo-status)
    exec npx tsx prisma/demo/status.ts
    ;;
  serve)
    npx prisma migrate deploy --schema=prisma/schema.prisma
    if [ "${RUN_DEMO_SEED:-false}" = "true" ]; then
      ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts
    fi
    exec node dist/main.js
    ;;
  *)
    echo "Unknown command: $1 (expected: serve, seed, seed-replace, demo-status or bootstrap)" >&2
    exit 64
    ;;
esac
