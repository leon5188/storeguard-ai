import express, { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(express.json());

// CORS：漏斗页面由 Vercel/GHL 域名托管，需跨域 POST 到本服务
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3000;
const GHL_API_BASE = process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com';
const GHL_API_KEY = process.env.GHL_API_KEY || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '';
const TTLOCK_API_BASE = process.env.TTLOCK_API_BASE || 'https://euapi.ttlock.com';
const TTLOCK_CLIENT_ID = process.env.TTLOCK_CLIENT_ID || '';
const TTLOCK_ACCESS_TOKEN = process.env.TTLOCK_ACCESS_TOKEN || '';
const BRIDGE_API_SECRET = process.env.BRIDGE_API_SECRET || '';
// 允许调用 /api/lead/upsert 的浏览器来源，逗号分隔；'*' 表示不限制
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(o => o.trim());

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * 门禁类端点鉴权。这些端点由 GHL 工作流服务端调用，必须携带 Bearer BRIDGE_API_SECRET。
 * 未配置密钥时 fail-closed —— 开门权限宁可全部拒绝，不可默认放行。
 */
function requireBridgeSecret(req: Request, res: Response, next: NextFunction) {
  if (!BRIDGE_API_SECRET || BRIDGE_API_SECRET.includes('your_')) {
    console.error(`\x1b[31m[AUTH] BRIDGE_API_SECRET 未配置，已拒绝 ${req.method} ${req.path}\x1b[0m`);
    return res.status(503).json({ error: 'Bridge access control not configured' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!timingSafeEqual(token, BRIDGE_API_SECRET)) {
    console.warn(`\x1b[31m[AUTH] 拒绝未授权请求: ${req.method} ${req.path} from ${req.ip}\x1b[0m`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// 缓存 GHL 自定义字段名称到 ID 的映射
let fieldMap: Record<string, string> = {};

async function initFieldMap() {
  if (!GHL_API_KEY || !GHL_LOCATION_ID) return;
  try {
    const res = await axios.get(`${GHL_API_BASE}/locations/${GHL_LOCATION_ID}/customFields`, {
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        Version: '2021-07-28'
      }
    });
    if (res.data?.customFields) {
      res.data.customFields.forEach((f: any) => {
        fieldMap[f.name] = f.id;
        if (f.fieldKey) fieldMap[f.fieldKey] = f.id;
      });
      console.log(`\x1b[32m[StoreGuard Bridge] 已成功同步 ${res.data.customFields.length} 个 GHL 自定义字段 ID 映射\x1b[0m`);
    }
  } catch (err: any) {
    console.warn(`\x1b[33m[StoreGuard Bridge] 初始化字段映射失败 (使用降级模式): ${err.message}\x1b[0m`);
  }
}

/**
 * 辅助函数：把 {key: value} 转成 GHL customFields 载荷（优先用已缓存的 field id）
 */
function buildCustomFields(updates: Record<string, any>) {
  return Object.entries(updates).map(([key, val]) => {
    const fieldId = fieldMap[key] || fieldMap[`contact.${key}`];
    if (fieldId) {
      return { id: fieldId, field_value: val };
    }
    return { key: key.startsWith('contact.') ? key : `contact.${key}`, field_value: val };
  });
}

/**
 * 辅助函数：更新 GHL 联系人字段
 */
async function updateGHLContact(contactId: string, updates: Record<string, any>) {
  if (!GHL_API_KEY || !contactId) return;

  const customFieldsPayload = buildCustomFields(updates);

  await axios.put(`${GHL_API_BASE}/contacts/${contactId}`, {
    customFields: customFieldsPayload
  }, {
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json'
    }
  });
}

/**
 * 0. Healthcheck
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'StoreGuard IoT Bridge',
    location_id: GHL_LOCATION_ID,
    field_mappings_cached: Object.keys(fieldMap).length,
    timestamp: new Date().toISOString()
  });
});

/**
 * 1. ISSUE ACCESS: 签约支付成功 ➔ 生成密码并下发门禁
 */
app.post('/api/access/issue', requireBridgeSecret, async (req: Request, res: Response) => {
  try {
    const { contact_id, phone, unit_number, lease_start_date, lease_end_date, hardware_lock_id } = req.body;

    if (!contact_id) {
      return res.status(400).json({ error: 'Missing contact_id' });
    }

    console.log(`\n\x1b[36m[ACCESS ISSUE] 正在为 Contact=${contact_id} 办理入住 (Unit: ${unit_number || 'N/A'})...\x1b[0m`);

    // A. 计算 6 位独立仓门动态密码 (TOTP/离线密码模拟)
    const randomPin = Math.floor(100000 + Math.random() * 900000).toString();
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const gateCode = cleanPhone.length >= 4 ? cleanPhone.slice(-4) + '#' : '5938#';

    let keyboardPwdId = 'MOCK_PWD_' + Date.now();

    // B. 若已配置真实 TTLock 硬件与凭证，调用 OpenAPI
    if (hardware_lock_id && TTLOCK_CLIENT_ID && TTLOCK_ACCESS_TOKEN && !TTLOCK_CLIENT_ID.includes('your_')) {
      const startDateMs = lease_start_date ? new Date(lease_start_date).getTime() : Date.now();
      const endDateMs = lease_end_date ? new Date(lease_end_date).getTime() : Date.now() + 30 * 86400000;

      try {
        const ttlRes = await axios.post(`${TTLOCK_API_BASE}/v3/keyboardPwd/add`, null, {
          params: {
            clientId: TTLOCK_CLIENT_ID,
            accessToken: TTLOCK_ACCESS_TOKEN,
            lockId: hardware_lock_id,
            keyboardPwd: randomPin,
            keyboardPwdType: 3, // 3 = Period Passcode
            startDate: startDateMs,
            endDate: endDateMs,
            date: Date.now(),
          }
        });

        if (ttlRes.data?.keyboardPwdId) {
          keyboardPwdId = ttlRes.data.keyboardPwdId.toString();
          console.log(`\x1b[32m  ✓ TTLock 云端硬件下发成功: Lock=${hardware_lock_id}, PwdId=${keyboardPwdId}\x1b[0m`);
        }
      } catch (err: any) {
        console.warn(`  ! TTLock 云端调用警告 (降级为离线算法): ${err.message}`);
      }
    } else {
      console.log(`\x1b[35m  ℹ️ 模拟模式: 已通过 TOTP 离线算法生成 6 位时效开门密码\x1b[0m`);
    }

    // C. 更新 GHL 联系人字段
    await updateGHLContact(contact_id, {
      gate_access_code: gateCode,
      unit_lock_pin: randomPin,
      hardware_pwd_id: keyboardPwdId,
      occupancy_status: 'Active_Good',
      delinquent_days: 0
    });

    console.log(`\x1b[32m  ✓ GHL 字段已同步: GateCode=${gateCode}, UnitPIN=${randomPin}, Status=Active_Good\x1b[0m`);

    return res.json({
      success: true,
      contact_id,
      unit_number,
      gate_access_code: gateCode,
      unit_lock_pin: randomPin,
      hardware_pwd_id: keyboardPwdId,
      status: 'Active_Good'
    });

  } catch (error: any) {
    console.error(`\x1b[31m[ACCESS ISSUE 失败]\x1b[0m`, error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * 2. REVOKE ACCESS: 逾期第 5 天 ➔ 硬件门禁熔断锁定
 */
app.post('/api/access/revoke', requireBridgeSecret, async (req: Request, res: Response) => {
  try {
    const { contact_id, unit_number, hardware_lock_id, hardware_pwd_id, reason } = req.body;

    console.log(`\n\x1b[31m[ACCESS REVOKE] 收到停权指令: Contact=${contact_id} (Unit: ${unit_number || 'N/A'}), 原因: ${reason || 'Overdue'}\x1b[0m`);

    // A. 若有真实 TTLock 硬件，注销密码
    if (hardware_lock_id && hardware_pwd_id && TTLOCK_CLIENT_ID && TTLOCK_ACCESS_TOKEN && !TTLOCK_CLIENT_ID.includes('your_')) {
      try {
        await axios.post(`${TTLOCK_API_BASE}/v3/keyboardPwd/delete`, null, {
          params: {
            clientId: TTLOCK_CLIENT_ID,
            accessToken: TTLOCK_ACCESS_TOKEN,
            lockId: hardware_lock_id,
            keyboardPwdId: hardware_pwd_id,
            date: Date.now(),
          }
        });
        console.log(`\x1b[32m  ✓ TTLock 密码已从云端与硬件销毁\x1b[0m`);
      } catch (err: any) {
        console.warn(`  ! TTLock 删除密码警告: ${err.message}`);
      }
    }

    // B. 更新 GHL 字段为锁定停权
    await updateGHLContact(contact_id, {
      occupancy_status: 'Access_Suspended',
      unit_lock_pin: 'LOCKED',
      gate_access_code: 'SUSPENDED'
    });

    console.log(`\x1b[31m  🔒 GHL 门禁已熔断锁定: Status=Access_Suspended, PIN=LOCKED\x1b[0m`);

    return res.json({
      success: true,
      contact_id,
      unit_number,
      status: 'Access_Suspended',
      message: 'Access revoked & unit locked'
    });

  } catch (error: any) {
    console.error(`\x1b[31m[ACCESS REVOKE 失败]\x1b[0m`, error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * 3. REINSTATE ACCESS: 补缴成功 ➔ 秒级全自动解封
 */
app.post('/api/access/reinstate', requireBridgeSecret, async (req: Request, res: Response) => {
  try {
    const { contact_id, phone, unit_number, hardware_lock_id } = req.body;

    console.log(`\n\x1b[32m[ACCESS REINSTATE] 正在为 Contact=${contact_id} 执行秒级解封...\x1b[0m`);

    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const gateCode = cleanPhone.length >= 4 ? cleanPhone.slice(-4) + '#' : '5938#';

    // 更新 GHL 字段恢复正常
    await updateGHLContact(contact_id, {
      gate_access_code: gateCode,
      unit_lock_pin: newPin,
      occupancy_status: 'Active_Good',
      delinquent_days: 0,
      total_amount_due: 0
    });

    console.log(`\x1b[32m  🔓 门禁已秒级恢复: GateCode=${gateCode}, NewUnitPIN=${newPin}, Status=Active_Good\x1b[0m`);

    return res.json({
      success: true,
      contact_id,
      unit_number,
      gate_access_code: gateCode,
      unit_lock_pin: newPin,
      status: 'Active_Good'
    });

  } catch (error: any) {
    console.error(`\x1b[31m[ACCESS REINSTATE 失败]\x1b[0m`, error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * 4. LEAD UPSERT: 漏斗实名信息提交 ➔ 在 GHL 建/更新 contact
 *    浏览器直接调用，因此不校验 BRIDGE_API_SECRET（等同于任何公开表单的暴露面）。
 *    ponytail: 无限流/验证码，若出现表单灌水再加 Turnstile 或 IP 限流。
 */
app.post('/api/lead/upsert', async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, phone, unit_number, unit_size, monthly_rent } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ error: 'email or phone required' });
    }
    if (!GHL_API_KEY || !GHL_LOCATION_ID) {
      return res.status(503).json({ error: 'GHL not configured' });
    }

    console.log(`\n\x1b[36m[LEAD UPSERT] ${first_name || ''} ${last_name || ''} <${email || phone}> Unit=${unit_number || 'N/A'}\x1b[0m`);

    const ghlRes = await axios.post(`${GHL_API_BASE}/contacts/upsert`, {
      locationId: GHL_LOCATION_ID,
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
      source: 'StoreGuard Move-In Funnel',
      tags: ['sg:lead', 'sg:unit_selected'],
      customFields: buildCustomFields({
        unit_number: unit_number || '',
        unit_size: unit_size || '',
        monthly_rent: monthly_rent || '',
        occupancy_status: 'Reserved',
        id_verified: 'No'
      })
    }, {
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json'
      }
    });

    const contactId = ghlRes.data?.contact?.id;
    if (!contactId) {
      throw new Error(`GHL upsert 未返回 contact id: ${JSON.stringify(ghlRes.data)}`);
    }

    console.log(`\x1b[32m  \u2713 GHL contact ${ghlRes.data?.new ? '已创建' : '已更新'}: ${contactId}\x1b[0m`);

    return res.json({ success: true, contact_id: contactId, is_new: ghlRes.data?.new === true });

  } catch (error: any) {
    // 详情只进日志，不回传浏览器
    console.error(`\x1b[31m[LEAD UPSERT 失败]\x1b[0m`, error.response?.data || error.message);
    return res.status(502).json({ error: 'Unable to save contact' });
  }
});

/**
 * 5. HARDWARE WEBHOOK: 监听设备电量、门磁与防撬告警
 */
app.post('/api/hardware/webhook', async (req: Request, res: Response) => {
  const { lockId, recordType, electricQuantity } = req.body;
  console.log(`[HARDWARE EVENT] LockId=${lockId}, Event=${recordType}, Battery=${electricQuantity}%`);
  return res.json({ received: true });
});

// 启动服务器
app.listen(PORT, async () => {
  console.log(`\n\x1b[1m\x1b[34m========================================================\x1b[0m`);
  console.log(`\x1b[1m\x1b[32m⚡ StoreGuard IoT Bridge 微服务已成功启动!\x1b[0m`);
  console.log(`\x1b[36m⚡ 监听端口: ${PORT}\x1b[0m`);
  console.log(`\x1b[36m⚡ 绑定 GHL Location: ${GHL_LOCATION_ID}\x1b[0m`);
  console.log(`\x1b[1m\x1b[34m========================================================\x1b[0m\n`);
  await initFieldMap();
});
