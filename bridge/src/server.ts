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
 * TTLock 凭证是否已真实配置。未配置 = 演示模式；已配置 = 必须真正写进锁体。
 */
function ttlockConfigured(): boolean {
  return Boolean(TTLOCK_CLIENT_ID && TTLOCK_ACCESS_TOKEN)
    && !TTLOCK_CLIENT_ID.includes('your_')
    && !TTLOCK_ACCESS_TOKEN.includes('your_');
}

class HardwareError extends Error {
  /** 仅用于服务端日志。绝不回传给调用方 —— 厂商响应体可能夹带凭证或租客数据。 */
  readonly detail?: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.detail = detail;
  }
}

/**
 * TTLock OpenAPI 在业务失败时仍返回 HTTP 200，错误藏在 body 的 errcode 里，
 * axios 不会抛。必须显式检查，否则失败会被当成成功。
 */
function assertTTLockOk(data: any, action: string) {
  if (data && data.errcode !== undefined && data.errcode !== 0) {
    throw new HardwareError(`TTLock ${action} 失败 (errcode=${data.errcode})`, data);
  }
}

interface Passcode {
  pin: string;
  keyboardPwdId: string;
  mode: 'ttlock' | 'simulated';
}

/**
 * 在仓门锁上创建一个限时密码。issue 与 reinstate 共用同一条路径 ——
 * 补缴解封必须和首次入住一样真正写进锁体，否则租客拿到的是一个锁不认识的号码。
 *
 * 失败一律抛出。绝不降级返回一个未写入硬件的随机码：那会让 GHL 把死码短信给租客。
 */
async function provisionPasscode(
  lockId: string | undefined,
  startMs: number,
  endMs: number
): Promise<Passcode> {
  const pin = crypto.randomInt(100000, 1000000).toString();

  if (!ttlockConfigured()) {
    console.log(`\x1b[35m  \u2139 演示模式: TTLock 凭证未配置，生成的 ${pin} 未写入任何硬件\x1b[0m`);
    return { pin, keyboardPwdId: `SIMULATED_${Date.now()}`, mode: 'simulated' };
  }

  // 凭证已配置却拿不到 lockId，说明 GHL 侧漏传了 hardware_lock_id ——
  // 这时静默走演示模式正是最危险的情况，直接失败。
  if (!lockId) {
    throw new HardwareError('TTLock 已配置但请求缺少 hardware_lock_id，拒绝下发未绑定硬件的密码');
  }

  const ttlRes = await axios.post(`${TTLOCK_API_BASE}/v3/keyboardPwd/add`, null, {
    params: {
      clientId: TTLOCK_CLIENT_ID,
      accessToken: TTLOCK_ACCESS_TOKEN,
      lockId,
      keyboardPwd: pin,
      keyboardPwdType: 3, // 3 = Period Passcode
      startDate: startMs,
      endDate: endMs,
      date: Date.now()
    },
    timeout: 15000
  });

  assertTTLockOk(ttlRes.data, 'keyboardPwd/add');

  const keyboardPwdId = ttlRes.data?.keyboardPwdId;
  if (!keyboardPwdId) {
    throw new HardwareError('TTLock keyboardPwd/add 未返回 keyboardPwdId', ttlRes.data);
  }

  console.log(`\x1b[32m  \u2713 TTLock 下发成功: Lock=${lockId}, PwdId=${keyboardPwdId}\x1b[0m`);
  return { pin, keyboardPwdId: keyboardPwdId.toString(), mode: 'ttlock' };
}

/**
 * 从锁体删除一个已下发的密码。失败抛出 —— 删除失败意味着租客仍能进门，
 * 此时不能把 GHL 标成"已停权"。
 */
async function revokePasscode(lockId: string | undefined, keyboardPwdId: string | undefined) {
  if (!ttlockConfigured()) {
    console.log(`\x1b[35m  \u2139 演示模式: 未配置 TTLock，跳过硬件密码删除\x1b[0m`);
    return 'simulated' as const;
  }
  if (!lockId || !keyboardPwdId) {
    throw new HardwareError('TTLock 已配置但请求缺少 hardware_lock_id / hardware_pwd_id，无法确认密码已从锁体删除');
  }

  const ttlRes = await axios.post(`${TTLOCK_API_BASE}/v3/keyboardPwd/delete`, null, {
    params: {
      clientId: TTLOCK_CLIENT_ID,
      accessToken: TTLOCK_ACCESS_TOKEN,
      lockId,
      keyboardPwdId,
      date: Date.now()
    },
    timeout: 15000
  });

  assertTTLockOk(ttlRes.data, 'keyboardPwd/delete');
  console.log(`\x1b[32m  \u2713 TTLock 密码已从锁体删除: Lock=${lockId}, PwdId=${keyboardPwdId}\x1b[0m`);
  return 'ttlock' as const;
}

/**
 * ponytail: 大门码仍沿用手机后 4 位，200 户规模下必然碰撞，且可猜。
 * 正确做法是随机分配 + 全场地查重，需要一份大门码台账，属于独立改动。
 */
function buildGateCode(phone?: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  return digits.length >= 4 ? digits.slice(-4) + '#' : '5938#';
}

/**
 * 硬件类失败一律 502，且不改 GHL 状态 —— 让 GHL 工作流能在非 2xx 分支上重试或告警。
 */
function failHardware(res: Response, tag: string, error: any) {
  // 厂商响应体与 axios 错误详情只进日志；回传给调用方的只有一句稳定的短消息。
  const detail = (error instanceof HardwareError ? error.detail : undefined)
    || error?.response?.data
    || error?.message
    || String(error);
  console.error(`\x1b[31m[${tag} 失败]\x1b[0m`, detail);
  const status = error instanceof HardwareError || error?.isAxiosError ? 502 : 500;
  return res.status(status).json({
    success: false,
    error: error instanceof HardwareError ? error.message : 'Hardware operation failed',
    hardware_synced: false
  });
}

function leaseWindow(start?: string, end?: string): [number, number] {
  const startMs = start ? new Date(start).getTime() : Date.now();
  const endMs = end ? new Date(end).getTime() : Date.now() + 30 * 86400000;
  return [startMs, endMs];
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

    const [startMs, endMs] = leaseWindow(lease_start_date, lease_end_date);
    const passcode = await provisionPasscode(hardware_lock_id, startMs, endMs);
    const gateCode = buildGateCode(phone);

    // 硬件写入成功后才更新 GHL —— GHL 状态必须反映锁体的真实状态
    await updateGHLContact(contact_id, {
      gate_access_code: gateCode,
      unit_lock_pin: passcode.pin,
      hardware_pwd_id: passcode.keyboardPwdId,
      occupancy_status: 'Active_Good',
      delinquent_days: 0
    });

    console.log(`\x1b[32m  \u2713 GHL 字段已同步: GateCode=${gateCode}, Status=Active_Good\x1b[0m`);

    return res.json({
      success: true,
      contact_id,
      unit_number,
      gate_access_code: gateCode,
      unit_lock_pin: passcode.pin,
      hardware_pwd_id: passcode.keyboardPwdId,
      hardware_mode: passcode.mode,
      status: 'Active_Good'
    });

  } catch (error: any) {
    return failHardware(res, 'ACCESS ISSUE', error);
  }
});

/**
 * 2. REVOKE ACCESS: 逾期第 5 天 ➔ 硬件门禁熔断锁定
 */
app.post('/api/access/revoke', requireBridgeSecret, async (req: Request, res: Response) => {
  try {
    const { contact_id, unit_number, hardware_lock_id, hardware_pwd_id, reason } = req.body;

    if (!contact_id) {
      return res.status(400).json({ error: 'Missing contact_id' });
    }

    console.log(`\n\x1b[31m[ACCESS REVOKE] 收到停权指令: Contact=${contact_id} (Unit: ${unit_number || 'N/A'}), 原因: ${reason || 'Overdue'}\x1b[0m`);

    // 先确认密码真的从锁体删掉了，再改 GHL。
    // 反过来会造成 GHL 显示"已停权"而租客照样刷得开门。
    const mode = await revokePasscode(hardware_lock_id, hardware_pwd_id);

    await updateGHLContact(contact_id, {
      occupancy_status: 'Access_Suspended',
      unit_lock_pin: 'LOCKED',
      gate_access_code: 'SUSPENDED'
    });

    console.log(`\x1b[31m  \u{1F512} GHL 门禁已锁定: Status=Access_Suspended\x1b[0m`);

    return res.json({
      success: true,
      contact_id,
      unit_number,
      hardware_mode: mode,
      status: 'Access_Suspended',
      message: 'Access revoked & unit locked'
    });

  } catch (error: any) {
    return failHardware(res, 'ACCESS REVOKE', error);
  }
});

/**
 * 3. REINSTATE ACCESS: 补缴成功 ➔ 秒级全自动解封
 */
app.post('/api/access/reinstate', requireBridgeSecret, async (req: Request, res: Response) => {
  try {
    const { contact_id, phone, unit_number, hardware_lock_id, lease_start_date, lease_end_date } = req.body;

    if (!contact_id) {
      return res.status(400).json({ error: 'Missing contact_id' });
    }

    console.log(`\n\x1b[32m[ACCESS REINSTATE] 正在为 Contact=${contact_id} 解封 (Unit: ${unit_number || 'N/A'})...\x1b[0m`);

    // revoke 已把旧密码从锁体删掉，这里必须真正写入一个新的。
    // 只发短信不写锁 = 交了钱的租客站在门口打不开。
    const [startMs, endMs] = leaseWindow(lease_start_date, lease_end_date);
    const passcode = await provisionPasscode(hardware_lock_id, startMs, endMs);
    const gateCode = buildGateCode(phone);

    // 必须回写新的 hardware_pwd_id，否则下次 revoke 拿着已失效的旧 id 删不掉
    await updateGHLContact(contact_id, {
      gate_access_code: gateCode,
      unit_lock_pin: passcode.pin,
      hardware_pwd_id: passcode.keyboardPwdId,
      occupancy_status: 'Active_Good',
      delinquent_days: 0,
      total_amount_due: 0
    });

    console.log(`\x1b[32m  \u{1F513} 门禁已恢复: GateCode=${gateCode}, Status=Active_Good\x1b[0m`);

    return res.json({
      success: true,
      contact_id,
      unit_number,
      gate_access_code: gateCode,
      unit_lock_pin: passcode.pin,
      hardware_pwd_id: passcode.keyboardPwdId,
      hardware_mode: passcode.mode,
      status: 'Active_Good'
    });

  } catch (error: any) {
    return failHardware(res, 'ACCESS REINSTATE', error);
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
