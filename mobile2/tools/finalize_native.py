from pathlib import Path


root = Path("mobile2")
api = (root / "app/src/main/java/com/saku/umkm/SakuApi.kt").read_text(encoding="utf-8")
ui = (root / "app/src/main/java/com/saku/umkm/SakuUi.kt").read_text(encoding="utf-8")

requirements = {
    "bounded HTTP response": "readBoundedBytes(it, MAX_HTTP_RESPONSE_BYTES)" in api,
    "safe-method auth retry": "isSafeAutomaticRetry(method)" in api,
    "ambiguous mutation guard": "AUTH_REFRESHED_RETRY_REQUIRED" in api,
    "exact endpoint policy": "EndpointPolicy.approved" in api,
    "four-tab baseline": 'Triple(AppPage.REPORT,"Laporan"' in ui and "AppPage.ACCOUNT" not in ui,
    "secondary account route": "accountOpen" in ui,
}

failures = [name for name, passed in requirements.items() if not passed]
if failures:
    raise SystemExit("mobile2 finalize gate failed: " + ", ".join(failures))

print("mobile2 finalize gate: PASS")
