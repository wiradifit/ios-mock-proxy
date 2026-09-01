#!/usr/bin/env bash
set -e

PROXY_HOST="${PROXY_HOST:-127.0.0.1}"
PROXY_PORT="${PROXY_PORT:-8080}"
CA_CERT="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"

echo "📱 Setting up iOS Simulator Proxy ($PROXY_HOST:$PROXY_PORT)..."

# 1. Attempt system proxy configuration silently (optional if app uses connectionProxyDictionary)
NETWORK_SERVICE=$(networksetup -listallnetworkservices 2>/dev/null | grep -E "Wi-Fi|Ethernet" | head -n 1 || true)
if [ -n "$NETWORK_SERVICE" ]; then
    networksetup -setwebproxy "$NETWORK_SERVICE" "$PROXY_HOST" "$PROXY_PORT" 2>&1 >/dev/null || true
    networksetup -setsecurewebproxy "$NETWORK_SERVICE" "$PROXY_HOST" "$PROXY_PORT" 2>&1 >/dev/null || true
fi

# 2. Install mitmproxy CA cert into booted iOS Simulators (Zero Sudo)
if command -v xcrun &>/dev/null && [ -f "$CA_CERT" ]; then
    BOOTED_SIMS=$(xcrun simctl list devices 2>/dev/null | grep "Booted" | awk -F '[()]' '{print $2}' || true)
    for sim in $BOOTED_SIMS; do
        echo "🔑 Installing mitmproxy CA cert into iOS Simulator ($sim)..."
        xcrun simctl keychain "$sim" add-cert "$CA_CERT" 2>/dev/null || true
    done
fi

echo "✅ iOS Simulator setup complete!"
