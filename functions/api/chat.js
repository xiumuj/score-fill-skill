import { sendLLMRequest } from '../../lib/llm-api.js'

export async function onRequest({ request, env }) {
  const { API_KEY, BASE_URL, MODEL } = env

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (!API_KEY || !BASE_URL) {
    return new Response(JSON.stringify({ error: '请先配置 API 环境变量' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const { message, stream } = await request.json()
    const resp = await sendLLMRequest(API_KEY, BASE_URL, MODEL, message, stream)

    if (!resp.ok) {
      const buf = await resp.arrayBuffer();
      const raw = new TextDecoder('utf-8').decode(buf);
      let data;
      try { data = JSON.parse(raw); } catch(e) { data = {}; }
      return new Response(JSON.stringify({
        error: data.error?.message || `HTTP ${resp.status}`,
      }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    if (stream && resp.body) {
      return new Response(resp.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    const buf = await resp.arrayBuffer();
    const raw = new TextDecoder('utf-8').decode(buf);
    const data = JSON.parse(raw);
    const content = data.choices?.[0]?.message?.content || '';
    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || '请求失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
