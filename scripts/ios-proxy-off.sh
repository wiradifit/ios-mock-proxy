#!/usr/bin/env bash
set -e

echo "📱 Disabling macOS / iOS System Proxy..."

NETWORK_SERVICE=$(networksetup -listallnetworkservices 2>/dev/null | grep -E "Wi-Fi|Ethernet" | head -n 1 || true)
if [ -n "$NETWORK_SERVICE" ]; then
    networksetup -setwebproxystate "$NETWORK_SERVICE" off 2>&1 >/dev/null || true
    networksetup -setsecurewebproxystate "$NETWORK_SERVICE" off 2>&1 >/dev/null || true
fi

echo "✅ System proxy disabled."
