# Cross-Platform API Mock Proxy with Real Upstream Passthrough

> **Transparent local HTTP/HTTPS interception proxy engine powered by mitmproxy with real-time web dashboard inspector for iOS, Android, and Web applications.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.9%2B-blue.svg)](https://python.org/)
[![mitmproxy](https://img.shields.io/badge/mitmproxy-9.0%2B-orange.svg)](https://mitmproxy.org/)
[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-brightgreen.svg)]()

---

## 📐 Architecture Overview

```text
┌───────────────────────────────┐
│           iOS Client          │
│   (Simulator / Physical)      │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│         Android Client        │
│    (Emulator / Physical)      │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│          Web Browser          │
│  (Chrome / Safari / Firefox)  │
└───────────────┬───────────────┘
                │
                │ HTTP/HTTPS Transparent Proxy (Port 8080)
                ▼
┌────────────────────────────────────────────────────────┐
│               Local Mock Proxy Engine                  │
│                      (mitmproxy)                       │
│                                                        │
│                  Mock Rule Matching                    │
│                          │                             │
│               ┌──────────┴──────────┐                  │
│               │                     │                  │
│             MATCH                NO MATCH              │
│               │                     │                  │
└───────────────┼─────────────────────┼──────────────────┘
                │                     │
                ▼                     ▼
        Local Fixture File      REAL UPSTREAM API SERVER
       (fixtures/*.json)        (e.g., sm-ple.ajaib.tech,
                                 api.example.com, pokeapi.co)
```

---

## 🎯 Key Requirement: Transparent Passthrough

**The client application NEVER changes its API base URL.**

For example, the application continues calling:
```text
https://sm-ple.ajaib.tech/api/v1/portfolio
https://api.example.com/api/v1/orders
```

- **If an explicit mock rule exists**: The proxy intercepts the request transparently and returns the local JSON fixture or simulated error/delay.
- **If NO mock rule exists (Default)**: The proxy forwards the exact request—unmodified—to the **REAL UPSTREAM SERVER** (`sm-ple.ajaib.tech`, `api.example.com`, etc.) preserving all authentication headers (`Authorization`, `Cookie`, `X-Request-ID`).

> **Principle**: *Mock by exception, passthrough by default.*

---

## 🚀 Quick Start (Makefile Shortcuts)

Using the included **[Makefile](file:///Users/williamhuang/Documents/BOT/ios-mock-proxy/Makefile)**, you can start the proxy and configure your platform in a single command:

```bash
# 📱 One-Shot iOS: Starts proxy AND configures iOS Simulator
make ios

# 🤖 One-Shot Android: Starts proxy AND configures Android Emulator
make android

# 🛑 Stop proxy and free all ports
make stop

# 🛑 Disable proxy on all connected platforms
make off
```

---

### Manual Start

Run the start script directly:
```bash
./start.sh
```

This launches:
- **mitmproxy Interception Engine**: `http://0.0.0.0:8080`
- **Real-Time Web Inspector Dashboard**: `http://localhost:8081/_admin/`

---

## 🛠️ Platform Proxy Configuration & Helper Scripts

### 🍎 iOS

#### iOS Simulator
Enable proxy and auto-install CA cert:
```bash
./scripts/ios-proxy-on.sh
```
To disable proxy:
```bash
./scripts/ios-proxy-off.sh
```

#### iOS Physical Device
1. Connect your iPhone to the same Wi-Fi network as your Mac.
2. Find your Mac's LAN IP address:
   ```bash
   ipconfig getifaddr en0
   ```
3. On your iPhone: Go to **Settings > Wi-Fi > (Your Network) > Configure Proxy > Manual**.
   - **Server**: `<YOUR_MAC_LAN_IP>` (e.g., `192.168.1.50`)
   - **Port**: `8080`
4. Trust CA Certificate (see [HTTPS / TLS Interception Guide](#-https--tls-interception--ca-trust-guide)).

---

### 🤖 Android

#### Android Emulator
The Android Emulator accesses the host Mac's `localhost` via `10.0.2.2`. Enable global HTTP proxy via `adb`:
```bash
./scripts/android-proxy-on.sh
```
To disable proxy:
```bash
./scripts/android-proxy-off.sh
```

#### Android Physical Device
1. Connect device via Wi-Fi or USB with `adb`.
2. Find your Mac's LAN IP address (`ipconfig getifaddr en0`).
3. Set proxy via `adb` (passing your Mac's IP):
   ```bash
   ./scripts/android-proxy-on.sh 192.168.1.50
   ```
4. Or configure manually on Android device: **Settings > Network & Internet > Wi-Fi > (Your Network) > Advanced > Proxy > Manual** (`<MAC_LAN_IP>:8080`).

---

### 🌐 Web Browsers (Chrome / Safari / Firefox)

- **Safari & Chrome (macOS)**: System proxy settings are enabled via `./scripts/ios-proxy-on.sh` or macOS System Settings > Network > Proxies > Web Proxy (HTTP) & Secure Web Proxy (HTTPS) -> `127.0.0.1:8080`.
- **Firefox**: Go to **Settings > Network Settings > Manual proxy configuration**:
  - **HTTP Proxy**: `127.0.0.1` | **Port**: `8080`
  - Check *Also use this proxy for HTTPS*.

To clear all proxy settings on macOS and connected devices:
```bash
./scripts/proxy-off.sh
```

---

## 📋 Mock Rule Configuration (`proxy/rules.yaml`)

Mock rules are defined in `proxy/rules.yaml` (or edited live via the Web Dashboard).

### Example YAML Specification

```yaml
config:
  target_upstream: "sm-ple.ajaib.tech"
  allow_production: true

rules:
  # 1. Mock Portfolio Endpoint
  - name: empty-portfolio
    enabled: true
    method: GET
    host: sm-ple.ajaib.tech
    path: /api/v1/portfolio
    response:
      status: 200
      headers:
        Content-Type: application/json
      fixture: fixtures/portfolio/empty.json

  # 2. Mock Orders Endpoint
  - name: mock-orders
    enabled: true
    method: GET
    host: api.example.com
    path: /api/v1/orders
    response:
      status: 200
      fixture: fixtures/orders/populated.json

  # 3. Latency & Delay Simulation (2000 ms)
  - name: slow-api-simulation
    enabled: true
    method: GET
    host: sm-ple.ajaib.tech
    path: /api/v1/slow
    response:
      status: 200
      delay: 2000
      fixture: fixtures/portfolio/normal.json

  # 4. Simulated Server Error (HTTP 500)
  - name: internal-server-error
    enabled: true
    method: POST
    host: sm-ple.ajaib.tech
    path: /api/v1/orders/error
    response:
      status: 500
      body: '{"error": "Internal Server Error", "code": 500}'

  # 5. Simulated Connection Reset / Network Failure
  - name: network-reset
    enabled: true
    method: GET
    host: sm-ple.ajaib.tech
    path: /api/v1/reset
    response:
      connection_reset: true

  # 6. Simulated Gateway Timeout
  - name: request-timeout
    enabled: true
    method: GET
    host: sm-ple.ajaib.tech
    path: /api/v1/timeout
    response:
      timeout: true
```

---

## 🔑 HTTPS / TLS Interception & CA Trust Guide

Intercepting HTTPS traffic requires installing and trusting mitmproxy's root CA certificate (`mitmproxy-ca-cert.pem`).

### 1. iOS Setup

#### iOS Simulator
Automated via `./scripts/ios-proxy-on.sh` or manually:
```bash
xcrun simctl keychain booted add-cert ~/.mitmproxy/mitmproxy-ca-cert.pem
```

#### iOS Physical Device
1. With proxy enabled on device, open Safari and navigate to `http://mitm.it`.
2. Tap **iOS** to download the configuration profile.
3. Go to **Settings > Profile Downloaded > Install**.
4. Go to **Settings > General > About > Certificate Trust Settings**.
5. Enable **Full Trust** for `mitmproxy`.

---

### 2. Android Setup

Starting with Android 7.0 (API level 24), apps do not trust user-installed CA certificates by default unless explicitly configured in development builds.

#### Development Build Network Security Config
Add `res/xml/network_security_config.xml` to your Android app project:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <debug-overrides>
        <trust-anchors>
            <!-- Trust user-installed CA certs in debug builds -->
            <certificates src="user" />
            <certificates src="system" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

Reference it in `AndroidManifest.xml`:
```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ... >
```

#### Install CA Cert on Android Device/Emulator
1. Open Chrome on Android device/emulator with proxy turned on and navigate to `http://mitm.it`.
2. Download the certificate file.
3. Go to **Settings > Security > Encryption & Credentials > Install a certificate > CA certificate** and select the downloaded `.crt` file.

---

### 3. Web Browsers Setup

- **macOS System Keychain (Chrome & Safari)**:
  ```bash
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem
  ```
- **Firefox**:
  Go to `about:preferences#privacy` > **Certificates > View Certificates > Import...** and select `~/.mitmproxy/mitmproxy-ca-cert.pem`. Check *Trust this CA to identify web sites*.

---

## 🔒 SSL Certificate Pinning Considerations

Installing the proxy CA certificate into the OS trust store **does NOT bypass application-level SSL/TLS Certificate Pinning** (e.g. Alamofire, URLSession, OkHttp `CertificatePinner`, HSTS).

### Strategy for Development Builds

Bypass certificate pinning **strictly in DEBUG / DEVELOPMENT builds**. Never modify production pinning code.

#### 🍏 iOS (Swift / URLSession & Alamofire)
```swift
#if DEBUG
// Allow custom local proxy CA certificate in DEBUG builds
class DebugTrustEvaluator: ServerTrustEvaluating {
    func evaluate(serverTrust: SecTrust, forHost host: String) throws {
        // Accept proxy certificate in development
    }
}

let session = Session(serverTrustManager: ServerTrustManager(evaluators: [
    "sm-ple.ajaib.tech": DisabledTrustEvaluator()
]))
#else
// Production strict SSL pinning
let session = Session(serverTrustManager: ServerTrustManager(evaluators: [
    "sm-ple.ajaib.tech": PinnedCertificatesTrustEvaluator()
]))
#endif
```

#### 🤖 Android (Kotlin / OkHttp)
```kotlin
val builder = OkHttpClient.Builder()

if (BuildConfig.DEBUG) {
    // Skip certificate pinning in development builds
} else {
    val certificatePinner = CertificatePinner.Builder()
        .add("sm-ple.ajaib.tech", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        .build()
    builder.certificatePinner(certificatePinner)
}

val okHttpClient = builder.build()
```

---

## 🌐 Web, CORS & WebSockets Handling

### CORS & Preflight (`OPTIONS`)
Browsers automatically issue HTTP `OPTIONS` preflight requests before sending cross-origin cross-domain requests.
- The proxy automatically attaches `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: *`, and `Access-Control-Allow-Headers: *` to mocked responses.
- Unmatched `OPTIONS` requests pass directly to the real upstream.

### WebSockets (`wss://` / `ws://`)
WebSocket upgrade requests (e.g. `wss://sm-ple.ajaib.tech/socket`) pass through transparently to the real upstream WebSocket server without breaking connection frames.

---

## 🔒 Safety & Production Protection

To prevent accidental traffic interception on production environments:
- The proxy logs a prominent warning on startup:
  ```text
  ⚠️  Mock proxy is running in DEVELOPMENT MODE
  ⚠️  Unmatched HTTP/HTTPS requests will pass to REAL UPSTREAM
  ```
- Sensitive headers (`Authorization`, `Cookie`, `X-Api-Key`, `Password`) are automatically sanitized and redacted in traffic logs.

---

## 📁 Repository Structure

```text
ios-mock-proxy/
├── README.md
├── server.js               # Node.js Web Dashboard & Log Collector
├── start.sh                # Quickstart launcher script
│
├── proxy/
│   ├── mock.py             # mitmproxy transparent interception addon
│   └── rules.yaml          # YAML mock rules configuration
│
├── fixtures/
│   ├── portfolio/
│   │   ├── empty.json
│   │   ├── normal.json
│   │   └── error.json
│   ├── orders/
│   │   ├── empty.json
│   │   └── populated.json
│   └── pokemon/
│       └── pikachu.json
│
└── scripts/
    ├── start.sh            # Starts mitmproxy + Web Admin server
    ├── stop.sh             # Stops all proxy processes
    ├── ios-proxy-on.sh     # Enables iOS Simulator / macOS HTTP proxy
    ├── ios-proxy-off.sh    # Disables iOS proxy
    ├── android-proxy-on.sh # Sets Android http_proxy via adb
    ├── android-proxy-off.sh# Clears Android http_proxy
    └── proxy-off.sh        # Global teardown script
```

---

## ✅ Acceptance Criteria Verification Checklist

| Scenario | Description | Status |
| :--- | :--- | :--- |
| **Scenario 1** | iOS Simulator -> Mocked API (`/portfolio`) -> Returns Local Fixture | ✅ PASS |
| **Scenario 2** | iOS Simulator -> Non-mocked API (`/orders`) -> REAL UPSTREAM | ✅ PASS |
| **Scenario 3** | Android Emulator -> Mocked API (`/portfolio`) -> Returns Local Fixture | ✅ PASS |
| **Scenario 4** | Android Emulator -> Non-mocked API (`/orders`) -> REAL UPSTREAM | ✅ PASS |
| **Scenario 5** | Chrome/Web -> Mocked API (`/portfolio`) -> Returns Local Fixture | ✅ PASS |
| **Scenario 6** | Chrome/Web -> Non-mocked API (`/orders`) -> REAL UPSTREAM | ✅ PASS |
| **Scenario 7** | No Mock Rule -> Upstream Passthrough unmodified | ✅ PASS |
| **Scenario 8** | Disable Proxy (`./scripts/proxy-off.sh`) -> Normal network connection | ✅ PASS |

---

## 📄 License

Non-Commercial Software License. Built for local development and API mocking workflows.
