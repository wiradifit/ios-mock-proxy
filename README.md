# ios-mock-proxy

> **Zero-sudo local API mocking and reverse proxy engine with a real-time web dashboard for iOS, mobile, and web engineers.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0%20(Zero)-blue.svg)]()
[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Flutter%20%7C%20React%20Native%20%7C%20Web-orange.svg)]()
[![License](https://img.shields.io/badge/License-Non--Commercial-red.svg)](LICENSE)

---

## Overview

Mocking API responses during iOS Simulator and mobile client development is often hindered by friction:
- **Root and Sudo Requirements**: Traditional proxies (Charles, Proxyman, Mitmproxy) require system helper tools and `sudo` access, which are blocked on corporate-managed machines.
- **SSL Certificate Overhead**: Installing and trusting custom root CA certificates inside the iOS Simulator trust store regularly causes issues with App Transport Security (ATS) and VPN tunnels.
- **Xcode Limitations**: Xcode lacks built-in visual API interception and lightweight local mocking.

### Architecture: User-Space Reverse Proxy
`ios-mock-proxy` operates as a user-space reverse proxy on `http://localhost:8080`:
- **No `sudo` or admin privileges required**.
- **No root CA SSL certificate installation**.
- **Zero npm dependencies** (built entirely with native Node.js core modules).
- **Multi-Platform Support**: Built for **iOS Simulator**, **Android Emulator**, **Flutter**, **React Native**, and **Web Frontends**.

```
+---------------------------------------------------------------------------------------------------+
|                        Client Apps (iOS / Android / Flutter / RN / Web)                           |
|                     Base URL: http://localhost:8080 (or http://10.0.2.2:8080)                     |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      ios-mock-proxy Server                                        |
|                                                                                                   |
|  +---------------------------+                      +------------------------------------------+  |
|  |     Mock Rule Matched?    | ------- YES -------> | Return Simulated Response (Local Engine) |  |
|  +---------------------------+                      +------------------------------------------+  |
|                |                                                                                  |
|               NO                                                                                  |
|                v                                                                                  |
|  +---------------------------+                      +------------------------------------------+  |
|  |   Modify Request Rule?    | ------- YES -------> | Mutate Body / Params & Proxy to Upstream |  |
|  +---------------------------+                      +------------------------------------------+  |
|                |                                                         |                        |
|               NO                                                         |                        |
|                +----------------------------+----------------------------+                        |
|                                             |                                                     |
|                                             v                                                     |
|                               Forward to Remote Upstream                                          |
|                              (e.g., https://pokeapi.co)                                           |
+---------------------------------------------------------------------------------------------------+
                                              |
                                              v
+---------------------------------------------------------------------------------------------------+
|                    Live Web Dashboard (SSE Stream): http://localhost:8080/_admin/                  |
+---------------------------------------------------------------------------------------------------+
```

---

## Core Features

- **Zero-Sudo Operation**: Runs entirely as a standard user process on your Mac without modifying network interfaces or certificate trust stores.
- **Zero External Dependencies**: Built strictly on Node.js core libraries (`http`, `https`, `url`, `zlib`, `crypto`, `fs`).
- **Real-Time Traffic Inspector**: Streams incoming requests, query parameters, request bodies, response headers, and timings via Server-Sent Events (SSE).
- **Deep Search & Filtering**: Search across endpoint paths, HTTP verbs, status codes, query strings, headers, and request/response JSON payloads.
- **Dual Mock & Rewrite Capabilities**:
  - **Mock Response**: Return custom JSON payloads with simulated HTTP status codes (`200`, `400`, `401`, `404`, `422`, `500`) and configurable network latency.
  - **Modify Request (Proxy Mutation)**: Intercept outgoing requests, mutate query parameters or request body, and forward the modified payload to upstream.
- **Integrated CodeMirror Editor**: In-browser JSON editor with line numbers, code folding, active line highlight, and formatting.
- **One-Click Rule Creation**: Convert any recorded network call from the live traffic pane directly into a mock rule.
- **Upstream Fallback**: Unmatched routes are proxied to the configured upstream staging or production backend.

---

## Visual Preview

### 1. Live Traffic Inspector
Inspect incoming requests, headers, query parameters, request bodies, and mock status in real time:

![Live Traffic Inspector](assets/screenshots/dashboard_live_traffic.png)

---

### 2. Mock Rule Editor
Create or edit mock responses with syntax highlighting, line numbers, and JSON folding:

![Mock Rule Editor](assets/screenshots/create_mock_rule.png)

---

## Quickstart Tutorial: Mocking an API in 3 Steps

### Step 1: Define Your Mock Rule in Dashboard
1. Open `http://localhost:8080/_admin/` and click **+ New Rule**.
2. Set Endpoint Path to `/api/v2/pokemon/pikachu` and Status Code to `200 OK`.
3. Enter your JSON payload:
   ```json
   {
     "id": 25,
     "name": "pikachu",
     "base_experience": 112,
     "height": 4,
     "weight": 60,
     "is_default": true,
     "types": [
       { "slot": 1, "type": { "name": "electric" } }
     ],
     "abilities": [
       { "ability": { "name": "static" }, "is_hidden": false }
     ],
     "stats": [
       { "base_stat": 35, "stat": { "name": "hp" } },
       { "base_stat": 55, "stat": { "name": "attack" } },
       { "base_stat": 90, "stat": { "name": "speed" } }
     ]
   }
   ```
4. Click **Save Mock Rule**.

### Step 2: Call the Endpoint from your iOS App or Terminal
Run the request from your iOS Simulator or terminal:
```bash
curl -i http://localhost:8080/api/v2/pokemon/pikachu
```

### Step 3: Instant Live Verification
Your iOS app instantly receives the mocked JSON payload, and the request appears live in the **Live Traffic** pane with a `[MOCK]` badge!
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Access-Control-Allow-Origin: *

{
  "id": 25,
  "name": "pikachu",
  "base_experience": 112,
  "height": 4,
  "weight": 60,
  "is_default": true,
  "types": [
    { "slot": 1, "type": { "name": "electric" } }
  ],
  "abilities": [
    { "ability": { "name": "static" }, "is_hidden": false }
  ],
  "stats": [
    { "base_stat": 35, "stat": { "name": "hp" } },
    { "base_stat": 55, "stat": { "name": "attack" } },
    { "base_stat": 90, "stat": { "name": "speed" } }
  ]
}
```

---

## Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js 18+ | Zero-dependency HTTP/HTTPS reverse proxy and static server |
| **Persistence** | File JSON Storage (`data/`) | Atomic file-based storage for rules and configuration |
| **Live Streaming** | Server-Sent Events (SSE) | Real-time traffic broadcast to dashboard |
| **Frontend UI** | HTML5, CSS3, ES6+ JavaScript | Dark-themed responsive dashboard |
| **Editor** | CodeMirror 5 | Embedded JSON editor with folding ribbon |

---

## Quick Start

### 1. Clone & Run

```bash
git clone https://github.com/wiradifit/ios-mock-proxy.git
cd ios-mock-proxy
./start.sh
```

*(Alternatively, run `npm start` or `node server.js`)*

### 2. Open the Web Dashboard

Navigate to:

[http://localhost:8080/_admin/](http://localhost:8080/_admin/)

In the top bar, enter your remote staging URL (e.g. `https://pokeapi.co`) and click **Save**.

---

## Multi-Platform Integration Guides

### iOS (Swift, SwiftUI, UIKit, Alamofire, Moya)

Because the iOS Simulator runs on your Mac's network loopback, you can connect directly to `localhost`:

```swift
// Swift API Configuration Example
struct APIConfig {
    #if DEBUG
    // Point to local mock proxy during development & testing
    static let baseURL = URL(string: "http://localhost:8080/api/")!
    #else
    static let baseURL = URL(string: "https://api.example.com/api/")!
    #endif
}
```

> **Physical iPhone on Wi-Fi:**
> If testing on a physical iOS device connected to the same Wi-Fi as your Mac, find your Mac's local IP via `ipconfig getifaddr en0` and set `baseURL = URL(string: "http://192.168.1.50:8080/api/")!`.

> **App Transport Security (ATS) Note:**
> Ensure local HTTP loads are enabled in your app's `Info.plist` during development:
> ```xml
> <key>NSAppTransportSecurity</key>
> <dict>
>     <key>NSAllowsLocalNetworking</key>
>     <true/>
> </dict>
> ```

---

### Android (Kotlin, Java, Retrofit, OkHttp)

Android Emulators access the host machine's `localhost` via the special IP `10.0.2.2`:

```kotlin
// Kotlin / Retrofit Configuration Example
val baseUrl = if (BuildConfig.DEBUG) {
    "http://10.0.2.2:8080/api/" // Points to your Mac's localhost:8080
} else {
    "https://api.example.com/api/"
}
```

---

### Flutter & React Native

```dart
// Flutter (Dart) Example
import 'dart:io';

String getBaseUrl() {
  if (Platform.isAndroid) {
    return 'http://10.0.2.2:8080/api'; // Android Emulator
  } else {
    return 'http://localhost:8080/api'; // iOS Simulator & macOS
  }
}
```

```typescript
// React Native Example
import { Platform } from 'react-native';

const BASE_URL = Platform.select({
  ios: 'http://localhost:8080/api',
  android: 'http://10.0.2.2:8080/api',
  default: 'http://localhost:8080/api',
});
```

---

### Web & Single-Page Apps (React, Vue, Vite, Next.js, Axios)

Set your `.env.development` or Axios base URL:

```bash
VITE_API_BASE_URL=http://localhost:8080/api
```

---

## Mocking & Request Mutation Rules

### 1. Mock Response Mode
Simulate responses without touching the backend:
- **HTTP Status Codes**: `200`, `201`, `400`, `401`, `403`, `404`, `422`, `500`, `502`, `503`.
- **Latency Simulation**: Add `500ms`, `2000ms`, etc., to test UI skeleton loaders and timeout edge cases.
- **Payload Editing**: Full syntax-highlighted JSON editor with brace folding.

### 2. Modify Request (Proxy Rewrite Mode)
Intercept and mutate incoming requests before they hit the upstream backend:
- **Query Params Override**: Add, update, or remove (`null`) query parameters dynamically.
- **Request Body Override**: Replace the request JSON payload on the fly.

### 3. URL Matching Types
- **Exact Path (`exact`)**: Matches exact path (e.g., `/api/v1/users/profile`).
- **Prefix Match (`prefix`)**: Matches any URL starting with the prefix (e.g., `/api/v1/auth/`).
- **Wildcard Match (`wildcard`)**: Glob pattern matching (e.g., `/api/v1/orders/*/details`).

---

## Project Structure

```
ios-mock-proxy/
├── README.md               # Complete multi-platform documentation
├── package.json            # Project manifest & keywords
├── start.sh                # Instant startup script
├── server.js               # Zero-dependency reverse proxy & SSE server
├── data/
│   ├── config.json         # Server configuration (port, upstream, mode)
│   └── rules.json          # Persistent mock & rewrite rules
└── public/
    ├── index.html          # Web GUI Dashboard
    ├── style.css           # Modern dark-mode styling
    └── app.js              # Live SSE traffic inspector & CodeMirror logic
```

---

## REST Admin API Reference

The dashboard interacts with `ios-mock-proxy` via internal REST endpoints:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/_api/events` | Server-Sent Events (SSE) live traffic stream |
| `GET` | `/_api/config` | Get current server configuration |
| `POST` | `/_api/config` | Update server configuration (upstream, mode, port) |
| `GET` | `/_api/rules` | List all mock and rewrite rules |
| `POST` | `/_api/rules` | Create or update a rule |
| `POST` | `/_api/rules/:id/toggle` | Toggle rule enabled/disabled status |
| `DELETE` | `/_api/rules/:id` | Delete a rule |
| `GET` | `/_api/traffic` | Retrieve in-memory traffic history |
| `DELETE` | `/_api/traffic` | Clear recorded traffic logs |

---

## Security Architecture & Network Safety

`ios-mock-proxy` is engineered with defense-in-depth measures to ensure safe local network interception:

### 1. Zero-Sudo & User-Space Isolation
- Runs entirely as an unprivileged, standard user process.
- Does not modify OS network adapter configurations, packet filters (`pf`), or system trust stores.
- Does not install kernel extensions or background system daemons.

### 2. Path Traversal & File Access Protection
- All static asset requests under `/_admin/` are strictly normalized and resolved against `public/`.
- Paths attempting traversal (e.g. `/_admin/../../../../etc/passwd`) are detected and blocked with `403 Forbidden: Access Denied`.

### 3. Denial of Service (DoS) & Memory Exhaustion Defenses
- **Payload Ceiling (`MAX_BODY_SIZE = 25 MB`)**: Request streams exceeding 25 MB are immediately terminated with `413 Payload Too Large`.
- **Log Payload Bounding (`512 KB`)**: Traffic history payloads are truncated in the UI logger to prevent memory exhaustion during heavy sessions.
- **Ring-Buffered Logs (`maxTrafficHistory = 150`)**: In-memory logs automatically roll over to guarantee fixed memory consumption.

### 4. Protocol Validation & Anti-SSRF Safeguards
- Upstream target URLs are strictly validated to allow only `http://` and `https://` schemes.
- Configuration payloads are scrubbed to eliminate Prototype Pollution (`__proto__`, `constructor`, `prototype`).

### 5. Sensitive Token Hygiene & Volatility
- All live traffic logs are stored **strictly in volatile memory** (RAM).
- No request/response bodies, bearer tokens, or session cookies are ever written to disk or transmitted to third-party telemetry services.
- Stopping the server process immediately wipes all recorded traffic history from memory.

### 6. Network Interface Binding (`0.0.0.0` vs `127.0.0.1`)
- By default, the server binds to `0.0.0.0` to permit physical iPhones and Android devices on the same local Wi-Fi to reach the proxy.
- For strict, isolated localhost-only binding (e.g. on untrusted public Wi-Fi networks), you can set `HOST=127.0.0.1`:
  ```bash
  HOST=127.0.0.1 ./start.sh
  ```

> **Development Use Only Notice:** `ios-mock-proxy` is intended exclusively for local development, staging verification, and automated testing. It should never be exposed as an unauthenticated gateway to the public internet.

---

## FAQ & Troubleshooting

### Port 8080 is in use
Pass a custom port when starting:
```bash
PORT=8888 ./start.sh
```

### Self-Signed Upstream Staging Certificates
`ios-mock-proxy` sets `rejectUnauthorized: false` automatically, allowing proxying to private staging servers with self-signed SSL certificates.

---

## License & Legal Notice

This project is licensed under a **Custom Non-Commercial Software License Agreement**:
- **Free for Personal, Educational, and Research Use**: You are free to run, modify, and test this project for personal, hobbyist, and non-commercial development.
- **Commercial Use & Commercialization Strictly Prohibited**: Any unauthorized commercial use, commercial distribution, sublicensing, SaaS hosting for revenue, or incorporation into commercial products is strictly prohibited without prior explicit written license from **Prawira Hadi Fitrajaya**.
- **Legal Enforcement**: This software is protected by international treaties (Berne Convention, WIPO Copyright Treaty, TRIPS, DMCA) and national statutory copyright legislation (UU No. 28/2014 tentang Hak Cipta). Unauthorized commercialization constitutes willful infringement and will be prosecuted under civil and criminal legal jurisdictions.

For commercial licensing and permissions, contact: `fttrajayaprawira@gmail.com`.

See the full [LICENSE](LICENSE) file for complete legal terms.

---

## Contributing

Contributions, bug fixes, UI improvements, and feature proposals from the developer community are welcome.

### How to Contribute
1. **Fork the Repository**: Click the **Fork** button at the top right of the GitHub repo.
2. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make Your Improvements**: Adhere to the zero-dependency, pure Node.js architecture.
4. **Commit Your Work**:
   ```bash
   git commit -m "feat: description of your improvement"
   ```
5. **Push to Your Fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
6. **Submit a Pull Request (PR)**: Open a PR targeting the `main` branch.

> **Branch Protection & Review Notice:**  
> The `main` branch is protected with branch policies. Direct commits are restricted, and all Pull Requests must be reviewed and approved by the author and repository maintainer (**Prawira Hadi Fitrajaya** / `fitrajayaprawira@gmail.com`).

---

## Author & Maintainer

**Prawira Hadi Fitrajaya** ([@wiradifit](https://github.com/wiradifit))  
Email: `fttrajayaprawira@gmail.com`
