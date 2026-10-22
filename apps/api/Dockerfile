# Build from the repo root: docker build -f apps/api/Dockerfile -t nihongo-api .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @nihongo/api --workspace @nihongo/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# The shared package ships TypeScript source; tsup bundles it into dist/.
RUN npm run build -w @nihongo/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @nihongo/api && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
# Cloud Run sets PORT; 8080 is its default.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
