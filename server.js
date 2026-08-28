/**
 * ----------------------------------------------------------------------------------
 * ios-mock-proxy (LocalMockAPI)
 * ----------------------------------------------------------------------------------
 * @author       Prawira Hadi Fitrajaya (@wiradifit)
 * @email        fttrajayaprawira@gmail.com
 * @copyright    Copyright (c) 2026 Prawira Hadi Fitrajaya. All Rights Reserved.
 * @license      Non-Commercial Software License Agreement
 * ----------------------------------------------------------------------------------
 * LEGAL NOTICE:
 * This software and its architecture are strictly licensed for personal, educational,
 * and non-commercial development purposes. Commercialization, unauthorized distribution,
 * resale, sublicensing, or proprietary inclusion without express written consent from
 * Prawira Hadi Fitrajaya is strictly prohibited and subject to civil and criminal legal
 * enforcement under national copyright law (UU No. 28/2014) and international treaties
 * (Berne Convention, WIPO Copyright Treaty, TRIPS, DMCA).
 * ----------------------------------------------------------------------------------
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');
const crypto = require('crypto');

// File paths
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const RULES_FILE = path.join(DATA_DIR, 'rules.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// State
let config = {
  port: 8080,
  upstream: 'https://api.example.com',
  mockMode: 'fallback', // 'fallback' | 'mock_only' | 'passthrough'
  recordTraffic: true,
  maxTrafficHistory: 150
};

let rules = [];
const trafficLogs = [];
const sseClients = new Set();

// Load persistent data
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } else {
      saveConfig();
    }
  } catch (err) {
    console.error('[Config] Failed to load config:', err.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[Config] Failed to save config:', err.message);
  }
}

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
    } else {
      saveRules();
    }
  } catch (err) {
    console.error('[Rules] Failed to load rules:', err.message);
  }
}

function saveRules() {
  try {
    fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), 'utf8');
  } catch (err) {
    console.error('[Rules] Failed to save rules:', err.message);
  }
}

loadConfig();
loadRules();

// Security & Performance Limits
const MAX_BODY_SIZE = 25 * 1024 * 1024; // 25 MB max request body limit
const MAX_LOG_BODY_LENGTH = 512 * 1024; // 512 KB preview limit per traffic log to prevent memory bloat

// Helper: Broadcast SSE event to all connected UI clients
function broadcastEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Helper: Truncate large body string for memory-safe traffic logging
function truncateForLog(bodyStr) {
  if (!bodyStr || typeof bodyStr !== 'string') return bodyStr || '';
  if (bodyStr.length > MAX_LOG_BODY_LENGTH) {
    return bodyStr.substring(0, MAX_LOG_BODY_LENGTH) + '\n\n... [Log truncated: payload exceeds 512 KB]';
  }
  return bodyStr;
}

// Helper: Add traffic log and notify SSE
function addTrafficLog(log) {
  if (!config.recordTraffic) return;
  
  // Safe bounded log entry
  const safeLog = {
    ...log,
    request: log.request ? {
      ...log.request,
      body: truncateForLog(log.request.body)
    } : {},
    response: log.response ? {
      ...log.response,
      body: truncateForLog(log.response.body)
    } : {}
  };

  trafficLogs.unshift(safeLog);
  if (trafficLogs.length > (config.maxTrafficHistory || 150)) {
    trafficLogs.pop();
  }
  broadcastEvent('traffic', safeLog);
}

// Helper: Read complete request body with DoS protection
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Helper: Match URL rule
function matchRule(reqMethod, reqUrl, rule) {
  if (!rule.enabled) return false;

  // Method check
  if (rule.method && rule.method !== 'ALL' && rule.method.toUpperCase() !== reqMethod.toUpperCase()) {
    return false;
  }

  const parsed = url.parse(reqUrl);
  const reqPath = parsed.pathname || '/';
  const rulePath = rule.path || '';

  const matchType = rule.matchType || 'exact';

  if (matchType === 'exact') {
    return reqPath === rulePath || reqUrl === rulePath;
  }

  if (matchType === 'prefix') {
    return reqPath.startsWith(rulePath);
  }

  if (matchType === 'wildcard' || matchType === 'regex') {
    try {
      const pattern = matchType === 'wildcard'
        ? '^' + rulePath.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
        : rulePath;
      const regex = new RegExp(pattern);
      return regex.test(reqPath) || regex.test(reqUrl);
    } catch (e) {
      return false;
    }
  }

  return false;
}

// Helper: Parse JSON safely
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// Decompress response body for traffic inspection
function decompressBody(buffer, contentEncoding) {
  try {
    if (!buffer || buffer.length === 0) return '';
    const encoding = (contentEncoding || '').toLowerCase();
    if (encoding.includes('gzip')) {
      return zlib.gunzipSync(buffer).toString('utf8');
    } else if (encoding.includes('deflate')) {
      return zlib.inflateSync(buffer).toString('utf8');
    } else if (encoding.includes('br')) {
      return zlib.brotliDecompressSync(buffer).toString('utf8');
    }
    return buffer.toString('utf8');
  } catch (e) {
    return buffer.toString('utf8');
  }
}

// Handle Admin API & Static UI
async function handleAdmin(req, res, parsedUrl) {
  const { pathname } = parsedUrl;
  const method = req.method.toUpperCase();

  // Admin APIs
  if (pathname === '/_api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(':\n\n'); // Ping
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (pathname === '/_api/config' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(config));
  }

  if (pathname === '/_api/config' && method === 'POST') {
    const rawBody = await readRequestBody(req);
    const updated = safeJsonParse(rawBody.toString('utf8'));
    if (updated) {
      // Validate upstream protocol if provided
      if (updated.upstream) {
        const trimmed = updated.upstream.trim();
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Upstream URL must start with http:// or https://' }));
        }
      }
      
      // Prevent prototype pollution
      delete updated.__proto__;
      delete updated.constructor;
      delete updated.prototype;

      config = { ...config, ...updated };
      saveConfig();
      broadcastEvent('config_updated', config);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ status: 'ok', config }));
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid JSON' }));
  }

  if (pathname === '/_api/rules' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(rules));
  }

  if (pathname === '/_api/rules' && method === 'POST') {
    const rawBody = await readRequestBody(req);
    const ruleData = safeJsonParse(rawBody.toString('utf8'));
    if (!ruleData || !ruleData.path) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Rule requires at least a path' }));
    }

    // Prevent prototype pollution
    delete ruleData.__proto__;
    delete ruleData.constructor;
    delete ruleData.prototype;

    if (!ruleData.id) {
      ruleData.id = 'rule_' + crypto.randomBytes(6).toString('hex');
    }

    const existingIndex = rules.findIndex(r => r.id === ruleData.id);
    if (existingIndex >= 0) {
      rules[existingIndex] = { ...rules[existingIndex], ...ruleData };
    } else {
      rules.unshift(ruleData);
    }
    saveRules();
    broadcastEvent('rules_updated', rules);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ status: 'ok', rule: ruleData }));
  }

  if (pathname.startsWith('/_api/rules/') && pathname.endsWith('/toggle') && method === 'POST') {
    const id = pathname.replace('/_api/rules/', '').replace('/toggle', '');
    const rule = rules.find(r => r.id === id);
    if (rule) {
      rule.enabled = !rule.enabled;
      saveRules();
      broadcastEvent('rules_updated', rules);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ status: 'ok', rule }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Rule not found' }));
  }

  if (pathname.startsWith('/_api/rules/') && method === 'DELETE') {
    const id = pathname.replace('/_api/rules/', '');
    rules = rules.filter(r => r.id !== id);
    saveRules();
    broadcastEvent('rules_updated', rules);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  if (pathname === '/_api/traffic' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(trafficLogs));
  }

  if (pathname === '/_api/traffic' && method === 'DELETE') {
    trafficLogs.length = 0;
    broadcastEvent('traffic_cleared', {});
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  // Static Assets for Dashboard UI (Path Traversal Protected)
  let filePath = pathname.replace(/^\/_admin/, '');
  if (filePath === '' || filePath === '/') filePath = '/index.html';
  
  // Normalize and prevent path traversal
  const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  const absolutePath = path.resolve(PUBLIC_DIR, '.' + (normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath));

  // Verify file resides strictly within PUBLIC_DIR
  if (!absolutePath.startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden: Access Denied');
  }

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    return fs.createReadStream(absolutePath).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// Proxy incoming request to upstream server
async function proxyToUpstream(req, res, reqBody, startTime, logId) {
  if (!config.upstream || !config.upstream.trim()) {
    const duration = Date.now() - startTime;
    const errorBody = {
      error: 'NO_UPSTREAM_CONFIGURED',
      message: 'No mock matched and no Upstream Target URL is configured in LocalMockAPI.',
      tip: 'Open http://localhost:' + (config.port || 8080) + '/_admin to set your Staging upstream URL or add a mock rule.'
    };
    const bodyStr = JSON.stringify(errorBody, null, 2);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(bodyStr);

    addTrafficLog({
      id: logId,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      path: url.parse(req.url).pathname,
      status: 502,
      duration,
      isMock: false,
      error: 'No upstream configured',
      request: {
        headers: req.headers,
        queryParams: url.parse(req.url, true).query,
        body: reqBody ? reqBody.toString('utf8') : ''
      },
      response: {
        headers: { 'content-type': 'application/json' },
        body: bodyStr
      }
    });
    return;
  }

  let upstreamBase = config.upstream.trim();
  if (!upstreamBase.startsWith('http://') && !upstreamBase.startsWith('https://')) {
    upstreamBase = 'https://' + upstreamBase;
  }

  const upstreamParsed = url.parse(upstreamBase);
  const isHttps = upstreamParsed.protocol === 'https:';
  const clientLib = isHttps ? https : http;

  const targetPath = (upstreamParsed.pathname === '/' ? '' : (upstreamParsed.pathname || '')) + req.url;
  const proxyHeaders = { ...req.headers };
  proxyHeaders.host = upstreamParsed.host;

  // Prevent keep-alive socket hang issues
  proxyHeaders['connection'] = 'close';

  const options = {
    protocol: upstreamParsed.protocol,
    hostname: upstreamParsed.hostname,
    port: upstreamParsed.port || (isHttps ? 443 : 80),
    path: targetPath,
    method: req.method,
    headers: proxyHeaders,
    rejectUnauthorized: false // Allow self-signed staging certs if any
  };

  const proxyReq = clientLib.request(options, (proxyRes) => {
    const resChunks = [];

    // Forward response headers to client
    const clientResHeaders = { ...proxyRes.headers };
    // Enable CORS for ease of testing
    clientResHeaders['access-control-allow-origin'] = '*';
    clientResHeaders['access-control-allow-headers'] = '*';
    clientResHeaders['access-control-allow-methods'] = '*';

    res.writeHead(proxyRes.statusCode, clientResHeaders);

    proxyRes.on('data', (chunk) => {
      resChunks.push(chunk);
      res.write(chunk);
    });

    proxyRes.on('end', () => {
      res.end();
      const duration = Date.now() - startTime;
      const fullResBuffer = Buffer.concat(resChunks);
      const decompressedBody = decompressBody(fullResBuffer, proxyRes.headers['content-encoding']);

      addTrafficLog({
        id: logId,
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        path: url.parse(req.url).pathname,
        status: proxyRes.statusCode,
        duration,
        isMock: false,
        upstream: upstreamBase,
        request: {
          headers: req.headers,
          queryParams: url.parse(req.url, true).query,
          body: reqBody ? reqBody.toString('utf8') : ''
        },
        response: {
          headers: proxyRes.headers,
          body: decompressedBody
        }
      });
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] ${req.method} ${req.url} -> ${err.message}`);
    const duration = Date.now() - startTime;
    const errorBody = {
      error: 'UPSTREAM_PROXY_ERROR',
      message: `Failed to proxy to upstream: ${err.message}`,
      target: upstreamBase
    };
    const bodyStr = JSON.stringify(errorBody, null, 2);

    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(bodyStr);
    }

    addTrafficLog({
      id: logId,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      path: url.parse(req.url).pathname,
      status: 502,
      duration,
      isMock: false,
      error: err.message,
      request: {
        headers: req.headers,
        queryParams: url.parse(req.url, true).query,
        body: reqBody ? reqBody.toString('utf8') : ''
      },
      response: {
        headers: { 'content-type': 'application/json' },
        body: bodyStr
      }
    });
  });

  if (reqBody && reqBody.length > 0) {
    proxyReq.write(reqBody);
  }
  proxyReq.end();
}

// Main HTTP Server
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const logId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const parsedUrl = url.parse(req.url, true);

  // Handle CORS preflight for all endpoints
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // Route: Admin Web GUI and Admin API
  if (parsedUrl.pathname.startsWith('/_admin') || parsedUrl.pathname.startsWith('/_api/')) {
    return handleAdmin(req, res, parsedUrl);
  }

  // Redirect root browser visits to Admin UI
  if (parsedUrl.pathname === '/' && req.headers['accept'] && req.headers['accept'].includes('text/html')) {
    res.writeHead(302, { Location: '/_admin/' });
    return res.end();
  }

  // Read incoming request body safely
  let reqBody;
  try {
    reqBody = await readRequestBody(req);
  } catch (err) {
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'Request payload exceeded 25 MB limit' }));
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'BAD_REQUEST', message: 'Failed to read request stream: ' + err.message }));
  }

  // Passthrough mode (ignores mocks)
  if (config.mockMode === 'passthrough') {
    return proxyToUpstream(req, res, reqBody, startTime, logId);
  }

  // Check for matching mock rule
  const matchedRule = rules.find(rule => matchRule(req.method, req.url, rule));

  if (matchedRule) {
    const isModifyRequest = matchedRule.actionType === 'modify_request';

    if (isModifyRequest) {
      let modifiedReqBody = reqBody;
      let modifiedUrl = req.url;
      const modifiedHeaders = { ...req.headers };

      // Override Body
      if (matchedRule.reqOverrideBody) {
        try {
          const bodyOverrideParsed = typeof matchedRule.reqOverrideBody === 'string'
            ? JSON.parse(matchedRule.reqOverrideBody)
            : matchedRule.reqOverrideBody;
          modifiedReqBody = Buffer.from(JSON.stringify(bodyOverrideParsed), 'utf8');
          modifiedHeaders['content-length'] = modifiedReqBody.length;
        } catch (e) {
          console.error("Failed to parse reqOverrideBody:", e);
        }
      }

      // Override Params
      if (matchedRule.reqOverrideParams) {
        try {
          const paramsOverride = typeof matchedRule.reqOverrideParams === 'string'
            ? JSON.parse(matchedRule.reqOverrideParams)
            : matchedRule.reqOverrideParams;
            
          const urlObj = url.parse(req.url, true);
          urlObj.query = { ...urlObj.query };
          
          for (const key in paramsOverride) {
            if (paramsOverride[key] === null) {
              delete urlObj.query[key];
            } else {
              urlObj.query[key] = paramsOverride[key];
            }
          }
          
          delete urlObj.search; // Force url.format to re-serialize query
          modifiedUrl = url.format(urlObj);
        } catch (e) {
          console.error("Failed to parse reqOverrideParams:", e);
        }
      }

      const delay = Math.max(0, parseInt(matchedRule.delay || 0, 10));
      req.url = modifiedUrl;
      req.headers = modifiedHeaders;

      if (delay > 0) {
        setTimeout(() => proxyToUpstream(req, res, modifiedReqBody, startTime, logId), delay);
      } else {
        return proxyToUpstream(req, res, modifiedReqBody, startTime, logId);
      }
      return;
    }

    // Standard Mock Response
    const delay = Math.max(0, parseInt(matchedRule.delay || 0, 10));
    const statusCode = parseInt(matchedRule.statusCode || 200, 10);
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...(matchedRule.headers || {})
    };
    const bodyContent = typeof matchedRule.body === 'string' ? matchedRule.body : JSON.stringify(matchedRule.body, null, 2);

    const respond = () => {
      res.writeHead(statusCode, headers);
      res.end(bodyContent);

      const duration = Date.now() - startTime;
      addTrafficLog({
        id: logId,
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        path: parsedUrl.pathname,
        status: statusCode,
        duration,
        isMock: true,
        ruleId: matchedRule.id,
        ruleName: matchedRule.name || matchedRule.path,
        request: {
          headers: req.headers,
          queryParams: url.parse(req.url, true).query,
          body: reqBody ? reqBody.toString('utf8') : ''
        },
        response: {
          headers,
          body: bodyContent
        }
      });
    };

    if (delay > 0) {
      setTimeout(respond, delay);
    } else {
      respond();
    }
    return;
  }

  // If Mock Only mode and no rule matched
  if (config.mockMode === 'mock_only') {
    const duration = Date.now() - startTime;
    const notFoundBody = {
      error: 'MOCK_NOT_FOUND',
      message: `No mock rule matched [${req.method}] ${req.url} and server is in 'Mock Only' mode.`
    };
    const bodyStr = JSON.stringify(notFoundBody, null, 2);
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(bodyStr);

    addTrafficLog({
      id: logId,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      path: parsedUrl.pathname,
      status: 404,
      duration,
      isMock: false,
      error: 'Mock not found (Mock Only mode)',
      request: {
        headers: req.headers,
        queryParams: url.parse(req.url, true).query,
        body: reqBody ? reqBody.toString('utf8') : ''
      },
      response: {
        headers: { 'content-type': 'application/json' },
        body: bodyStr
      }
    });
    return;
  }

  // Fallback: Proxy to Upstream
  return proxyToUpstream(req, res, reqBody, startTime, logId);
});

const PORT = process.env.PORT || config.port || 8080;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(`  🚀 ios-mock-proxy Server is running on ${HOST}:${PORT}!`);
  console.log(`  📊 Web Dashboard:  http://localhost:${PORT}/_admin/`);
  console.log(`  🌐 Proxy / Mock:    http://localhost:${PORT}/`);
  console.log(`  📡 Upstream Target: ${config.upstream || '(None configured)'}`);
  console.log('====================================================');
});
