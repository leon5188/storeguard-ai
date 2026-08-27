/**
 * Bridge 鉴权自检：node test_auth.js
 * 只验证访问控制，不触碰 GHL / TTLock（故意不配置凭证）。
 */
const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');

const SECRET = 'test-secret-do-not-ship';

function request(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (method === 'OPTIONS') headers.Origin = 'https://example.com';
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
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

const ACCESS_ROUTES = ['/api/access/issue', '/api/access/revoke', '/api/access/reinstate'];

(async () => {
  const configured = await startServer(3199, { BRIDGE_API_SECRET: SECRET });
  const unconfigured = await startServer(3198, { BRIDGE_API_SECRET: '' });

  try {
    for (const route of ACCESS_ROUTES) {
      assert.strictEqual((await request(3199, 'POST', route)).status, 401, `${route} 无 token 应 401`);
      assert.strictEqual((await request(3199, 'POST', route, 'wrong')).status, 401, `${route} 错误 token 应 401`);
      assert.strictEqual((await request(3199, 'POST', route, SECRET + 'x')).status, 401, `${route} 前缀匹配的长 token 应 401`);
      assert.notStrictEqual((await request(3199, 'POST', route, SECRET)).status, 401, `${route} 正确 token 不应 401`);
      // fail-closed：未配置密钥时一律拒绝，即便带了 token
      assert.strictEqual((await request(3198, 'POST', route, SECRET)).status, 503, `${route} 未配置密钥应 503`);
    }

    // 公开端点：浏览器调用，不需要 bearer。缺 email/phone 应是 400（校验生效），不是 401（被拦在门外）
    assert.strictEqual((await request(3199, 'POST', '/api/lead/upsert')).status, 400, 'lead/upsert 空载荷应 400');
    // 载荷合法时走到 GHL 配置检查，此处未配置故 503 —— 同样证明没有鉴权墙
    assert.strictEqual(
      (await request(3199, 'POST', '/api/lead/upsert', null, { email: 'a@b.co' })).status, 503,
      'lead/upsert 合法载荷应 503（GHL 未配置）而非 401'
    );

    // CORS 预检必须放行，否则浏览器 POST 发不出去
    const preflight = await request(3199, 'OPTIONS', '/api/lead/upsert');
    assert.strictEqual(preflight.status, 204, 'OPTIONS 预检应 204');
    assert.ok(preflight.headers['access-control-allow-origin'], '预检应返回 Allow-Origin');

    console.log('✓ bridge 鉴权自检全部通过');
  } finally {
    configured.kill();
    unconfigured.kill();
  }
})().catch((err) => {
  console.error('✗ 自检失败:', err.message);
  process.exit(1);
});
