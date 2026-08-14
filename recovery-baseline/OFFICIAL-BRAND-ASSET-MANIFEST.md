# Official SAKU Brand Asset Manifest

Sumber tunggal: resource di dalam
`SAKU UMKM Top 3 Chart Carousel.apk` yang ditetapkan sebagai baseline approved.

| Resource APK | Ukuran | SHA-256 | Fungsi recovery |
|---|---:|---|---|
| `res/as.png` | 432×432 | `5172916ad97112b98efdabac8ae7f075e444048f47d1c831720cd27a166fee0c` | Artwork launcher/adaptive resolusi tinggi |
| `res/Gc.png` | 192×192 | `7397532752ba0d47f1eb306bce5931100e7d861c09b54d635917eff71e878398` | Launcher/legacy density asset |
| `res/o-.png` | 192×192 | `7397532752ba0d47f1eb306bce5931100e7d861c09b54d635917eff71e878398` | Round/launcher density asset |

Ketiga resource menampilkan artwork resmi SAKU: simbol “S” berbentuk receipt,
wordmark SAKU, palet hijau, dan supporting lockup. Asset tidak boleh di-redraw,
di-trace, di-crop ulang, diubah proporsinya, atau diganti dengan ikon wallet.

Untuk identitas in-app, baseline menggunakan `walletMark()` yang sama pada
cinematic, entry/onboarding, auth brandmark, top bar, dan provisioning. Ini
merupakan bagian approved dari behavioral baseline; bukan pengganti launcher
artwork resmi.

Tidak ada fitur push notification produk yang dideklarasikan pada baseline,
sehingga notification icon berstatus tidak relevan untuk recovery ini. Jangan
menambah icon notifikasi alternatif tanpa requirement eksplisit.

