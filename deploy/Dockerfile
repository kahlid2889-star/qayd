# قيد — صورة التشغيل على خادم تملكه.
# تُبنى من جذر المشروع:  docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
FROM node:22-bookworm-slim

WORKDIR /app
ENV VITE_AUTH_ENABLED=true \
    VITE_SOCIAL_LOGIN=false \
    NITRO_PRESET=node-server \
    HOST=0.0.0.0 \
    PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# نسخة الإنتاج (خادم Node عادي بدل Vercel). إن فشل البناء لأي سبب تبقى الصورة
# صالحة، وdeploy/start.sh يشغّل وضع التطوير بدلها حتى لا تتوقف اللعبة.
RUN node scripts/with-app-env.mjs vite build \
    || (echo "[qayd] production build failed - the container will use the dev server" && rm -rf .output)

EXPOSE 8080
CMD ["sh", "deploy/start.sh"]
