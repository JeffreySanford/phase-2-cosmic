FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml nx.json tsconfig.base.json tsconfig.json ./
COPY apps/cosmic-forge-worker ./apps/cosmic-forge-worker
RUN pnpm install --frozen-lockfile && pnpm nx run cosmic-forge-worker:build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /workspace/dist/apps/cosmic-forge-worker ./
COPY --from=build /workspace/node_modules ./node_modules
EXPOSE 4102
CMD ["node", "main.js"]
