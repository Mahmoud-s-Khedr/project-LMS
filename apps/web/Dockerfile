FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_URL=http://localhost:4100/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @lms/shared build && pnpm --filter @lms/web build
RUN pnpm --filter @lms/web deploy --prod --legacy /deploy
RUN cp -a apps/web/.next /deploy/.next \
    && cp -aL node_modules/typescript /deploy/node_modules/typescript

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /deploy ./
USER node
EXPOSE 3100
CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3100"]
