#!/usr/bin/env python3
"""Keyboard-, viewport-, and semantics-aware wrapper for the SAKU Mobile 2 native parity journey.

This file changes test interaction only. Every field entry closes the Android
IME exactly once while that field is still focused. The base journey's later
hide-keyboard calls are intentionally neutralized so they cannot become an
Activity-level Back action after the IME is already gone. Consent interactions
tap the actual clickable CheckBox semantics nodes instead of non-clickable text
labels. Android Photo Picker interaction selects the actual clickable media
thumbnail by semantics rather than assuming a visible filename. Production UI,
API contracts, database and business logic remain untouched.
"""

import sys
import time
import parity_ui as parity

_base_fill = parity.fill
_base_swipe_up = parity.swipe_up
_base_wait_node = parity.wait_node

SAFE_TAP_MIN_Y = 90
SAFE_TAP_MAX_Y = 1780

CONSENT_LABELS = {
    "Saya menyetujui Syarat & Ketentuan",
    "Saya memahami Kebijakan Privasi",
}
PHOTO_PICKER_FILE = "saku-mobile2-product.png"


def _app_is_foreground() -> bool:
    activities = parity.resumed_activity()
    resumed_markers = (
        "mResumedActivity",
        "topResumedActivity",
        "ResumedActivity",
    )
    return any(
        parity.PACKAGE in line and any(marker in line for marker in resumed_markers)
        for line in activities.splitlines()
    )


def _require_app_foreground():
    if not _app_is_foreground():
        raise RuntimeError("SAKU left the foreground during the native journey")


def dismiss_ime_after_fill():
    """Dismiss the IME once while a freshly filled EditText still owns focus."""
    parity.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(0.6)
    _require_app_foreground()


def ignore_redundant_hide():
    """Base-journey hides are redundant because every fill already dismissed the IME."""
    return None


def safe_swipe_up():
    _require_app_foreground()
    _base_swipe_up()
    _require_app_foreground()


def safe_swipe_down():
    _require_app_foreground()
    parity.adb("shell", "input", "swipe", "540", "650", "540", "1500", "350")
    time.sleep(0.7)
    _require_app_foreground()


def _safe_to_tap(node) -> bool:
    box = parity.bounds(node.attrib.get("bounds", ""))
    if not box:
        return False
    _, y = parity.center(node)
    return SAFE_TAP_MIN_Y <= y <= SAFE_TAP_MAX_Y


def viewport_aware_focus_field(label: str, *, exact=True, timeout=25, scroll=False):
    """Never tap an EditText whose center overlaps Android system navigation."""
    end = time.time() + timeout
    attempts = 0
    while time.time() < end:
        _require_app_foreground()
        root = parity.dump("latest")
        matches = []
        for edit in [node for node in parity.all_nodes(root) if node.attrib.get("class") == "android.widget.EditText"]:
            descendants = list(edit.iter("node"))
            if any(parity.match_node(node, label, exact=exact, attr="text") for node in descendants):
                matches.append(edit)
        safe = next((node for node in matches if _safe_to_tap(node)), None)
        if safe is not None:
            parity.tap_node(safe)
            _require_app_foreground()
            return
        attempts += 1
        if matches or scroll or attempts % 2 == 0:
            safe_swipe_up()
        time.sleep(0.5)
    raise TimeoutError(f"Editable field not safely tappable for label {label!r}")


def keyboard_aware_fill(label: str, value: str, *, clear=False, exact=True, scroll=False):
    _require_app_foreground()
    result = _base_fill(label, value, clear=clear, exact=exact, scroll=scroll)
    dismiss_ime_after_fill()
    return result


def durable_wait_node(value: str, *, exact=True, attr="text", timeout=30):
    """Use durable success state and restore report viewport when transient UI is gone."""
    if value == "Laporan & Analisis" and attr == "text":
        end = time.time() + timeout
        report_anchors = ("Harian", "Pendapatan", "Metode pembayaran", "Pengeluaran")
        while time.time() < end:
            nodes = parity.all_nodes(parity.dump("latest"))
            heading = next((node for node in nodes if parity.match_node(node, value, exact=exact, attr=attr)), None)
            if heading is not None:
                return heading
            on_report = any(node.attrib.get("text", "") in report_anchors for node in nodes)
            if on_report:
                safe_swipe_down()
            else:
                time.sleep(0.5)
        raise TimeoutError("Report remained open but its header could not be restored")
    if value != "berhasil" or attr != "text":
        return _base_wait_node(value, exact=exact, attr=attr, timeout=timeout)
    end = time.time() + timeout
    while time.time() < end:
        success = parity.find(value, exact=exact, attr=attr)
        if success is not None:
            return success
        empty_cart = parity.find("Keranjang · 0 item", exact=True, attr="text")
        if empty_cart is not None:
            return empty_cart
        time.sleep(0.5)
    raise TimeoutError("Checkout did not reach a durable empty-cart success state")


def _picker_thumbnail(root):
    candidates = []
    for node in parity.all_nodes(root):
        if node.attrib.get("class") != "android.widget.FrameLayout":
            continue
        if node.attrib.get("clickable") != "true":
            continue
        description = node.attrib.get("content-desc") or ""
        package = node.attrib.get("package") or ""
        box = parity.bounds(node.attrib.get("bounds", ""))
        if not box:
            continue
        if package.startswith("com.android.providers.media") and description.startswith("Photo taken on "):
            candidates.append((box, node))
    if not candidates:
        return None
    candidates.sort(key=lambda pair: (pair[0][1], pair[0][0], pair[0][3], pair[0][2]))
    return candidates[0][1]


def semantics_aware_tap_text(value: str, *, exact=True, timeout=25, scroll=False):
    if value == PHOTO_PICKER_FILE:
        end = time.time() + timeout
        while time.time() < end:
            root = parity.dump("latest")
            thumbnail = _picker_thumbnail(root)
            if thumbnail is not None:
                parity.tap_node(thumbnail)
                return
            time.sleep(0.5)
        raise TimeoutError("Clickable media thumbnail not found in Android Photo Picker")

    if value not in CONSENT_LABELS:
        end = time.time() + timeout
        attempts = 0
        while time.time() < end:
            node = parity.find(value, exact=exact, attr="text")
            if node is not None and _safe_to_tap(node):
                parity.tap_node(node)
                return
            attempts += 1
            if node is not None or scroll or attempts % 2 == 0:
                safe_swipe_up()
            time.sleep(0.5)
        raise TimeoutError(f"Unable to safely tap text {value!r}")

    end = time.time() + timeout
    while time.time() < end:
        root = parity.dump("latest")
        checkboxes = [
            node for node in parity.all_nodes(root)
            if node.attrib.get("class") == "android.widget.CheckBox"
            and node.attrib.get("clickable") == "true"
            and node.attrib.get("checked") == "false"
            and parity.bounds(node.attrib.get("bounds", ""))
        ]
        if checkboxes:
            checkboxes.sort(key=lambda node: parity.bounds(node.attrib.get("bounds", ""))[1])
            parity.tap_node(checkboxes[0])
            return
        time.sleep(0.5)
    raise TimeoutError(f"Unchecked consent checkbox not found for {value!r}")


parity.hide_keyboard = ignore_redundant_hide
parity.focus_field = viewport_aware_focus_field
parity.fill = keyboard_aware_fill
parity.wait_node = durable_wait_node
parity.tap_text = semantics_aware_tap_text
parity.swipe_up = safe_swipe_up

if __name__ == "__main__":
    try:
        parity.main()
    except Exception as exc:
        print(f"PARITY FAILURE: {exc}", file=sys.stderr)
        try:
            parity.record_ui("failure")
            parity.assert_no_fatal()
        except Exception as capture_exc:
            print(f"evidence capture also failed: {capture_exc}", file=sys.stderr)
        raise
