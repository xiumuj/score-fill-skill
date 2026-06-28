import { LLMClient, Config } from 'coze-coding-dev-sdk'

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const { message, stream } = await request.json()

    const config = new Config({ apiKey: env.COZE_API_KEY })
    const client = new LLMClient(config)

    if (stream) {
      const streamResponse = client.stream(
        [{ role: 'user', content: message }],
        { model: 'doubao-seed-1-8-251228', temperature: 0 }
      )

      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamResponse) {
              if (chunk.content) {
                const text = chunk.content.toString()
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`))
              }
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch (e) {
            controller.error(e)
          }
        }
      })

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    } else {
      const response = await client.invoke(
        [{ role: 'user', content: message }],
        { model: 'doubao-seed-1-8-251228', temperature: 0 }
      )
      return new Response(JSON.stringify({ content: response.content }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    }
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || '请求失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
