/**
 * 门禁下发自检：node test_provisioning.js
 *
 * 核心不变量：密码没有真正写进锁体时，绝不能返回 success。
 * 历史 bug：reinstate 根本不调 TTLock，租客补缴后拿到锁不认识的号码。
 */
const assert = require('assert');
const http = require('http');
const { request, startServer, FIXTURES } = require('./test_helpers');

const SECRET = FIXTURES.BRIDGE_SECRET;
const DEAD_TTLOCK = 'http://127.0.0.1:1'; // 必然 ECONNREFUSED

// 厂商响应体里放一个哨兵串。它绝不能出现在回给调用方的 HTTP 响应中。
const VENDOR_PAYLOAD_MARKER = 'VENDOR-PAYLOAD-MUST-NOT-LEAK';

/**
 * 假 TTLock：HTTP 200 但 body 里带 errcode —— 这正是 axios 不会抛、
 * 必须靠 assertTTLockOk 拦住的那条路径。
 */
function startFakeTTLock(port, responseBody) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responseBody));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const ACCESS_ROUTES = ['/api/access/issue', '/api/access/revoke', '/api/access/reinstate'];

(async () => {
  // A: TTLock 凭证已配置，但服务端不可达 —— 模拟真实的硬件故障
  const broken = await startServer(3197, {
    BRIDGE_API_SECRET: SECRET,
    TTLOCK_API_BASE: DEAD_TTLOCK,
    TTLOCK_CLIENT_ID: FIXTURES.TTLOCK_CLIENT_ID,
    TTLOCK_ACCESS_TOKEN: FIXTURES.TTLOCK_ACCESS_TOKEN
  });
  // B: 未配置 TTLock —— 演示模式
  const demo = await startServer(3196, { BRIDGE_API_SECRET: SECRET });

  const payload = {
    contact_id: 'contact_123',
    phone: '+16262036250',
    unit_number: 'A-108',
    hardware_lock_id: 'LOCK_A108',
    hardware_pwd_id: '99887766'
  };

  try {
    for (const route of ACCESS_ROUTES) {
      // 硬件不可达时必须失败，且明确标注未同步
      const res = await request(3197, 'POST', route, SECRET, payload);
      assert.strictEqual(res.status, 502, `${route} 硬件故障时应 502，实际 ${res.status}`);
      assert.strictEqual(res.json && res.json.success, false, `${route} 硬件故障时 success 必须为 false`);
      assert.strictEqual(res.json && res.json.hardware_synced, false, `${route} 应标注 hardware_synced=false`);

      // 凭证已配置却漏传 lockId：静默降级是最危险的情况，必须失败
      const noLock = await request(3197, 'POST', route, SECRET, { ...payload, hardware_lock_id: undefined });
      assert.strictEqual(noLock.status, 502, `${route} 缺 hardware_lock_id 时应 502，实际 ${noLock.status}`);
    }

    // reinstate 的回归点：它必须和 issue 一样真正尝试写锁。
    // 若哪天有人把 TTLock 调用从 reinstate 拿掉，这条会变成 200 并在此报错。
    const reinstate = await request(3197, 'POST', '/api/access/reinstate', SECRET, payload);
    assert.strictEqual(reinstate.status, 502, 'reinstate 必须真正尝试写入锁体，而不是只发新码');

    // 演示模式：允许成功，但必须自报 simulated，不得伪装成真实下发
    for (const route of ['/api/access/issue', '/api/access/reinstate']) {
      const sim = await request(3196, 'POST', route, SECRET, payload);
      assert.strictEqual(sim.status, 200, `${route} 演示模式应 200，实际 ${sim.status}`);
      assert.strictEqual(sim.json.hardware_mode, 'simulated', `${route} 演示模式必须标注 hardware_mode=simulated`);
      assert.match(sim.json.unit_lock_pin, /^\d{6}$/, `${route} 应返回 6 位密码`);
    }
    const simRevoke = await request(3196, 'POST', '/api/access/revoke', SECRET, payload);
    assert.strictEqual(simRevoke.json.hardware_mode, 'simulated', 'revoke 演示模式必须标注 simulated');

    // issue 与 reinstate 必须各自生成不同密码（不是固定值）
    const a = await request(3196, 'POST', '/api/access/issue', SECRET, payload);
    const b = await request(3196, 'POST', '/api/access/issue', SECRET, payload);
    assert.notStrictEqual(a.json.unit_lock_pin, b.json.unit_lock_pin, '两次下发不应得到相同密码');

    // --- HTTP 200 + errcode：axios 不抛，只有 assertTTLockOk 能拦住 ---
    const errcodeServer = await startFakeTTLock(3195, {
      errcode: 10003,
      errmsg: 'invalid token',
      echoed: VENDOR_PAYLOAD_MARKER
    });
    const errcodeBridge = await startServer(3194, {
      BRIDGE_API_SECRET: SECRET,
      TTLOCK_API_BASE: 'http://127.0.0.1:3195',
      TTLOCK_CLIENT_ID: FIXTURES.TTLOCK_CLIENT_ID,
      TTLOCK_ACCESS_TOKEN: FIXTURES.TTLOCK_ACCESS_TOKEN
    });

    // --- HTTP 200 + errcode 0，但没有 keyboardPwdId：同样不能算成功 ---
    const noPwdIdServer = await startFakeTTLock(3193, {
      errcode: 0,
      leaked: VENDOR_PAYLOAD_MARKER
    });
    const noPwdIdBridge = await startServer(3192, {
      BRIDGE_API_SECRET: SECRET,
      TTLOCK_API_BASE: 'http://127.0.0.1:3193',
      TTLOCK_CLIENT_ID: FIXTURES.TTLOCK_CLIENT_ID,
      TTLOCK_ACCESS_TOKEN: FIXTURES.TTLOCK_ACCESS_TOKEN
    });

    try {
      for (const route of ACCESS_ROUTES) {
        const r = await request(3194, 'POST', route, SECRET, payload);
        assert.strictEqual(r.status, 502, `${route} 遇到 errcode!=0 时应 502，实际 ${r.status}`);
        assert.strictEqual(r.json.success, false, `${route} errcode!=0 时 success 必须为 false`);
        assert.ok(/errcode=10003/.test(r.json.error), `${route} 应向调用方暴露 errcode 供工作流分支判断`);
        assert.ok(!r.body.includes(VENDOR_PAYLOAD_MARKER),
          `${route} 响应体不得包含厂商原始载荷，实际: ${r.body}`);
      }

      // keyboardPwd/add 返回 errcode 0 却没有 keyboardPwdId —— 密码未确认写入，不能报成功
      for (const route of ['/api/access/issue', '/api/access/reinstate']) {
        const r = await request(3192, 'POST', route, SECRET, payload);
        assert.strictEqual(r.status, 502, `${route} 缺 keyboardPwdId 时应 502，实际 ${r.status}`);
        assert.ok(!r.body.includes(VENDOR_PAYLOAD_MARKER),
          `${route} 响应体不得包含厂商原始载荷，实际: ${r.body}`);
      }

      // 删除只看 errcode，errcode 0 即视为已从锁体移除
      const del = await request(3192, 'POST', '/api/access/revoke', SECRET, payload);
      assert.strictEqual(del.status, 200, 'revoke 在 errcode=0 时应成功');
      assert.strictEqual(del.json.hardware_mode, 'ttlock', 'revoke 应标注真实硬件路径');
    } finally {
      errcodeBridge.kill();
      noPwdIdBridge.kill();
      errcodeServer.close();
      noPwdIdServer.close();
    }

    console.log('✓ 门禁下发自检全部通过');
  } finally {
    broken.kill();
    demo.kill();
  }
})().catch((err) => {
  console.error('✗ 自检失败:', err.message);
  process.exit(1);
});
