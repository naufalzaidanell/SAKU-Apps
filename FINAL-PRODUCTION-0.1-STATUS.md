# SAKU Final Production 0.1 — Integration Status
Date: 2026-08-12

## Completed
- RC8 UMKM visual baseline merged into production source.
- RC5 Admin dark-mode/close-control baseline retained in production source.
- Merchant and Admin backend share the same Neon database while using separate least-privilege runtime roles.
- Merchant runtime role contract: saku_runtime via pooled Neon URL.
- Admin runtime role contract: saku_admin_app via pooled Neon URL and admin RPC boundary.
- Migration sequence fixed at 007 -> 008 -> 009 using direct neondb_owner connection only.
- Production .env contract standardized under apps/backend/.env.production.example.
- Real apps/backend/.env.production is operator-local, ignored by git, and excluded from release artifacts.
- Replit deployment contract uses Secrets/provider environment, not committed .env values.
- SUPER_ADMIN bootstrap no longer prints TOTP URI to logs; enrollment material requires a protected operator file.
- Production static gate PASS.
- Android production source gate PASS.
- Source credential leak scan PASS.

## Live gate pending evidence
- 007 live migration
- 008 live migration
- 009 live migration
- Tenant A/B isolation smoke
- RBAC live smoke
- Admin/merchant DB boundary smoke
- Auth replay protection smoke
- R2 write/head/delete smoke
- Checkout concurrency smoke
- SUPER_ADMIN bootstrap + MFA enrollment/login
- Production Android signing / real-device regression

## Release classification
FP0.1 SOURCE/INTEGRATION BASELINE: PASS
FINAL_PRODUCTION 0.1 LIVE: NOT YET DECLARED

## Mobile 2.0 recovery addendum — 2026-08-15

- Native Compose candidate is release-blocked due to unapproved flow,
  navigation, motion, and launcher-brand regressions.
- Approved UMKM baseline restored byte-for-byte from
  `SAKU UMKM Top 3 Chart Carousel.apk`.
- APK integrity, signer, package anchor, official launcher artwork, cinematic,
  onboarding/provisioning, four-tab navigation, and Top 3 timing markers pass
  the automated recovery verifier.
- Recovery candidate is **READY FOR REAL-DEVICE UAT**, not production-final.
- Production promotion remains blocked until the product owner completes the
  supplied real-device user/admin regression checklist.
