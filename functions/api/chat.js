import { sendLLMRequest, parseNonStreamResponse } from '../../lib/llm-api.js'

export async function onRequest({ request, env }) {
  const { API_KEY, BASE_URL, MODEL } = env

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!API_KEY || !BASE_URL) {
    return new Response(JSON.stringify({ error: '请先配置 API 环境变量' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { message, stream } = await request.json()
    const llmResp = await sendLLMRequest(API_KEY, BASE_URL, MODEL, message, stream)

    if (!llmResp.ok) {
      const data = await llmResp.json().catch(() => ({}))
      return new Response(JSON.stringify({
        error: data.error?.message || `HTTP ${llmResp.status}`,
      }), {
        status: llmResp.status, headers: { 'Content-Type': 'application/json' },
      })
    }

    if (stream && llmResp.body) {
      return new Response(llmResp.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    const data = await llmResp.json()
    const content = parseNonStreamResponse(data)
    return new Response(JSON.stringify({ content }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || '请求失败' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
