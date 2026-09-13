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
#                    The seed is idempotent and never overwrites existing rows.
case "${1:-serve}" in
  seed)
    npx prisma migrate deploy --schema=prisma/schema.prisma
    ALLOW_DEMO_SEED=true exec npx tsx prisma/seed.ts
    ;;
  serve)
    npx prisma migrate deploy --schema=prisma/schema.prisma
    if [ "${RUN_DEMO_SEED:-false}" = "true" ]; then
      ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts
    fi
    exec node dist/main.js
    ;;
  *)
    echo "Unknown command: $1 (expected: serve or seed)" >&2
    exit 64
    ;;
esac
