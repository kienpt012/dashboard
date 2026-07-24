#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

# Build the Prisma URL inside the container so every credential component is
# percent-encoded. This keeps strong passwords containing @, :, /, # or % valid.
DATABASE_URL="$(
  node -e 'const [user, password, database] = process.argv.slice(1); process.stdout.write(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@postgres:5432/${encodeURIComponent(database)}?schema=public`);' \
    "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$POSTGRES_DB"
)"
export DATABASE_URL

npx prisma migrate deploy --schema=prisma/schema.prisma

if [ "${RUN_DEMO_SEED:-false}" = "true" ]; then
  ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts
fi

exec node dist/main.js
