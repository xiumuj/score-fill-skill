export async function onRequest({ request, env }) {
  const { API_KEY, BASE_URL, MODEL } = env;

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
    const body = await request.json();
    const userMessage = body.message || '';
    const stream = body.stream || false;

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL || 'deepseek-chat',
        temperature: 0,
        stream: stream,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const buf = await response.arrayBuffer();
      const raw = new TextDecoder('utf-8').decode(buf);
      let data;
      try { data = JSON.parse(raw); } catch(e) { data = {}; }
      return new Response(JSON.stringify({
        error: data.error?.message || `HTTP ${response.status}`
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    if (stream && response.body) {
      // Streaming response
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      // Non-streaming response — 用 ArrayBuffer 强制 UTF-8 解码
      const buf = await response.arrayBuffer();
      const raw = new TextDecoder('utf-8').decode(buf);
      const data = JSON.parse(raw);
      const content = data.choices?.[0]?.message?.content || '';
      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
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