# Telemetry Sidebar Dockerfile

FROM node:20.11.1-alpine

WORKDIR /app

COPY tools/telemetry-sidebar/package.json ./
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm@8.15.6 && pnpm install --no-frozen-lockfile

COPY tools/telemetry-sidebar .

EXPOSE 3333


# Create a non-root user and switch to it
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Use environment variables for sensitive data
ENV RABBITMQ_URL="amqp://guest:guest@rabbitmq:5672"
ENV NODE_ID="docker-sidecar"
ENV WS_PORT="3333"

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD wget --spider --quiet http://localhost:${WS_PORT}/health || exit 1

CMD ["pnpm", "exec", "tsx", "src/index.ts", "--", "--rabbitmq", "$RABBITMQ_URL", "--nodeId", "$NODE_ID", "--wsPort", "$WS_PORT"]
