# Regression Matrix — Baseline Approved vs Native Mobile 2.0

| Area | Baseline approved | Native 2.0 yang diaudit | Keputusan recovery |
|---|---|---|---|
| Package release | `com.saku.umkm` | Debug memakai suffix `.mobile2preview` | Kunci ke baseline |
| Launcher icon | Artwork resmi SAKU berwarna hijau, wordmark SAKU, proporsi asli | Vector wallet generik buatan ulang | Pulihkan PNG resmi tanpa modifikasi |
| Adaptive/legacy icon | Resource launcher baseline tersedia dalam beberapa ukuran/layer | Satu `@drawable/ic_saku_app` tanpa set mipmap/adaptive lengkap | Gunakan resource baseline |
| Splash handoff | Native splash → cinematic branded | Langsung ke root Compose/loading | Pulihkan baseline |
| Cinematic motion | Wallet, receipt, wordmark, tagline; 1,62 detik; reduced-motion aman | Tidak tersedia | Pulihkan baseline |
| Pre-auth onboarding | Bahasa → konfirmasi → 4 feature slides | Tidak konsisten dengan baseline | Pulihkan baseline |
| Auth | Login/register SAKU, lalu route session | Copy dan urutan berubah | Pulihkan baseline |
| Business onboarding | Country → confirm → business → classification → owner → consent → provisioning | Step API ada, tetapi presentation/transition berbeda | Pulihkan visual dan behavior baseline |
| Provisioning | Progress branded dan retry; baru masuk dashboard setelah complete | Completion dijalankan dari state root tanpa layar approved yang identik | Pulihkan baseline |
| Bottom navigation | 4 tab: Dashboard, Kasir, Produk, Laporan | 5 tab: Beranda, Kasir, Produk, Laporan, Akun | Hapus perubahan; Akun kembali ke avatar |
| Dashboard entry | Ringkasan, metric, Top 3, tren, pembayaran | Layout/copy native berbeda | Pulihkan baseline |
| Top 3 carousel | Maks. 3 item, swipe/dots, auto 4 detik, pause/restart, reduced-motion | Implementasi visual berbeda | Pertahankan baseline |
| Kasir | Katalog → keranjang → metode bayar → konfirmasi | Business capability ada, presentation berbeda | Pulihkan baseline |
| Produk | Search, add/edit/delete, image | Capability ada | Pertahankan behavior baseline |
| Laporan | Period, metrics, payment, expenses, PDF | Capability ada, header/layout berubah | Pulihkan baseline |
| Pengaturan | Menu avatar; profile, preferences, theme, security/logout | Tab Akun baru | Pulihkan baseline |
| Typography/spacing/color | Token hijau SAKU dan entry design system approved | Material 3 interpretation | Baseline menjadi sumber kebenaran |
| Notification icon | Tidak ada fitur push/notification produk yang dideklarasikan pada baseline | Tidak ada requirement eksplisit | N/A; jangan menambah asset alternatif |

## Safe UI/UX improvements yang dipertahankan

- Final entry/onboarding design system yang sudah berada di baseline.
- Empty, loading, retry, network, dan provisioning states baseline.
- Dark mode serta `prefers-reduced-motion` behavior.
- Carousel Top 3 empat detik dengan swipe dan dot navigation.
- Inline product media, low-stock cue, report/PDF, dan idempotent checkout.

Tidak ada improvement native 2.0 yang dipertahankan apabila menggeser urutan,
navigation, branding, atau business flow.

