const { spawn } = require('child_process');
const http = require('http');

function request(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (method === 'OPTIONS') headers.Origin = 'https://example.com';
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: raw, json });
      });
    });
    req.on('error', reject);
    if (method !== 'OPTIONS') req.write(JSON.stringify(body || {}));
    req.end();
  });
}

function startServer(port, env) {
  const child = spawn('node', [__dirname + '/dist/server.js'], {
    env: { ...process.env, PORT: String(port), GHL_API_KEY: '', GHL_LOCATION_ID: '', ...env },
    stdio: 'ignore'
  });
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 8000;
    (function poll() {
      request(port, 'GET', '/health').then(() => resolve(child)).catch(() => {
        if (Date.now() > deadline) return reject(new Error(`server on :${port} never came up`));
        setTimeout(poll, 120);
      });
    })();
  });
}

// 测试夹具。刻意写成一眼可辨的假值：命名成"看起来像真凭证"会触发密钥扫描误报，
// 也会让人逐渐忽略真正的告警。约束：不能含 'your_'，否则服务端会判定为未配置。
const FIXTURES = {
  BRIDGE_SECRET: 'not-a-real-secret-test-fixture',
  TTLOCK_CLIENT_ID: 'not-a-real-client-id-test-fixture',
  TTLOCK_ACCESS_TOKEN: 'not-a-real-token-test-fixture'
};

module.exports = { request, startServer, FIXTURES };
