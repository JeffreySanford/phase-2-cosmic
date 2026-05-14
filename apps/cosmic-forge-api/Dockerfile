FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml nx.json tsconfig.base.json tsconfig.json ./
COPY apps/cosmic-forge-api ./apps/cosmic-forge-api
RUN pnpm install --frozen-lockfile && pnpm nx run cosmic-forge-api:build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /workspace/dist/apps/cosmic-forge-api ./
COPY --from=build /workspace/node_modules ./node_modules
EXPOSE 4101
CMD ["node", "main.js"]
