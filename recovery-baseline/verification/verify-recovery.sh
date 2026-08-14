#!/usr/bin/env bash
set -euo pipefail

EXPECTED_APK_SHA="b376b8f4df67d79d70bc1b6e709533669214f62ff1cf12a9f035ced59e908c2f"
EXPECTED_CERT_SHA256="55:47:48:91:13:50:73:7B:6F:6D:EC:4F:3F:3A:AC:2A:C9:B2:C7:2F:99:2C:07:C3:45:10:9A:61:48:FC:65:14"
EXPECTED_APP_JS_SHA="0b632494c6caa4191fa2b991f6aea46516aebafd7ced2ae42cb4fbb7d30218f5"
EXPECTED_APP_CSS_SHA="94a2f13bf92a4ab45325a770ac0bca810ba9de187eeb43fc5a9360587d3b8781"
EXPECTED_ICON_SHA="5172916ad97112b98efdabac8ae7f075e444048f47d1c831720cd27a166fee0c"

APK="${1:-}"
if [[ -z "$APK" || ! -f "$APK" ]]; then
  echo "Usage: $0 /path/to/recovery.apk" >&2
  exit 64
fi

actual_apk_sha="$(sha256sum "$APK" | awk '{print $1}')"
[[ "$actual_apk_sha" == "$EXPECTED_APK_SHA" ]] || {
  echo "FAIL apk sha256: $actual_apk_sha" >&2
  exit 1
}

unzip -tq "$APK" >/dev/null
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
unzip -q "$APK" \
  assets/capacitor.config.json \
  assets/public/app.js \
  assets/public/app.css \
  res/as.png \
  -d "$tmp_dir"

grep -q '"appId": "com.saku.umkm"' "$tmp_dir/assets/capacitor.config.json"
grep -q 'function cinematicIntro(next)' "$tmp_dir/assets/public/app.js"
grep -q "setTimeout(finish,reducedMotion()?60:1620)" "$tmp_dir/assets/public/app.js"
grep -q "\['dashboard','Dashboard'\],\['cashier','Kasir'\],\['products','Produk'\],\['report','Laporan'\]" "$tmp_dir/assets/public/app.js"
grep -q 'Siapkan SAKU' "$tmp_dir/assets/public/app.js"
grep -q "setInterval(()=>{index=(index+1)%count;paint();},4000)" "$tmp_dir/assets/public/app.js"
grep -q 'SAKU FINAL ENTRY / ONBOARDING DESIGN SYSTEM' "$tmp_dir/assets/public/app.css"
grep -q '@media(prefers-reduced-motion:reduce)' "$tmp_dir/assets/public/app.css"

[[ "$(sha256sum "$tmp_dir/assets/public/app.js" | awk '{print $1}')" == "$EXPECTED_APP_JS_SHA" ]]
[[ "$(sha256sum "$tmp_dir/assets/public/app.css" | awk '{print $1}')" == "$EXPECTED_APP_CSS_SHA" ]]
[[ "$(sha256sum "$tmp_dir/res/as.png" | awk '{print $1}')" == "$EXPECTED_ICON_SHA" ]]

node --check "$tmp_dir/assets/public/app.js" >/dev/null

cert_output="$(keytool -printcert -jarfile "$APK")"
grep -q "Owner: CN=SAKU Top3 UI Patch, OU=SAKU, O=SAKU" <<<"$cert_output"
grep -q "SHA256: $EXPECTED_CERT_SHA256" <<<"$cert_output"

echo "PASS: approved SAKU baseline integrity, brand anchor, flow markers, source syntax, and signer verified."
