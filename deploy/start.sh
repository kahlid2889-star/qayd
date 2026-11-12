#!/bin/sh
# يطبّق الهجرات ثم يشغّل اللعبة. يفضّل نسخة الإنتاج، ويرجع لوضع التطوير إن لم تُبنَ.
set -eu
cd /app

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[qayd] DATABASE_URL is missing: accounts would be wiped on every restart. Refusing to start." >&2
  exit 1
fi
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  echo "[qayd] BETTER_AUTH_SECRET is missing: every restart would sign all players out. Refusing to start." >&2
  exit 1
fi

node scripts/migrate.mjs

if [ "${QAYD_MODE:-prod}" = "prod" ] && [ -f .output/server/index.mjs ]; then
  echo "[qayd] starting the production server on :${PORT:-8080}"
  exec node .output/server/index.mjs
fi

echo "[qayd] production bundle not found - starting the dev server on :8080"
exec npm run dev
