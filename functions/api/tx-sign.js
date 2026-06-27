// 腾讯云实时语音识别（WebSocket）— 签名接口
// 文档: https://cloud.tencent.com/document/product/1093/48982

function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

async function hmacSha1Base64(secret, message) {
  const enc = new TextEncoder()
  const keyData = enc.encode(secret)
  const msgData = enc.encode(message)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const bytes = new Uint8Array(sigBuf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { TENCENT_APP_ID, TENCENT_SECRET_ID, TENCENT_SECRET_KEY } = env

  if (!TENCENT_APP_ID || !TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
    return new Response(JSON.stringify({
      error: '请先配置腾讯云环境变量 (TENCENT_APP_ID / TENCENT_SECRET_ID / TENCENT_SECRET_KEY)'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    const params = {
      secretid: TENCENT_SECRET_ID,
      timestamp: String(now),
      expired: String(now + 86400),
      nonce: String(Math.floor(Math.random() * 10000000000)),
      engine_model_type: '16k_zh_en',
      voice_id: uuid(),
      voice_format: '1',
      needvad: '1',
    }

    const keys = Object.keys(params).sort()
    const queryString = keys.map(k => `${k}=${encodeURIComponent(params[k])}`).join('&')
    const signStr = `asr.cloud.tencent.com/asr/v2/${TENCENT_APP_ID}?${queryString}`
    const signature = await hmacSha1Base64(TENCENT_SECRET_KEY, signStr)

    const wsUrl = `wss://${signStr}&signature=${encodeURIComponent(signature)}`

    return new Response(JSON.stringify({ wsUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || '签名生成失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
