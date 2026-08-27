const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

/**
 * 🛠️ TTLock 自动换取 Access Token & 查询名下锁具 Lock ID 脚本
 * 
 * 使用方式：
 * 1. 填入你在 open.ttlock.com 获取的 CLIENT_ID 和 CLIENT_SECRET
 * 2. 填入你在 TTLock 手机 App 注册的管理员 USERNAME 和 PASSWORD
 * 3. 运行: node get_ttlock_token.js
 */

const CONFIG = {
  // 海外服务器用 https://euapi.ttlock.com，国内用 https://api.sciener.cn
  API_HOST: process.env.TTLOCK_API_HOST || 'euapi.ttlock.com', 
  
  CLIENT_ID: process.env.TTLOCK_CLIENT_ID || '',
  CLIENT_SECRET: process.env.TTLOCK_CLIENT_SECRET || '',
  
  USERNAME: process.env.TTLOCK_USERNAME || '',
  PASSWORD: process.env.TTLOCK_PASSWORD || ''
};

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex').toLowerCase();
}

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify(data);
    const options = {
      hostname: CONFIG.API_HOST,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(resData));
        } catch(e) {
          resolve(resData);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('========================================================');
  console.log('🔑 TTLock 授权凭据获取助手');
  console.log('========================================================\n');

  if (CONFIG.CLIENT_ID.includes('填入') || CONFIG.USERNAME.includes('填入')) {
    console.log('👉 请先编辑 get_ttlock_token.js 填入你的 Client ID, Secret, App 账号与密码！\n');
    return;
  }

  // 1. 密码模式换取 Access Token
  console.log('1. 正在换取 Access Token...');
  const tokenRes = await request('POST', '/oauth2/token', {
    clientId: CONFIG.CLIENT_ID,
    clientSecret: CONFIG.CLIENT_SECRET,
    username: CONFIG.USERNAME,
    password: md5(CONFIG.PASSWORD),
    grant_type: 'password'
  });

  if (tokenRes.errcode && tokenRes.errcode !== 0) {
    console.error('❌ 获取 Token 失败:', tokenRes);
    return;
  }

  const accessToken = tokenRes.access_token;
  console.log('✅ Access Token 获取成功:');
  console.log(`   access_token = \x1b[32m${accessToken}\x1b[0m`);
  console.log(`   expires_in   = ${tokenRes.expires_in} 秒 (支持自动刷新)\n`);

  // 2. 查询名下所有锁具及其 Lock ID
  console.log('2. 正在查询当前账号名下的所有智能门锁...');
  const lockRes = await request('POST', '/v3/lock/list', {
    clientId: CONFIG.CLIENT_ID,
    accessToken: accessToken,
    pageNo: 1,
    pageSize: 100,
    date: Date.now()
  });

  if (lockRes.list && lockRes.list.length > 0) {
    console.log(`✅ 成功找到 ${lockRes.list.length} 把智能锁：`);
    lockRes.list.forEach((lock, idx) => {
      console.log(`   [${idx + 1}] 锁具名称: \x1b[36m${lock.lockAlias || lock.lockName}\x1b[0m | Lock ID: \x1b[33m${lock.lockId}\x1b[0m | 电量: ${lock.electricQuantity}% | 网关在线: ${lock.hasGateway ? '是' : '否'}`);
    });
  } else {
    console.log('ℹ️ 当前账号名下暂未添加门锁，请先在 TTLock 手机 App 中添加锁具。');
  }

  console.log('\n========================================================');
  console.log('📝 下一步配置：');
  console.log(`请将以下两行复制并粘贴到你的 .env 文件中：`);
  console.log(`TTLOCK_CLIENT_ID=${CONFIG.CLIENT_ID}`);
  console.log(`TTLOCK_CLIENT_SECRET=${CONFIG.CLIENT_SECRET}`);
  console.log(`TTLOCK_ACCESS_TOKEN=${accessToken}`);
  console.log('========================================================\n');
}

main().catch(console.error);
