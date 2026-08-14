#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_BASE_APK="${SAKU_USER_BASE_APK:-}"
ADMIN_BASE_APK="${SAKU_ADMIN_BASE_APK:-}"
OUTPUT_DIR="${SAKU_OUTPUT_DIR:-$ROOT_DIR/release-uat}"
USER_BASE_SHA256='b376b8f4df67d79d70bc1b6e709533669214f62ff1cf12a9f035ced59e908c2f'
ADMIN_BASE_SHA256='fc13e38924abbd904d623be65bed0aab0b885a74cb64c0992ddfe04fbda58065'
JARSIGNER=(java -m jdk.jartool/sun.security.tools.jarsigner.Main)

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

for command_name in unzip zip sha256sum keytool java; do
  command -v "$command_name" >/dev/null || fail "required command is unavailable: $command_name"
done

[[ -f "$USER_BASE_APK" ]] || fail 'SAKU_USER_BASE_APK must point to the approved merchant baseline APK'
[[ -f "$ADMIN_BASE_APK" ]] || fail 'SAKU_ADMIN_BASE_APK must point to the approved admin baseline APK'

actual_user_sha="$(sha256sum "$USER_BASE_APK" | awk '{print $1}')"
actual_admin_sha="$(sha256sum "$ADMIN_BASE_APK" | awk '{print $1}')"
[[ "$actual_user_sha" == "$USER_BASE_SHA256" ]] || fail "merchant baseline hash mismatch: $actual_user_sha"
[[ "$actual_admin_sha" == "$ADMIN_BASE_SHA256" ]] || fail "admin baseline hash mismatch: $actual_admin_sha"

node --check "$ROOT_DIR/apps/mobile-web/app.js"
node --check "$ROOT_DIR/apps/admin-web/admin.js"
node --test "$ROOT_DIR/test/web-regression.test.mjs"

BUILD_DIR="$(mktemp -d)"
cleanup() {
  rm -rf -- "$BUILD_DIR"
}
trap cleanup EXIT

KEYSTORE_FILE="${SAKU_UAT_KEYSTORE_FILE:-}"
KEYSTORE_PASSWORD="${SAKU_UAT_KEYSTORE_PASSWORD:-}"
KEY_ALIAS="${SAKU_UAT_KEY_ALIAS:-}"
KEY_PASSWORD="${SAKU_UAT_KEY_PASSWORD:-}"
SIGNING_MODE='provided-uat-key'

if [[ -z "$KEYSTORE_FILE" || -z "$KEYSTORE_PASSWORD" || -z "$KEY_ALIAS" || -z "$KEY_PASSWORD" ]]; then
  [[ "${SAKU_ALLOW_EPHEMERAL_UAT_SIGNING:-0}" == '1' ]] || fail 'UAT signing variables are incomplete; set all four or explicitly allow ephemeral UAT signing'
  SIGNING_MODE='ephemeral-uat-key'
  KEYSTORE_FILE="$BUILD_DIR/saku-uat.p12"
  KEYSTORE_PASSWORD="$(openssl rand -hex 24)"
  KEY_PASSWORD="$KEYSTORE_PASSWORD"
  KEY_ALIAS='saku-uat-rc'
  keytool -genkeypair -noprompt \
    -keystore "$KEYSTORE_FILE" -storetype PKCS12 \
    -storepass "$KEYSTORE_PASSWORD" -keypass "$KEY_PASSWORD" \
    -alias "$KEY_ALIAS" -keyalg RSA -keysize 3072 -validity 365 \
    -dname 'CN=SAKU UAT RC,OU=Quality Assurance,O=SAKU,C=ID' >/dev/null
fi

[[ -f "$KEYSTORE_FILE" ]] || fail 'UAT keystore file does not exist'
mkdir -p "$OUTPUT_DIR"

hash_preserved_entries() {
  local unpacked="$1"
  local changed_asset="$2"
  (
    cd "$unpacked"
    find . -type f \
      ! -path './META-INF/*' \
      ! -path "./assets/public/$changed_asset" \
      ! -path './assets/public/config.js' \
      -print0 | sort -z | xargs -0 sha256sum
  )
}

build_one() {
  local app_name="$1"
  local base_apk="$2"
  local web_js="$3"
  local config_js="$4"
  local asset_name="$5"
  local output_name="$6"
  local unpacked="$BUILD_DIR/$app_name"
  local preserved_before="$BUILD_DIR/$app_name-preserved-before.sha256"
  local preserved_after="$BUILD_DIR/$app_name-preserved-after.sha256"
  local unsigned_apk="$BUILD_DIR/$app_name-unsigned.apk"
  local signed_apk="$OUTPUT_DIR/$output_name"

  mkdir -p "$unpacked"
  unzip -q "$base_apk" -d "$unpacked"
  hash_preserved_entries "$unpacked" "$asset_name" > "$preserved_before"

  rm -rf -- "$unpacked/META-INF"
  cp -- "$web_js" "$unpacked/assets/public/$asset_name"
  cp -- "$config_js" "$unpacked/assets/public/config.js"

  hash_preserved_entries "$unpacked" "$asset_name" > "$preserved_after"
  diff -u "$preserved_before" "$preserved_after" >/dev/null || fail "$app_name changed a protected baseline entry"

  (
    cd "$unpacked"
    zip -q -r -X "$unsigned_apk" .
  )

  "${JARSIGNER[@]}" \
    -keystore "$KEYSTORE_FILE" -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" -sigalg SHA256withRSA -digestalg SHA-256 \
    -signedjar "$signed_apk" "$unsigned_apk" "$KEY_ALIAS" >/dev/null
  "${JARSIGNER[@]}" -verify "$signed_apk" >/dev/null || fail "$app_name JAR signature verification failed"
  unzip -p "$signed_apk" "assets/public/$asset_name" | cmp -s - "$web_js" || fail "$app_name web payload mismatch"
  unzip -p "$signed_apk" assets/public/config.js | cmp -s - "$config_js" || fail "$app_name config payload mismatch"
}

build_one \
  merchant "$USER_BASE_APK" \
  "$ROOT_DIR/apps/mobile-web/app.js" "$ROOT_DIR/apps/mobile-web/config.uat.js" \
  app.js 'SAKU-Mobile-2.0-Full-Fix-UAT-RC.apk'

build_one \
  admin "$ADMIN_BASE_APK" \
  "$ROOT_DIR/apps/admin-web/admin.js" "$ROOT_DIR/apps/admin-web/config.uat.js" \
  admin.js 'SAKU-Admin-Full-Fix-UAT-RC.apk'

(
  cd "$OUTPUT_DIR"
  sha256sum SAKU-Mobile-2.0-Full-Fix-UAT-RC.apk SAKU-Admin-Full-Fix-UAT-RC.apk > SHA256SUMS.txt
)

SIGNER_SHA256="$(keytool -list -v -keystore "$KEYSTORE_FILE" -storepass "$KEYSTORE_PASSWORD" -alias "$KEY_ALIAS" 2>/dev/null | awk -F': ' '/SHA256:/{print $2; exit}')"
{
  printf 'classification=UAT_REAL_DEVICE_RC\n'
  printf 'signing_mode=%s\n' "$SIGNING_MODE"
  printf 'signer_sha256=%s\n' "$SIGNER_SHA256"
  printf 'merchant_baseline_sha256=%s\n' "$USER_BASE_SHA256"
  printf 'admin_baseline_sha256=%s\n' "$ADMIN_BASE_SHA256"
  printf 'merchant_web_sha256=%s\n' "$(sha256sum "$ROOT_DIR/apps/mobile-web/app.js" | awk '{print $1}')"
  printf 'admin_web_sha256=%s\n' "$(sha256sum "$ROOT_DIR/apps/admin-web/admin.js" | awk '{print $1}')"
  printf 'environment=uat\n'
  printf 'production_release=false\n'
} > "$OUTPUT_DIR/BUILD-METADATA.txt"

printf 'UAT_APK_BUILD_PASS %s\n' "$OUTPUT_DIR"
