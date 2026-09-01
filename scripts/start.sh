#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

PROXY_HOST="${PROXY_HOST:-0.0.0.0}"
PROXY_PORT="${PROXY_PORT:-8080}"
ADMIN_PORT="${ADMIN_PORT:-8081}"
VENV_PYTHON="$DIR/venv/bin/python3"
MITMDUMP="$DIR/venv/bin/mitmdump"

echo "============================================================"
echo " 🚀 Starting Cross-Platform API Mock Proxy with Upstream Passthrough"
echo "============================================================"
echo " ⚠️  Mock proxy is running in DEVELOPMENT MODE"
echo " ⚠️  Unmatched HTTP/HTTPS requests will pass to REAL UPSTREAM"
echo " -----------------------------------------------------------"
echo " 📍 HTTP/HTTPS Proxy Address : http://$PROXY_HOST:$PROXY_PORT"
echo " 🌐 Web Inspector Dashboard   : http://localhost:$ADMIN_PORT/_admin/"
echo " 📄 Mock Rules Config        : $DIR/proxy/rules.yaml"
echo "============================================================"

# Ensure venv exists
if [ ! -f "$MITMDUMP" ]; then
    echo "📦 Initializing Python virtualenv and installing mitmproxy..."
    python3 -m venv "$DIR/venv"
    "$DIR/venv/bin/pip" install mitmproxy pyyaml
fi

# Force kill any process occupying ports 8080 or 8081
echo "🧹 Cleaning up old processes on ports $PROXY_PORT and $ADMIN_PORT..."
lsof -ti:"$PROXY_PORT","$ADMIN_PORT" | xargs kill -9 2>/dev/null || true
pkill -f "mitmdump" || true
pkill -f "node.*server.js" || true
sleep 1

# Start Node.js Web Dashboard in background
echo "🟢 Starting Web Admin Inspector on port $ADMIN_PORT..."
ADMIN_PORT="$ADMIN_PORT" PROXY_PORT="$PROXY_PORT" node "$DIR/server.js" &
NODE_PID=$!

# Start mitmproxy engine in foreground
echo "🟢 Starting mitmproxy engine on $PROXY_HOST:$PROXY_PORT..."
ADMIN_LOG_URL="http://127.0.0.1:$ADMIN_PORT/_admin/api/traffic" \
"$MITMDUMP" -p "$PROXY_PORT" --listen-host "$PROXY_HOST" -s "$DIR/proxy/mock.py" --set ssl_insecure=true &
MITM_PID=$!

# Save PIDs to temporary file
echo "$NODE_PID" > "$DIR/.proxy.pid"
echo "$MITM_PID" >> "$DIR/.proxy.pid"

trap 'echo "Stopping proxy..."; kill $NODE_PID $MITM_PID 2>/dev/null || true; exit 0' INT TERM

wait $MITM_PID $NODE_PID
