import { defineConfig, loadEnv } from 'vite'
import { createHmac, randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { sendLLMRequest, parseNonStreamResponse } from './lib/llm-api.js'

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
  const { API_KEY, BASE_URL, MODEL } = env

  return async (req, res, next) => {
    if (req.url !== '/api/chat' || req.method !== 'POST') return next()
    if (!API_KEY || !BASE_URL) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: '请先配置 API 环境变量（API_KEY / BASE_URL）' }))
      return
    }

    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const { message, stream } = JSON.parse(Buffer.concat(chunks).toString())

      const llmResp = await sendLLMRequest(API_KEY, BASE_URL, MODEL, message, stream)

      if (!llmResp.ok) {
        const data = await llmResp.json().catch(() => ({}))
        res.statusCode = llmResp.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: data.error?.message || `HTTP ${llmResp.status}` }))
        return
      }

      if (stream && llmResp.body) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        })
        const reader = llmResp.body.getReader()
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read()
            if (done) { res.end(); break }
            res.write(value)
          }
        }
        pump().catch(() => res.end())
      } else {
        const data = await llmResp.json()
        const content = parseNonStreamResponse(data)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ content }))
      }
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e.message || '请求失败' }))
    }
  }
}

function createXfSignHandler(env) {
  const { XF_APP_ID, XF_ACCESS_KEY_ID, XF_ACCESS_KEY_SECRET } = env
  return async (req, res, next) => {
    if (req.url !== '/api/xf-sign' || req.method !== 'POST') return next()
    if (!XF_APP_ID || !XF_ACCESS_KEY_ID || !XF_ACCESS_KEY_SECRET) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: '请先配置讯飞环境变量' }))
      return
    }
    try {
      const now = new Date()
      const tzOffset = now.getTimezoneOffset()
      const tzSign = tzOffset <= 0 ? '+' : '-'
      const pad = n => String(n).padStart(2, '0')
      const tzHours = pad(Math.abs(Math.floor(tzOffset / 60)))
      const tzMins = pad(Math.abs(tzOffset % 60))
      const utc = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${tzSign}${tzHours}${tzMins}`
      const params = { appId: XF_APP_ID, accessKeyId: XF_ACCESS_KEY_ID, utc, lang: 'autodialect', audio_encode: 'pcm_s16le', samplerate: '16000' }
      const keys = Object.keys(params).sort()
      const baseStr = keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&')
      const sig = createHmac('sha1', XF_ACCESS_KEY_SECRET).update(baseStr).digest('base64')
      const wsUrl = `wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1?${baseStr}&signature=${encodeURIComponent(sig)}`
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ wsUrl }))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e.message }))
    }
  }
}

function createTxSignHandler(env) {
  const { TENCENT_APP_ID, TENCENT_SECRET_ID, TENCENT_SECRET_KEY } = env
  return async (req, res, next) => {
    if (req.url !== '/api/tx-sign' || req.method !== 'POST') return next()
    if (!TENCENT_APP_ID || !TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: '请先配置腾讯云环境变量' }))
      return
    }
    try {
      const now = Math.floor(Date.now() / 1000)
      const params = {
        secretid: TENCENT_SECRET_ID,
        timestamp: String(now),
        expired: String(now + 86400),
        nonce: String(Math.floor(Math.random() * 10000000000)),
        engine_model_type: '16k_zh_en',
        voice_id: randomUUID(),
        voice_format: '1',
        needvad: '1',
      }
      const keys = Object.keys(params).sort()
      const queryStr = keys.map(k => `${k}=${encodeURIComponent(params[k])}`).join('&')
      const signStr = `asr.cloud.tencent.com/asr/v2/${TENCENT_APP_ID}?${queryStr}`
      const sig = createHmac('sha1', TENCENT_SECRET_KEY).update(signStr).digest('base64')
      const wsUrl = `wss://${signStr}&signature=${encodeURIComponent(sig)}`
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
        server.middlewares.use(createXfSignHandler(env))
        server.middlewares.use(createTxSignHandler(env))
      },
    }],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
