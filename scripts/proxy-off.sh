#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🛑 Turning off proxy on all connected platforms..."

"$DIR/ios-proxy-off.sh" || true
"$DIR/android-proxy-off.sh" 2>/dev/null || true

echo "✅ All system/device proxy settings restored to direct connection."
