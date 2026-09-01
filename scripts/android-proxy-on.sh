#!/usr/bin/env bash
set -e

PROXY_PORT="${PROXY_PORT:-8080}"
HOST_IP="${HOST_IP:-10.0.2.2}" # 10.0.2.2 is default for Android Emulator to host Mac

if ! command -v adb &>/dev/null; then
    echo "⚠️  adb command not found. Make sure Android SDK platform-tools are in your PATH."
    exit 1
fi

# Check if user specified a physical device LAN IP
if [ "$1" != "" ]; then
    HOST_IP="$1"
fi

echo "🤖 Setting global HTTP proxy on Android device/emulator to $HOST_IP:$PROXY_PORT..."
adb shell settings put global http_proxy "$HOST_IP:$PROXY_PORT"

echo "✅ Android Proxy ENABLED ($HOST_IP:$PROXY_PORT)."
