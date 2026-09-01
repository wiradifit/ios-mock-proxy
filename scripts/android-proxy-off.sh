#!/usr/bin/env bash
set -e

if ! command -v adb &>/dev/null; then
    echo "⚠️  adb command not found."
    exit 1
fi

echo "🤖 Clearing HTTP proxy on Android device/emulator..."
adb shell settings put global http_proxy :0 || adb shell settings delete global http_proxy

echo "✅ Android Proxy DISABLED."
