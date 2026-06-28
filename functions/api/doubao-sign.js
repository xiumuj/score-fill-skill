// 豆包语音识别 (火山引擎 ASR) — 签名接口
// 文档: https://www.volcengine.com/docs/ASR/5087375

async function hmacSha256Base64(secret, message) {
  const enc = new TextEncoder()
  const keyData = enc.encode(secret)
  const msgData = enc.encode(message)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const bytes = new Uint8Array(sigBuf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

async function getAccessToken(appId, accessKeyId, accessKeySecret) {
  const host = 'open.volcengineapi.com'
  const path = '/api/v3/oauth/token'
  const method = 'POST'

  const now = new Date()
  const date = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const nonce = String(Date.now())

  const signedHeaders = 'host;x-date'
  const authString = `HMAC-SHA256\n${method}\n${path}\n\nhost:${host}\nx-date:${date}\n\n${signedHeaders}`
  const signature = await hmacSha256Base64(accessKeySecret, authString)
  const authHeader = `HMAC-SHA256 Credential=${accessKeyId}/${date.slice(0, 8)}/cn-beijing/asr/request, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const resp = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': host,
      'X-Date': date,
      'Authorization': authHeader,
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: accessKeySecret,
    })
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`获取 access_token 失败: ${err}`)
  }

  const data = await resp.json()
  return data.access_token
}

function buildWsUrl(token, cluster) {
  const params = new URLSearchParams({
    token,
    cluster,
    language: 'zh-CN',
    sample_rate: '16000',
    format: 'pcm',
  })
  return `wss://openspeech.bytedance.com/api/v2/asr?${params.toString()}`
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { DOUBAO_APP_ID, DOUBAO_ACCESS_KEY_ID, DOUBAO_ACCESS_KEY_SECRET } = env

  if (!DOUBAO_APP_ID || !DOUBAO_ACCESS_KEY_ID || !DOUBAO_ACCESS_KEY_SECRET) {
    return new Response(JSON.stringify({
      error: '请先配置豆包环境变量 (DOUBAO_APP_ID / DOUBAO_ACCESS_KEY_ID / DOUBAO_ACCESS_KEY_SECRET)'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const token = await getAccessToken(DOUBAO_APP_ID, DOUBAO_ACCESS_KEY_ID, DOUBAO_ACCESS_KEY_SECRET)
    const wsUrl = buildWsUrl(token, 'volcengine_streaming_common')

    return new Response(JSON.stringify({ wsUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || '豆包鉴权失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
