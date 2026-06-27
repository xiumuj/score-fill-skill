export function buildLLMRequest(apiKey, baseUrl, model, message, stream) {
  return {
    url: `${baseUrl}/chat/completions`,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        temperature: 0,
        stream: !!stream,
        messages: [{ role: 'user', content: message }],
      }),
    },
  }
}

export async function sendLLMRequest(apiKey, baseUrl, model, message, stream) {
  const { url, options } = buildLLMRequest(apiKey, baseUrl, model, message, stream)
  return fetch(url, options)
}

export function parseNonStreamResponse(data) {
  return data.choices?.[0]?.message?.content || ''
}
