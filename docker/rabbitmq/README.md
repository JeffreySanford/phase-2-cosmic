# RabbitMQ configuration for Phase‑2 Cosmic

This folder contains RabbitMQ configuration and definitions used by the development
Docker compose stacks. It replaces the previous nested `docker/docker/rabbitmq` path.

Files expected:

- `definitions.json/` — optional admin definitions (users, vhosts, policies).
- `rabbitmq.conf/` — optional configuration snippets mounted into the container.

Usage:

1. Reference this folder in `docker/dev-compose.yml` under the `volumes`/`configs` section for the `rabbitmq` service.
2. Keep definitions and config in source control if you want reproducible dev environments.

Example:

```yaml
services:
  rabbitmq:
    image: rabbitmq:3-management
    volumes:
      - ./docker/rabbitmq/rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
      - ./docker/rabbitmq/definitions.json:/etc/rabbitmq/definitions.json:ro
``` 

If you previously used `docker/docker/rabbitmq`, it has been consolidated here.
