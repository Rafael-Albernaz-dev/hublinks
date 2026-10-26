FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/extension/package.json apps/extension/package.json
RUN npm ci
COPY apps/api apps/api
COPY apps/extension apps/extension
ARG HUB_EXTENSION_ORIGIN=
RUN npm run build -w @hublink/api && npm run build -w @hublink/extension

FROM node:24-alpine AS runner
ENV NODE_ENV=production HUB_API_HOST=0.0.0.0 HUB_CONFIG_PATH=/app/data/config.json
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node apps/extension/package.json apps/extension/package.json
RUN npm ci --omit=dev --workspace=@hublink/api --ignore-scripts && npm cache clean --force \
    && mkdir /app/data && chown node:node /app/data
COPY --from=builder --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/migrations apps/api/migrations
COPY --from=builder --chown=node:node /app/apps/extension/dist apps/extension/dist
USER node
EXPOSE 3177
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 CMD wget -qO- http://127.0.0.1:3177/health || exit 1
CMD ["node", "apps/api/dist/server.js"]
