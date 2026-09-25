# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build:ui && npm run build:server

FROM node:24-alpine
RUN apk add --no-cache git tini
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8420 \
    DATA_DIR=/data \
    WIKI_SEED_DIR=/app/wiki \
    UI_DIST_DIR=/app/dist/ui
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY wiki ./wiki
USER node
EXPOSE 8420
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8420/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
