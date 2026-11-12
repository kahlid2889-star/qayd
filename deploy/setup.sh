#!/usr/bin/env bash
# قيد — سكربت إعداد السيرفر (Ubuntu 22.04/24.04).
# شغّله على السيرفر بعد فك ضغط المشروع داخل مجلد، مثلًا /opt/qayd:
#   sudo bash deploy/setup.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "شغّل السكربت بـ sudo أو كجذر (root)." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
ENV_FILE="$ROOT/.env"
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE")

say() { printf '\n==> %s\n' "$*"; }

# 1) الحزم والجدار الناري
say "تثبيت الحزم الأساسية"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw dnsutils openssl

if ! command -v docker >/dev/null 2>&1; then
  say "تثبيت Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

say "فتح المنافذ 22 و80 و443 فقط"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# 2) ملف .env: يُنشأ مرة واحدة ولا يُستبدل أبدًا
if [ -f "$ENV_FILE" ]; then
  say "وجدت .env موجودًا، أستخدمه كما هو"
else
  say "إنشاء .env"
  read -r -p "النطاق بدون https:// (مثل play.example.com): " DOMAIN
  DOMAIN="$(echo "$DOMAIN" | tr -d ' ' | sed -E 's#^https?://##; s#/.*$##')"
  if [ -z "$DOMAIN" ] || ! echo "$DOMAIN" | grep -Eq '^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
    echo "النطاق غير صالح." >&2
    exit 1
  fi
  PG_PASS="$(openssl rand -hex 24)"
  AUTH_SECRET="$(openssl rand -base64 32)"
  umask 077
  cat > "$ENV_FILE" <<EOT
QAYD_DOMAIN=$DOMAIN
BETTER_AUTH_URL=https://$DOMAIN
POSTGRES_PASSWORD=$PG_PASS
BETTER_AUTH_SECRET=$AUTH_SECRET
QAYD_MODE=prod
EOT
  chmod 600 "$ENV_FILE"
  echo "تم إنشاء $ENV_FILE (صلاحيات للجذر فقط)."
fi

DOMAIN="$(grep -E '^QAYD_DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"
SERVER_IP="$(curl -4fsS --max-time 10 https://ifconfig.me || true)"
DNS_IP="$(dig +short A "$DOMAIN" | tail -n1 || true)"

# 3) تحقق من أن النطاق يشير للسيرفر، لأن Caddy يفشل في إصدار الشهادة بدونه
say "التحقق من النطاق"
if [ -z "$DNS_IP" ]; then
  echo "تحذير: النطاق $DOMAIN ما له سجل A بعد. اربطه بعنوان السيرفر ($SERVER_IP) ثم أعد السكربت." >&2
  echo "سأكمل البناء، لكن HTTPS ما يصدر قبل ما ينتشر السجل." >&2
elif [ -n "$SERVER_IP" ] && [ "$DNS_IP" != "$SERVER_IP" ]; then
  echo "تحذير: $DOMAIN يشير إلى $DNS_IP وعنوان هذا السيرفر $SERVER_IP. صحّح السجل ثم أعد التشغيل." >&2
else
  echo "النطاق يشير للسيرفر: $DNS_IP"
fi

# 4) تشغيل المكدّس
say "بناء وتشغيل اللعبة وPostgres وCaddy (أول مرة قد تأخذ عدة دقائق)"
"${COMPOSE[@]}" up -d --build

say "انتظار جاهزية اللعبة"
ok=""
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T app sh -c 'wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1'; then
    ok=1; break
  fi
  sleep 3
done

MODE="$("${COMPOSE[@]}" logs app 2>/dev/null | grep -o 'starting the [a-z ]*server\|starting the dev server' | tail -n1 || true)"

say "النتيجة"
if [ -n "$ok" ]; then
  echo "اللعبة تستجيب داخل الخادم."
else
  echo "اللعبة ما ردّت خلال ٣ دقائق. شوف السجل:" >&2
  echo "  ${COMPOSE[*]} logs app" >&2
fi
echo "وضع التشغيل: ${MODE:-غير معروف، شوف السجل}"
echo "افتح: https://$DOMAIN"
echo
echo "نسخ احتياطي يدوي:"
echo "  ${COMPOSE[*]} exec -T db pg_dump -U qayd qayd | gzip > /root/qayd-\$(date +%F).sql.gz"
echo "احفظ $ENV_FILE في مكان آمن خارج السيرفر، فيه كلمة القاعدة ومفتاح الجلسات."
