#!/bin/sh
set -eu
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL مطلوب حتى تُحفظ الحسابات والغرف." >&2
  exit 1
fi
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  echo "BETTER_AUTH_SECRET مطلوب. أنشئه بـ: openssl rand -base64 32" >&2
  exit 1
fi
i=0
until node --input-type=module -e "import pg from 'pg'; const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.end();"; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "قاعدة البيانات لم تستجب." >&2
    exit 1
  fi
  sleep 1
done
npm run db:migrate
exec npm run dev
