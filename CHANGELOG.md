# Changelog

## 2026-08-11 — Production Integration Live Gate

- Established separate pooled merchant (`saku_runtime`) and Admin (`saku_admin_app`) database boundaries.
- Enabled/forced tenant RLS and function-only Admin governance boundary.
- Added password and Google ID-token authentication, secure server sessions, one-time Google nonce challenge hardening, and atomic refresh-token rotation support.
- Added server-authoritative atomic checkout, stock locking, idempotency serialization, request fingerprinting, inventory constraints, payment/movement/event writes.
- Added private Cloudflare R2 signed media workflow with quota/race hardening.
- Added merchant event stream for multi-device invalidation.
- Added Admin TOTP MFA, revocable Admin sessions, security/audit operations and one-time SUPER_ADMIN bootstrap.
- Hardened Android merchant/Admin sources for target SDK 36, HTTPS-only operation, native secure session storage, separate packages and fail-closed production signing.
- Added static production gates, live migration script, live RLS/R2 smoke test, checkout concurrency smoke test and production Android build script.
- Replaced stale Phase 0 documentation with the active production architecture/runbook.

## 2026-08-10 — Phase 0 Canonicalization

- Canonicalized SAKU source and removed generated dependencies/build/cache artifacts.
- Isolated legacy Angkringan behavior as reference only.
