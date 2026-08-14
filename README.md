# SAKU UMKM — Production Integration Source

> **Release recovery notice (2026-08-15):** native Compose Mobile 2.0 is not an
> approved release baseline because it regressed the agreed user journey and
> launcher branding. The current user/UMKM real-device candidate is the
> byte-identical `SAKU UMKM Top 3 Chart Carousel.apk` recovery described in
> [`recovery-baseline/README.md`](recovery-baseline/README.md). Do not promote a
> Compose artifact until an explicit replacement requirement and full baseline
> parity approval exist.

SAKU adalah platform operasional UMKM dengan dua klien Android terpisah dan satu backend production.

## Aplikasi aktif

- `apps/mobile-web` — UI Pelaku Usaha yang dibundel ke Capacitor Android.
- `apps/mobile-android` — Android `com.saku.umkm`.
- `apps/admin-web` — UI Platform Admin yang dibundel ke Capacitor Android.
- `apps/admin-android` — Android `com.saku.admin`.
- `apps/backend` — Hono/TypeScript production API untuk Neon PostgreSQL dan Cloudflare R2.

## Boundary produksi

- Merchant runtime memakai role pooled `saku_runtime` dan tenant context PostgreSQL RLS.
- Admin runtime memakai login `saku_admin_app` yang hanya mewarisi permission-role `saku_admin_runtime`; operasi governance melewati SECURITY DEFINER RPC, bukan direct-table access.
- Migration owner hanya dipakai sementara untuk migration/bootstrap dan tidak boleh dipakai request handler.
- R2 bucket private; upload/read menggunakan signed URL.
- Android release memakai API 36, HTTPS-only, backup disabled, dan package terpisah.

## Gate

Jalankan `npm run verify:static` untuk source-level security/build assertions. Live production tetap wajib melewati migration live, readiness, smoke test, real-device Google/MFA test, dan release signing. Lihat `docs/current-blockers.md` dan `docs/deployment.md`.
