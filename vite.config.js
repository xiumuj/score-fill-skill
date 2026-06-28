import { defineConfig, loadEnv } from 'vite'
import { readFileSync, existsSync } from 'fs'
import { LLMClient, Config } from 'coze-coding-dev-sdk'

function loadDotDevVars(root) {
  const path = root + '/.dev.vars'
  if (!existsSync(path)) return {}
  const vars = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]\w+)=(.*)$/)
    if (m) vars[m[1]] = m[2].trim()
  }
  return vars
}

function createApiHandler(env) {
  const { COZE_API_KEY } = env

  return async (req, res, next) => {
    if (req.url !== '/api/chat' || req.method !== 'POST') return next()

    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const { message, stream } = JSON.parse(Buffer.concat(chunks).toString())

      const config = new Config({ apiKey: COZE_API_KEY })
      const client = new LLMClient(config)

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        })

        const streamResponse = client.stream(
          [{ role: 'user', content: message }],
          { model: 'doubao-seed-1-8-251228', temperature: 0 }
        )

        for await (const chunk of streamResponse) {
          if (chunk.content) {
            res.write(`data: ${JSON.stringify({ content: chunk.content.toString() })}\n\n`)
          }
        }
        res.write('data: [DONE]\n\n')
        res.end()
      } else {
        const response = await client.invoke(
          [{ role: 'user', content: message }],
          { model: 'doubao-seed-1-8-251228', temperature: 0 }
        )
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ content: response.content }))
      }
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e.message || '请求失败' }))
    }
  }
}

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

async function getDoubaoAccessToken(appId, accessKeyId, accessKeySecret) {
  const host = 'open.volcengineapi.com'
  const path = '/api/v3/oauth/token'
  const method = 'POST'
  const now = new Date()
  const date = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const signedHeaders = 'host;x-date'
  const authString = `HMAC-SHA256\n${method}\n${path}\n\nhost:${host}\nx-date:${date}\n\n${signedHeaders}`
  const signature = await hmacSha256Base64(accessKeySecret, authString)
  const authHeader = `HMAC-SHA256 Credential=${accessKeyId}/${date.slice(0, 8)}/cn-beijing/asr/request, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const resp = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Host': host, 'X-Date': date, 'Authorization': authHeader },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: appId, client_secret: accessKeySecret })
  })
  if (!resp.ok) throw new Error('获取 access_token 失败')
  const data = await resp.json()
  return data.access_token
}

function createDoubaoSignHandler(env) {
  const { DOUBAO_APP_ID, DOUBAO_ACCESS_KEY_ID, DOUBAO_ACCESS_KEY_SECRET } = env
  return async (req, res, next) => {
    if (req.url !== '/api/doubao-sign' || req.method !== 'POST') return next()
    if (!DOUBAO_APP_ID || !DOUBAO_ACCESS_KEY_ID || !DOUBAO_ACCESS_KEY_SECRET) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: '请先配置豆包环境变量' }))
      return
    }
    try {
      const token = await getDoubaoAccessToken(DOUBAO_APP_ID, DOUBAO_ACCESS_KEY_ID, DOUBAO_ACCESS_KEY_SECRET)
      const params = new URLSearchParams({ token, cluster: 'volcengine_streaming_common', language: 'zh-CN', sample_rate: '16000', format: 'pcm' })
      const wsUrl = `wss://openspeech.bytedance.com/api/v2/asr?${params.toString()}`
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ wsUrl }))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e.message }))
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...loadDotDevVars(process.cwd()) }
  return {
    plugins: [{
      name: 'api-handler',
      configureServer(server) {
        server.middlewares.use(createApiHandler(env))
        server.middlewares.use(createDoubaoSignHandler(env))
      },
    }],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
