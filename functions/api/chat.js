export async function onRequest({ request, env }) {
  const { API_KEY, BASE_URL, MODEL } = env;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!API_KEY || !BASE_URL) {
    return new Response(JSON.stringify({ error: '请先配置 API 环境变量' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
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
      const data = await response.json().catch(() => ({ error: {} }));
      return new Response(JSON.stringify({
        error: data.error?.message || `HTTP ${response.status}`
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
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
      // Non-streaming response
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || '请求失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}