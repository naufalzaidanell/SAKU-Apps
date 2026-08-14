#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import secrets
import struct
import subprocess
import sys
import time
import zlib
from pathlib import Path
import xml.etree.ElementTree as ET

PACKAGE = "com.saku.umkm.mobile2preview"
ACTIVITY = f"{PACKAGE}/com.saku.umkm.MainActivity"
ROOT = Path(os.environ.get("SAKU_PARITY_OUT", "mobile2/parity-evidence"))
ROOT.mkdir(parents=True, exist_ok=True)

STAMP = str(int(time.time()))
RUN_NONCE = secrets.token_hex(8)
EMAIL = f"saku.mobile2.{STAMP}.{RUN_NONCE}@example.test"
PASSWORD = f"Saku!{secrets.token_urlsafe(18)}"
OWNER = "Naufal Test"
BUSINESS = f"Warung Mobile {STAMP[-5:]}"
PRODUCT = f"KopiMobile{STAMP[-5:]}"


def run(args, *, check=True, text=True, stdout=None):
    proc = subprocess.run(args, check=False, text=text, stdout=stdout if stdout is not None else subprocess.PIPE,
                          stderr=subprocess.STDOUT if stdout is None else subprocess.PIPE)
    if check and proc.returncode != 0:
        output = proc.stdout if stdout is None else proc.stderr
        raise RuntimeError(f"command failed ({proc.returncode}): {' '.join(args)}\n{output}")
    return proc


def adb(*args, check=True):
    return run(["adb", *args], check=check)


def bounds(value: str):
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", value or "")
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return x1, y1, x2, y2


def center(node):
    b = bounds(node.attrib.get("bounds", ""))
    if not b:
        raise RuntimeError("node has no bounds")
    x1, y1, x2, y2 = b
    return (x1 + x2) // 2, (y1 + y2) // 2


def dump(name="window"):
    adb("shell", "uiautomator", "dump", "/sdcard/window.xml", check=False)
    target = ROOT / f"{name}.xml"
    adb("pull", "/sdcard/window.xml", str(target))
    return ET.parse(target).getroot()


def all_nodes(root):
    return list(root.iter("node"))


def match_node(node, value: str, *, exact=True, attr="text"):
    actual = node.attrib.get(attr, "")
    if exact:
        return actual == value
    return value.lower() in actual.lower()


def find(value: str, *, exact=True, attr="text"):
    root = dump("latest")
    candidates = [n for n in all_nodes(root) if match_node(n, value, exact=exact, attr=attr) and bounds(n.attrib.get("bounds", ""))]
    if not candidates:
        return None
    candidates.sort(key=lambda n: (n.attrib.get("enabled") != "true", n.attrib.get("clickable") != "true"))
    return candidates[0]


def wait_node(value: str, *, exact=True, attr="text", timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        node = find(value, exact=exact, attr=attr)
        if node is not None:
            return node
        time.sleep(1)
    raise TimeoutError(f"UI node not found: {attr}={value!r}")


def wait_gone(value: str, *, exact=True, attr="text", timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        if find(value, exact=exact, attr=attr) is None:
            return
        time.sleep(1)
    raise TimeoutError(f"UI node still present: {value!r}")


def tap_node(node):
    x, y = center(node)
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(0.5)


def tap_text(value: str, *, exact=True, timeout=25, scroll=False):
    end = time.time() + timeout
    attempts = 0
    while time.time() < end:
        node = find(value, exact=exact, attr="text")
        if node is not None:
            tap_node(node)
            return
        attempts += 1
        if scroll and attempts % 2 == 0:
            swipe_up()
        time.sleep(1)
    raise TimeoutError(f"Unable to tap text {value!r}")


def tap_desc(value: str, *, exact=True, timeout=25):
    node = wait_node(value, exact=exact, attr="content-desc", timeout=timeout)
    tap_node(node)


def swipe_up():
    adb("shell", "input", "swipe", "540", "1500", "540", "650", "350")
    time.sleep(0.7)


def focus_field(label: str, *, exact=True, timeout=25, scroll=False):
    end = time.time() + timeout
    attempts = 0
    while time.time() < end:
        root = dump("latest")
        for edit in [n for n in all_nodes(root) if n.attrib.get("class") == "android.widget.EditText"]:
            descendants = list(edit.iter("node"))
            if any(match_node(n, label, exact=exact, attr="text") for n in descendants):
                tap_node(edit)
                return
        attempts += 1
        if scroll and attempts % 2 == 0:
            swipe_up()
        time.sleep(1)
    raise TimeoutError(f"Editable field not found for label {label!r}")


def clear_focused(max_chars=40):
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    adb("shell", "input", "keyevent", *(["KEYCODE_DEL"] * max_chars))


def type_text(value: str, *, clear=False):
    if clear:
        clear_focused()
    encoded = value.replace(" ", "%s")
    adb("shell", "input", "text", encoded)
    time.sleep(0.5)


def fill(label: str, value: str, *, clear=False, exact=True, scroll=False):
    focus_field(label, exact=exact, scroll=scroll)
    type_text(value, clear=clear)


def hide_keyboard():
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(0.6)


def screenshot(name: str):
    with (ROOT / f"{name}.png").open("wb") as f:
        run(["adb", "exec-out", "screencap", "-p"], text=False, stdout=f)


def record_ui(name: str):
    dump(name)
    screenshot(name)


def write_png(path: Path, width=256, height=256, rgb=(17, 155, 98)):
    def chunk(kind: bytes, data: bytes):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    row = bytes([0]) + bytes(rgb) * width
    raw = row * height
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def prepare_product_image():
    local = ROOT / "saku-mobile2-product.png"
    write_png(local)
    remote = "/sdcard/Download/saku-mobile2-product.png"
    adb("push", str(local), remote)
    adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", f"file://{remote}", check=False)


def select_product_image():
    tap_text("Pilih foto produk (wajib)", exact=True, timeout=20, scroll=True)
    time.sleep(2)
    if find("saku-mobile2-product.png", exact=True) is None:
        downloads = find("Downloads", exact=True) or find("Download", exact=True)
        if downloads is not None:
            tap_node(downloads)
            time.sleep(1)
    tap_text("saku-mobile2-product.png", exact=True, timeout=20, scroll=True)
    wait_node("Foto siap digunakan", exact=True, timeout=20)


def assert_no_fatal():
    log = adb("logcat", "-d", "-v", "brief").stdout
    (ROOT / "logcat.txt").write_text(log, encoding="utf-8")
    fatal = [line for line in log.splitlines() if "FATAL EXCEPTION" in line or ("AndroidRuntime" in line and "FATAL" in line)]
    if fatal:
        raise AssertionError("fatal Android runtime error detected\n" + "\n".join(fatal[-20:]))


def resumed_activity():
    return adb("shell", "dumpsys", "activity", "activities").stdout


def main():
    prepare_product_image()
    adb("logcat", "-c", check=False)

    # Register through the native Compose UI.
    wait_node("Masuk ke SAKU", timeout=30)
    record_ui("00-auth-login")
    tap_text("Belum punya akun? Daftar")
    wait_node("Buat akun usaha", timeout=10)
    fill("Nama pemilik", OWNER)
    fill("Nama usaha", BUSINESS)
    fill("Email", EMAIL)
    fill("Password", PASSWORD)
    hide_keyboard()
    record_ui("01-auth-register")
    tap_text("Daftar & lanjutkan", timeout=15)

    # Resumable onboarding, entirely through user-visible controls.
    wait_node("Pilih negara", timeout=30)
    record_ui("02-onboarding-country")
    tap_text("Lanjutkan")
    wait_node("Usaha Anda berada di Indonesia?", timeout=20)
    tap_text("Lanjutkan")
    wait_node("Ceritakan usaha Anda", timeout=20)
    fill("Nama usaha", BUSINESS, clear=True)
    fill("Nomor telepon", "081234567890")
    fill("Alamat usaha", "Yogyakarta")
    fill("Tentang usaha", "Usaha kuliner SAKU Mobile 2")
    hide_keyboard()
    tap_text("Lanjutkan", timeout=15, scroll=True)

    wait_node("Jenis usaha Anda", timeout=25)
    fill("Cari:", "angkringan", exact=False)
    hide_keyboard()
    wait_node("Jadikan utama", timeout=30)
    tap_text("Jadikan utama")
    tap_text("Lanjutkan", timeout=15, scroll=True)

    wait_node("Siapa yang mengelola usaha?", timeout=20)
    fill("Nama pemilik / pengelola", OWNER, clear=True)
    hide_keyboard()
    tap_text("Lanjutkan", timeout=15, scroll=True)

    wait_node("Satu langkah terakhir", timeout=20)
    tap_text("Saya menyetujui Syarat & Ketentuan")
    tap_text("Saya memahami Kebijakan Privasi")
    record_ui("03-onboarding-consent")
    tap_text("Selesaikan pengaturan", timeout=15)

    wait_node("Ringkasan hari ini", timeout=45)
    record_ui("04-dashboard-empty")

    # Secure-session restoration after process death.
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    wait_node("Ringkasan hari ini", timeout=45)
    record_ui("05-session-restored")

    # Create a real product through the native product sheet, including a real PNG selected from DocumentsUI.
    tap_text("Produk", timeout=15)
    wait_node("Produk & Stok", timeout=20)
    tap_desc("Tambah")
    wait_node("Tambah produk", timeout=15)
    select_product_image()
    fill("Nama produk", PRODUCT)
    fill("Harga beli", "5000", clear=True)
    fill("Harga jual", "10000", clear=True)
    swipe_up()
    fill("Stok", "6", clear=True, scroll=True)
    fill("Batas rendah", "2", clear=True, scroll=True)
    hide_keyboard()
    tap_text("Simpan produk", timeout=20, scroll=True)
    wait_node(PRODUCT, timeout=35)
    record_ui("06-product-created")

    # Cash checkout.
    tap_text("Kasir", timeout=15)
    wait_node("Transaksi cepat", timeout=20)
    tap_text(PRODUCT, timeout=20)
    tap_text("Keranjang · 1 item", timeout=15)
    wait_node("Konfirmasi transaksi", timeout=15)
    tap_text("Proses Tunai", timeout=15)
    wait_node("berhasil", exact=False, timeout=35)
    record_ui("07-checkout-cash-success")

    # QRIS checkout from the same native cashier flow.
    tap_text(PRODUCT, timeout=20)
    tap_text("Keranjang · 1 item", timeout=15)
    wait_node("Konfirmasi transaksi", timeout=15)
    tap_text("QRIS", timeout=15)
    tap_text("Proses QRIS", timeout=15)
    wait_node("berhasil", exact=False, timeout=35)
    record_ui("08-checkout-qris-success")

    # Report, expense, and native PDF share intent.
    tap_text("Laporan", timeout=15)
    wait_node("Laporan & Analisis", timeout=25)
    wait_node("Metode pembayaran", timeout=35)
    record_ui("09-report")
    tap_text("Catat pengeluaran", timeout=15, scroll=True)
    wait_node("Catat pengeluaran", timeout=15)
    fill("Deskripsi", "Bahan baku")
    fill("Kategori", "Operasional", clear=True)
    fill("Jumlah", "1000", clear=True)
    hide_keyboard()
    tap_text("Simpan", timeout=15, scroll=True)
    wait_node("Laporan & Analisis", timeout=25)
    time.sleep(2)
    record_ui("10-report-expense")

    tap_desc("Bagikan PDF", timeout=15)
    time.sleep(3)
    activity = resumed_activity()
    (ROOT / "pdf-share-activity.txt").write_text(activity, encoding="utf-8")
    if not re.search(r"ChooserActivity|ResolverActivity|IntentResolver|android\.intent\.action\.CHOOSER", activity, re.I):
        record_ui("11-pdf-share-unverified")
        raise AssertionError("native PDF share chooser did not become visible")
    screenshot("11-pdf-share")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")

    # Dashboard reflects real completed sales.
    tap_text("Dashboard", timeout=15)
    wait_node("Ringkasan hari ini", timeout=25)
    wait_node("3 Produk Terlaris", timeout=25)
    wait_node(PRODUCT, timeout=30)
    record_ui("12-dashboard-after-sales")

    # Logout and returning-user login must skip completed onboarding.
    tap_desc("Buka profil dan pengaturan", timeout=15)
    wait_node("AKUN", timeout=20)
    tap_text("Keluar", timeout=15, scroll=True)
    wait_node("Masuk ke SAKU", timeout=25)
    fill("Email", EMAIL)
    fill("Password", PASSWORD)
    hide_keyboard()
    tap_text("Masuk", timeout=15)
    wait_node("Ringkasan hari ini", timeout=45)
    record_ui("13-returning-user")

    assert_no_fatal()
    (ROOT / "PARITY_PASS.txt").write_text(
        "REGISTER_UI_PASS\nONBOARDING_UI_PASS\nSESSION_RESTORE_PASS\nPRODUCT_CREATE_UI_PASS\nCHECKOUT_CASH_UI_PASS\nCHECKOUT_QRIS_UI_PASS\nREPORT_UI_PASS\nEXPENSE_UI_PASS\nPDF_SHARE_INTENT_PASS\nRETURNING_USER_PASS\nSAKU_MOBILE2_NATIVE_PARITY_PASS\n",
        encoding="utf-8",
    )
    print("SAKU_MOBILE2_NATIVE_PARITY_PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"PARITY FAILURE: {exc}", file=sys.stderr)
        try:
            record_ui("failure")
            assert_no_fatal()
        except Exception as capture_exc:
            print(f"evidence capture also failed: {capture_exc}", file=sys.stderr)
        raise
