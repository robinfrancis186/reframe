#!/usr/bin/env bash
set -euo pipefail
REFRAME_MODE="${1:-run}"
REFRAME_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REFRAME_ROOT"
pkill -x ReframeNativeDemo >/dev/null 2>&1 || true
swift build
REFRAME_BIN="$(swift build --show-bin-path)/ReframeNativeDemo"
REFRAME_BUNDLE="$REFRAME_ROOT/dist/ReframeNativeDemo.app"
mkdir -p "$REFRAME_BUNDLE/Contents/MacOS"
cp "$REFRAME_BIN" "$REFRAME_BUNDLE/Contents/MacOS/ReframeNativeDemo"
cat > "$REFRAME_BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>ReframeNativeDemo</string><key>CFBundleIdentifier</key><string>com.reframe.macNativePreview</string><key>CFBundleName</key><string>Reframe Native Preview</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSPrincipalClass</key><string>NSApplication</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>
PLIST
case "$REFRAME_MODE" in
run) /usr/bin/open -n "$REFRAME_BUNDLE" ;;
--verify) /usr/bin/open -n "$REFRAME_BUNDLE"; sleep 1; pgrep -x ReframeNativeDemo >/dev/null ;;
--debug) lldb -- "$REFRAME_BUNDLE/Contents/MacOS/ReframeNativeDemo" ;;
--logs|--telemetry) /usr/bin/open -n "$REFRAME_BUNDLE"; /usr/bin/log stream --info --style compact --predicate 'process == "ReframeNativeDemo"' ;;
*) echo 'Usage: build_and_run.sh [run|--verify|--debug|--logs|--telemetry]' >&2; exit 2 ;;
esac
