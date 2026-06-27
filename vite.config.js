import { defineConfig, loadEnv } from 'vite'
import { sendLLMRequest, parseNonStreamResponse } from './lib/llm-api.js'

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [{
      name: 'api-handler',
      configureServer(server) {
        server.middlewares.use(createApiHandler(env))
      },
    }],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
