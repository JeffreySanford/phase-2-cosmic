# MG-3: VO Interoperability (TAP / DataLink / SODA)

Owner: Data Architecture + API

## Goal

Provide TAP/ADQL and DataLink endpoints (or proxies) and ensure OpenAPI-driven contract tests validate compliance where applicable.

## Deliverables

- Schema: document VO endpoints in `openapi/governance.yaml` and examples.
- Backend: minimal discovery endpoints (already added `/api/v1/vo/services`) and test mocks for TAP/DataLink.
- Tests: contract tests validating presence of VO endpoints in OpenAPI and simple response shape.
- Frontend: link to VO services and data access flows.

## Acceptance Criteria

- OpenAPI declares VO endpoints and packaged OpenAPI contains path.
- Contract tests pass that check `vo/services` path and example fields.
