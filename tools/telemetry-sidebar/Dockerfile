# Telemetry Sidebar Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@10.32.1 && pnpm install --frozen-lockfile

COPY . .

EXPOSE 3333

CMD ["pnpm", "exec", "tsx", "src/index.ts", "--", "--rabbitmq", "amqp://guest:guest@rabbitmq:5672", "--nodeId", "docker-sidecar", "--wsPort", "3333"]
