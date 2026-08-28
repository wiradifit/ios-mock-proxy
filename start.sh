#!/bin/bash

# ios-mock-proxy Quick Launcher
# Zero dependencies, zero sudo required

cd "$(dirname "$0")"

echo "=================================================="
echo "  ⚡ Starting ios-mock-proxy Server..."
echo "=================================================="

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed or not found in PATH."
    echo "Please install Node.js (v14+) to run LocalMockAPI."
    exit 1
fi

# Run server
node server.js
