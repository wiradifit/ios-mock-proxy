import os
import sys
import time
import json
import yaml
import socket
from typing import Optional, Dict, Any, List
from mitmproxy import http

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES_FILE = os.path.join(PROJECT_ROOT, "proxy", "rules.yaml")

def send_admin_log(payload: dict):
    try:
        body = json.dumps(payload).encode("utf-8")
        headers = (
            f"POST /_admin/api/traffic HTTP/1.1\r\n"
            f"Host: 127.0.0.1:8081\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n"
            f"Connection: close\r\n\r\n"
        ).encode("utf-8")
        
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        s.connect(("127.0.0.1", 8081))
        s.sendall(headers + body)
        s.close()
    except Exception:
        pass

class MockProxyAddon:
    def __init__(self):
        self.rules_path = RULES_FILE
        self.mtime = 0
        self.rules: List[Dict[str, Any]] = []
        self.config: Dict[str, Any] = {}
        self.load_rules()
        print(f"🚀 [mitmproxy] MockProxyAddon initialized. Watching: {self.rules_path}")

    def load_rules(self):
        try:
            if os.path.exists(self.rules_path):
                current_mtime = os.path.getmtime(self.rules_path)
                if current_mtime != self.mtime:
                    self.mtime = current_mtime
                    with open(self.rules_path, "r", encoding="utf-8") as f:
                        data = yaml.safe_load(f) or {}
                        self.rules = data.get("rules", [])
                        self.config = data.get("config", {})
                    print(f"🔄 [mitmproxy] Loaded {len(self.rules)} rules from {self.rules_path}")
        except Exception as e:
            print(f"⚠️ [mitmproxy] Error loading rules: {e}", file=sys.stderr)

    def mask_headers(self, headers: Dict[str, str]) -> Dict[str, str]:
        sensitive_keys = {"authorization", "cookie", "x-api-key", "token", "password", "proxy-authorization"}
        sanitized = {}
        for k, v in headers.items():
            if k.lower() in sensitive_keys:
                sanitized[k] = "[REDACTED]"
            else:
                sanitized[k] = v
        return sanitized

    def post_log(self, status_type: str, flow: http.HTTPFlow, response_status: int, duration_ms: float, detail: str = ""):
        try:
            req = flow.request
            req_body = ""
            try:
                req_body = req.get_text(strict=False) or ""
                if len(req_body) > 512 * 1024:
                    req_body = req_body[:512 * 1024] + "\n... [Truncated]"
            except Exception:
                pass

            resp_body = ""
            if flow.response:
                try:
                    resp_body = flow.response.get_text(strict=False) or ""
                    if len(resp_body) > 512 * 1024:
                        resp_body = resp_body[:512 * 1024] + "\n... [Truncated]"
                except Exception:
                    pass

            headers_dict = dict(req.headers)
            sanitized_headers = self.mask_headers(headers_dict)

            payload = {
                "id": flow.id,
                "timestamp": int(time.time() * 1000),
                "type": status_type,
                "method": req.method,
                "host": req.pretty_host,
                "scheme": req.scheme,
                "path": req.path,
                "full_url": req.url,
                "status": response_status,
                "duration_ms": round(duration_ms, 2),
                "detail": detail,
                "request_headers": sanitized_headers,
                "request_body": req_body,
                "response_headers": dict(flow.response.headers) if flow.response else {},
                "response_body": resp_body
            }

            send_admin_log(payload)
        except Exception as e:
            print(f"⚠️ [post_log error] {e}", file=sys.stderr)

    def match_rule(self, flow: http.HTTPFlow) -> Optional[Dict[str, Any]]:
        req = flow.request
        req_host = req.pretty_host
        req_method = req.method.upper()
        req_path = req.path.split("?")[0]
        
        for rule in self.rules:
            if not rule.get("enabled", True):
                continue
            
            # Method match
            rule_method = str(rule.get("method", "*")).upper()
            if rule_method != "*" and rule_method != req_method:
                continue

            # Host match
            rule_host = rule.get("host")
            if rule_host and rule_host != "*":
                if rule_host.startswith("*."):
                    domain = rule_host[2:]
                    if not req_host.endswith(domain):
                        continue
                elif rule_host.lower() != req_host.lower():
                    continue

            # Path match
            rule_path = rule.get("path")
            if rule_path and rule_path != "*":
                if rule_path.endswith("*"):
                    prefix = rule_path[:-1]
                    if not req_path.startswith(prefix):
                        continue
                elif rule_path != req_path:
                    continue

            # Query params match
            rule_query = rule.get("query_params")
            if rule_query and isinstance(rule_query, dict):
                req_query = dict(req.query)
                query_match = True
                for qk, qv in rule_query.items():
                    if req_query.get(qk) != str(qv):
                        query_match = False
                        break
                if not query_match:
                    continue

            # Header match
            rule_headers = rule.get("headers")
            if rule_headers and isinstance(rule_headers, dict):
                header_match = True
                for hk, hv in rule_headers.items():
                    if req.headers.get(hk) != str(hv):
                        header_match = False
                        break
                if not header_match:
                    continue

            # Request body match
            rule_body = rule.get("request_body_contains")
            if rule_body:
                content = req.get_text()
                if rule_body not in content:
                    continue

            # All specified conditions matched
            return rule

        return None

    def request(self, flow: http.HTTPFlow):
        self.load_rules()
        flow.metadata["start_time"] = time.time()

        # Ignore traffic to localhost admin panel
        if flow.request.pretty_host in ("localhost", "127.0.0.1") and flow.request.port == 8081:
            return

        rule = self.match_rule(flow)
        if not rule:
            # Passthrough by default! Real upstream handles request.
            print(f"[PASS] {flow.request.method} {flow.request.pretty_host}{flow.request.path} → REAL UPSTREAM")
            return

        # Handle matched rule response
        resp_conf = rule.get("response", {})
        
        # 1. Connection Reset simulation
        if resp_conf.get("connection_reset"):
            print(f"[MOCK-RESET] {flow.request.method} {flow.request.pretty_host}{flow.request.path} → Connection Reset")
            duration = (time.time() - flow.metadata.get("start_time", time.time())) * 1000
            flow.metadata["logged"] = True
            self.post_log("ERROR", flow, 0, duration, f"Rule '{rule.get('name')}' - Connection Reset")
            flow.kill()
            return

        # 2. Timeout simulation
        if resp_conf.get("timeout"):
            print(f"[MOCK-TIMEOUT] {flow.request.method} {flow.request.pretty_host}{flow.request.path} → Timeout Simulation")
            time.sleep(15.0)
            duration = (time.time() - flow.metadata.get("start_time", time.time())) * 1000
            flow.metadata["logged"] = True
            self.post_log("ERROR", flow, 504, duration, f"Rule '{rule.get('name')}' - Timeout")
            flow.response = http.Response.make(504, b"Gateway Timeout (Simulated)", {"Content-Type": "text/plain"})
            return

        # 3. Delay simulation
        delay_ms = resp_conf.get("delay", 0)
        if delay_ms > 0:
            time.sleep(delay_ms / 1000.0)

        # 4. Response Content (Fixture or Body)
        status_code = resp_conf.get("status", 200)
        headers = resp_conf.get("headers", {})
        if "Content-Type" not in headers and "content-type" not in headers:
            headers["Content-Type"] = "application/json; charset=utf-8"

        headers["Access-Control-Allow-Origin"] = "*"
        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, X-Request-ID"

        body_bytes = b""
        fixture_path = resp_conf.get("fixture")
        if fixture_path:
            full_fixture_path = os.path.join(PROJECT_ROOT, fixture_path)
            if os.path.exists(full_fixture_path):
                with open(full_fixture_path, "rb") as f:
                    body_bytes = f.read()
            else:
                body_bytes = json.dumps({"error": f"Fixture file not found: {fixture_path}"}).encode("utf-8")
                status_code = 404
        elif "body" in resp_conf:
            body_val = resp_conf["body"]
            if isinstance(body_val, (dict, list)):
                body_bytes = json.dumps(body_val).encode("utf-8")
            else:
                body_bytes = str(body_val).encode("utf-8")

        flow.response = http.Response.make(
            status_code,
            body_bytes,
            headers
        )

        duration = (time.time() - flow.metadata.get("start_time", time.time())) * 1000
        detail = f"Rule '{rule.get('name')}'" + (f" (fixture: {fixture_path})" if fixture_path else "")
        print(f"[MOCK] {flow.request.method} {flow.request.pretty_host}{flow.request.path} → {status_code} ({detail})")
        flow.metadata["logged"] = True
        self.post_log("MOCK", flow, status_code, duration, detail)

    def response(self, flow: http.HTTPFlow):
        if not flow.response or flow.metadata.get("logged"):
            return
        flow.metadata["logged"] = True
        duration = (time.time() - flow.metadata.get("start_time", time.time())) * 1000
        log_type = "ERROR" if flow.response.status_code >= 400 else "PASS"
        self.post_log(log_type, flow, flow.response.status_code, duration, "Real Upstream Passthrough")

addons = [MockProxyAddon()]
