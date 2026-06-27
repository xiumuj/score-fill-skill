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

export function parseSSEChunk(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed === 'data: [DONE]') return null
  if (!trimmed.startsWith('data: ')) return null
  try {
    const parsed = JSON.parse(trimmed.slice(6))
    const choice = parsed.choices?.[0]
    return choice?.delta?.content || choice?.text || ''
  } catch {
    return null
  }
}

export function parseNonStreamResponse(data) {
  return data.choices?.[0]?.message?.content || ''
}
