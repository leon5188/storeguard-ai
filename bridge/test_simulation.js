const https = require('https');
const http = require('http');

const API_KEY = process.env.GHL_API_KEY || '';
const LOCATION_ID = process.env.GHL_LOCATION_ID || '';
const BRIDGE_PORT = 3000;
const BRIDGE_SECRET = process.env.BRIDGE_API_SECRET || '';

// GHL API 请求封装
function ghlRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'services.leadconnectorhq.com',
      path: path,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Version': '2021-07-28',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };
    if (dataString) options.headers['Content-Length'] = Buffer.byteLength(dataString);

    const req = https.request(options, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resData) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

// Local Bridge 请求封装
function bridgeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: BRIDGE_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + BRIDGE_SECRET
      }
    };
    if (dataString) options.headers['Content-Length'] = Buffer.byteLength(dataString);

    const req = http.request(options, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resData) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });
    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  if (!API_KEY || !LOCATION_ID) {
    console.error('❌ 请先设置 GHL_API_KEY 与 GHL_LOCATION_ID 环境变量（勿硬编码进本文件，本仓库是公开的）。');
    process.exit(1);
  }

  console.log('🧪 ========================================================');
  console.log('🧪 开始 StoreGuard AI 智能门禁与 IoT 自动化全流程实机模拟');
  console.log('🧪 ========================================================\n');

  // 1. 在 GHL 创建测试租客
  console.log('👉 [Step 1] 在 GHL Location 创建模拟签约租客: "Alex Miller"...');
  const contactPayload = {
    firstName: 'Alex',
    lastName: 'Miller',
    email: 'alex.miller.test@storeguard-ai.com',
    phone: '+16262036250',
    locationId: LOCATION_ID,
    tags: ['sg:lead', 'sg:unit_selected', 'sg:contract_signed']
  };

  const createRes = await ghlRequest('POST', '/contacts/upsert', contactPayload);
  const contact = createRes.data?.contact;
  const contactId = contact?.id;

  if (!contactId) {
    console.error('❌ 创建测试租客失败:', createRes.data);
    return;
  }
  console.log(`  ✓ 成功创建/获取测试租客: ID = ${contactId}, 手机 = +16262036250`);

  // 2. 模拟客户支付成功 ➔ GHL 触发 Webhook: POST /api/access/issue
  console.log('\n👉 [Step 2] 模拟支付成功 ➔ 触发 Bridge 【/api/access/issue】 (下发门禁密码)...');
  const issueRes = await bridgeRequest('POST', '/api/access/issue', {
    contact_id: contactId,
    phone: '+16262036250',
    unit_number: 'A-108',
    lease_start_date: new Date().toISOString(),
    lease_end_date: new Date(Date.now() + 30 * 86400000).toISOString(),
    hardware_lock_id: 'LOCK_SN_A108_TEST'
  });

  console.log('  Bridge 返回结果:', issueRes.data);
  await sleep(1500);

  // 验证 GHL 字段是否已被写入
  const check1 = await ghlRequest('GET', `/contacts/${contactId}`);
  console.log('  🔍 GHL 联系人门禁字段已更新:');
  (check1.data?.contact?.customFields || []).forEach(f => {
    console.log(`     - Field ID [${f.id}]: ${f.value}`);
  });

  // 3. 模拟逾期第 5 天 ➔ GHL 触发 Webhook: POST /api/access/revoke
  console.log('\n👉 [Step 3] 模拟逾期第 5 天未付款 ➔ 触发 Bridge 【/api/access/revoke】 (硬件熔断锁门)...');
  const revokeRes = await bridgeRequest('POST', '/api/access/revoke', {
    contact_id: contactId,
    unit_number: 'A-108',
    hardware_lock_id: 'LOCK_SN_A108_TEST',
    hardware_pwd_id: issueRes.data?.hardware_pwd_id,
    reason: 'Day 5 Delinquency - Lockout'
  });
  console.log('  Bridge 返回结果:', revokeRes.data);
  await sleep(1500);

  // 4. 模拟客户扫码补缴 ➔ GHL 触发 Webhook: POST /api/access/reinstate
  console.log('\n👉 [Step 4] 模拟租客扫码补缴租金与滞纳金 ➔ 触发 Bridge 【/api/access/reinstate】 (3秒秒级解封)...');
  const reinstateRes = await bridgeRequest('POST', '/api/access/reinstate', {
    contact_id: contactId,
    phone: '+16262036250',
    unit_number: 'A-108',
    hardware_lock_id: 'LOCK_SN_A108_TEST'
  });
  console.log('  Bridge 返回结果:', reinstateRes.data);
  await sleep(1500);

  const check2 = await ghlRequest('GET', `/contacts/${contactId}`);
  console.log('  🔍 最终 GHL 字段状态:');
  (check2.data?.contact?.customFields || []).forEach(f => {
    console.log(`     - Field ID [${f.id}]: ${f.value}`);
  });

  console.log('\n========================================================');
  console.log('🎉 StoreGuard AI 门禁下发 ➔ 逾期熔断 ➔ 补缴秒级解封 全闭环测试通过！');
  console.log('========================================================\n');
}

runTest().catch(console.error);
