#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

PROXY_PORT="${PROXY_PORT:-8080}"
ADMIN_PORT="${ADMIN_PORT:-8081}"

echo "🛑 Stopping API Mock Proxy & Dashboard processes..."

if [ -f "$DIR/.proxy.pid" ]; then
    while read -r pid; do
        if [ -n "$pid" ]; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done < "$DIR/.proxy.pid"
    rm -f "$DIR/.proxy.pid"
fi

lsof -ti:"$PROXY_PORT","$ADMIN_PORT" | xargs kill -9 2>/dev/null || true
pkill -f "mitmdump" || true
pkill -f "node.*server.js" || true

echo "✅ Proxy stopped cleanly. Ports $PROXY_PORT and $ADMIN_PORT freed."
