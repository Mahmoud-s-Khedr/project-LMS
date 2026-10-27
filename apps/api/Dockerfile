FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm db:generate
RUN pnpm --filter @lms/shared build && pnpm --filter @lms/api build
RUN pnpm --filter @lms/api deploy --prod --legacy /deploy \
    && cp -a apps/api/dist /deploy/dist \
    && source_client="$(dirname "$(dirname "$(readlink -f apps/api/node_modules/@prisma/client)")")" \
    && deploy_client="$(dirname "$(dirname "$(readlink -f /deploy/node_modules/@prisma/client)")")" \
    && mkdir -p "$deploy_client/.prisma" \
    && cp -a "$source_client/.prisma/." "$deploy_client/.prisma/"

FROM base AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /deploy ./
USER node
EXPOSE 4100
CMD ["node", "dist/main.js"]

FROM api AS worker
USER root
RUN apt-get update && apt-get install -y --no-install-recommends chromium clamav clamav-freshclam ffmpeg ca-certificates \
    && sed -i '/^NotifyClamd /d' /etc/clamav/freshclam.conf \
    && freshclam && rm -rf /var/lib/apt/lists/*
ENV CERTIFICATE_CHROMIUM_PATH=/usr/bin/chromium
USER node
CMD ["node", "dist/workers/main.js"]
