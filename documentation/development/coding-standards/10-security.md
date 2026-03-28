# 10. Security

These standards matter because security failures are usually boundary failures: bad validation, weak auth
checks, leaked secrets, missing audit trails, or unsafe assumptions about trust. Security has to be
embedded in normal development practice, not stapled on during panic.

## Authn / authz

- Perform authentication and authorization at trusted boundaries.
- Do not rely solely on client-provided claims without verification.
- Centralize role/permission checks and make them testable.
- Privileged actions emit audit logs (actor, action, target, outcome).

## Input & output safety

- Treat all external input as untrusted.
- Apply output encoding appropriate to the sink (HTML, JSON, SQL, shell, file paths, etc.).
- Never build SQL, shell commands, or broker routing strings by concatenating untrusted input.

## Secrets & keys

- Load secrets from environment, secret managers, or mounted files.
- Document rotation procedures for production secrets.
- Never embed certificates or private keys in code, fixtures, or images.

## Auditability

- Security events must be logged as structured audit records separate from debug logs.
- Audit logs must be immutable in intent and comprehensive enough for reconstruction.

---

### Checklist

- [ ] Authentication/authorization implemented at boundary
- [ ] Audit logs produced for all privileged actions
- [ ] Secrets originate from approved sources
