// 讯飞实时语音转写大模型版 - 签名接口
// 文档: https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html
//
// 浏览器直连讯飞 wss 时需要带 appId/accessKeyId/utc/signature 参数。
// signature 必须用 accessKeySecret 计算，因此签名必须在服务端完成。
// 本接口仅返回拼好的完整 wss URL，密钥绝不返回前端。

const RTASR_HOST = 'office-api-ast-dx.iflyaisol.com';
const RTASR_PATH = '/ast/communicate/v1';

// 当前时间（含时区偏移），格式如: 2025-09-04T15:38:07+0800
// 注意时区偏移部分不能带冒号(如 +08:00 错误)，否则讯飞返回 35013 时区格式错误
function getUtc() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset();
  const tzHours = Math.abs(Math.floor(tzOffset / 60));
  const tzMinutes = Math.abs(tzOffset % 60);
  const tzSign = tzOffset <= 0 ? '+' : '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${tzSign}${pad(tzHours)}${pad(tzMinutes)}`;
}

// 讯飞签名算法（HMAC-SHA1）:
// 1. 取除 signature 外的所有参数, 按 key 升序排序
// 2. 键值分别 URL 编码后按 k=v& 拼接成 baseString
// 3. 用 accessKeySecret 作为 key 对 baseString 做 HMAC-SHA1
// 4. Base64 编码得到 signature
function buildBaseString(params) {
  const keys = Object.keys(params).sort();
  return keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
}

async function hmacSha1Base64(secret, message) {
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );

  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  // 转 Base64
  const bytes = new Uint8Array(sigBuf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { XF_APP_ID, XF_ACCESS_KEY_ID, XF_ACCESS_KEY_SECRET } = env;

  if (!XF_APP_ID || !XF_ACCESS_KEY_ID || !XF_ACCESS_KEY_SECRET) {
    return new Response(JSON.stringify({
      error: '请先配置讯飞环境变量 (XF_APP_ID / XF_ACCESS_KEY_ID / XF_ACCESS_KEY_SECRET)'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const params = {
      appId: XF_APP_ID,
      accessKeyId: XF_ACCESS_KEY_ID,
      utc: getUtc(),
      lang: 'autodialect',
      audio_encode: 'pcm_s16le',
      samplerate: '16000',
    };

    const baseString = buildBaseString(params);
    const signature = await hmacSha1Base64(XF_ACCESS_KEY_SECRET, baseString);

    const wsUrl = `wss://${RTASR_HOST}${RTASR_PATH}?${baseString}&signature=${encodeURIComponent(signature)}`;

    return new Response(JSON.stringify({ wsUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || '签名生成失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
