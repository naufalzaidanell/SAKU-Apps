# SAKU Mobile 2.0 — Approved Baseline Recovery

Direktori ini mengunci recovery aplikasi user/UMKM pada release approved
`SAKU UMKM Top 3 Chart Carousel.apk`.

## Keputusan release

- Kandidat Compose 2.0 tidak dipromosikan karena mengubah flow, navigation,
  motion, dan launcher branding tanpa requirement eksplisit.
- Recovery RC adalah salinan byte-for-byte APK baseline approved. Tidak ada
  resign, patch binary, atau reinterpretasi asset.
- Source UI/behavior dan asset branding yang diekstrak dari baseline disimpan
  sebagai recovery anchor terpisah di paket handoff.
- Kandidat berstatus **Ready for real-device UAT**, bukan production-final,
  sampai checklist manual pengguna dinyatakan lulus.

## Kontrak user journey

1. Native splash menyerahkan kontrol ke cinematic SAKU.
2. Cinematic wallet/receipt/wordmark/tagline berjalan dan fail-open.
3. First-run memilih dan mengonfirmasi Bahasa Indonesia.
4. Empat slide onboarding fitur berjalan berurutan.
5. User masuk atau mendaftar.
6. Onboarding usaha: negara, konfirmasi negara, data usaha, KBLI,
   data pemilik, persetujuan, provisioning.
7. Dashboard terbuka setelah onboarding berstatus `COMPLETED`.
8. Bottom navigation hanya: Dashboard, Kasir, Produk, Laporan.
9. Profil/pengaturan/logout tetap berada pada menu avatar.
10. Dashboard mempertahankan carousel 3 Produk Terlaris dengan interval 4 detik.

Setiap perbedaan tanpa requirement eksplisit diperlakukan sebagai regression.

