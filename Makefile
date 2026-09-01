.PHONY: help start stop ios ios-on ios-off android android-on android-off off status clean

.DEFAULT_GOAL := help

## help: Display all available commands
help:
	@echo "========================================================================"
	@echo " 🚀 Cross-Platform API Mock Proxy - Makefile Shortcuts"
	@echo "========================================================================"
	@echo "  make ios          - Start proxy AND enable iOS Simulator proxy (One-Shot!)"
	@echo "  make android      - Start proxy AND enable Android Emulator proxy (One-Shot!)"
	@echo "  make start        - Start proxy engine & web inspector dashboard"
	@echo "  make stop         - Stop proxy & free ports 8080 and 8081"
	@echo ""
	@echo "  make ios-on       - Enable iOS Simulator network proxy & trust CA cert"
	@echo "  make ios-off      - Disable iOS Simulator network proxy"
	@echo ""
	@echo "  make android-on   - Enable Android Emulator global HTTP proxy (10.0.2.2)"
	@echo "  make android-off  - Disable Android Emulator global HTTP proxy"
	@echo ""
	@echo "  make off          - Disable proxy on all connected devices & macOS"
	@echo "  make status       - Check proxy process & port status"
	@echo "========================================================================"

## ios: Start proxy AND enable iOS Simulator proxy in one command
ios: stop
	@echo "📱 Starting Mock Proxy for iOS Simulator..."
	@./scripts/start.sh &
	@sleep 2
	@./scripts/ios-proxy-on.sh
	@echo "🎉 Proxy is running! Open dashboard at http://localhost:8081/_admin/"

## android: Start proxy AND enable Android Emulator proxy in one command
android: stop
	@echo "🤖 Starting Mock Proxy for Android Emulator..."
	@./scripts/start.sh &
	@sleep 2
	@./scripts/android-proxy-on.sh
	@echo "🎉 Proxy is running! Open dashboard at http://localhost:8081/_admin/"

## start: Start proxy & web inspector dashboard
start:
	@./scripts/start.sh

## stop: Stop proxy & clean up processes on ports 8080 and 8081
stop:
	@./scripts/stop.sh

## ios-on: Enable iOS Simulator network proxy & trust CA cert
ios-on:
	@./scripts/ios-proxy-on.sh

## ios-off: Disable iOS Simulator network proxy
ios-off:
	@./scripts/ios-proxy-off.sh

## android-on: Enable Android Emulator global HTTP proxy
android-on:
	@./scripts/android-proxy-on.sh

## android-off: Disable Android Emulator global HTTP proxy
android-off:
	@./scripts/android-proxy-off.sh

## off: Disable proxy on all platforms
off:
	@./scripts/proxy-off.sh

## status: Check proxy process & port status
status:
	@echo "🔍 Checking proxy process & port status..."
	@lsof -i :8080 -i :8081 || echo "Proxy is currently STOPPED."
