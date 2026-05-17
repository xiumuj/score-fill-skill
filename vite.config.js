import { defineConfig, loadEnv } from 'vite'

function createApiHandler(env) {
  return async (req, res, next) => {
    if (req.url !== '/api/chat' || req.method !== 'POST') {
      return next()
    }

    const { API_KEY, BASE_URL, MODEL } = env

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

      const llmResp = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL || 'deepseek-chat',
          temperature: 0,
          stream: !!stream,
          messages: [{ role: 'user', content: message }],
        }),
      })

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
        const content = data.choices?.[0]?.message?.content || ''
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
    plugins: [
      {
        name: 'api-handler',
        configureServer(server) {
          server.middlewares.use(createApiHandler(env))
        },
      },
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
