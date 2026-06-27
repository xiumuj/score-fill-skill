import { State } from './state.js'

export async function callLLM(userMsg, stream, onChunk) {
  const controller = new AbortController()
  State._abortController = controller

  const timeoutMs = 300000
  const timeoutId = setTimeout(() => { controller.abort(); State._abortController = null }, timeoutMs)

  try {
    const apiBase = import.meta.env.VITE_API_BASE || '/api'
    const resp = await fetch(`${apiBase}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMsg, stream: stream || false }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!resp.ok) {
      let errMsg = 'HTTP ' + resp.status
      try {
        const data = await resp.json()
        errMsg = data.error || errMsg
      } catch (e) { /* body may be empty */ }
      throw new Error(errMsg)
    }

    if (stream && onChunk) {
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue
          const jsonStr = trimmed.slice(6)
          try {
            const parsed = JSON.parse(jsonStr)
            const choice = parsed.choices?.[0]
            const delta = choice?.delta?.content || choice?.text || ''
            if (delta) {
              fullContent += delta
              onChunk(delta, fullContent)
            }
          } catch (e) { /* skip */ }
        }
      }
      return fullContent
    } else {
      const text = await resp.text()
      try {
        const data = JSON.parse(text)
        return data.content || ''
      } catch (e) {
        return text || ''
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('请求超时（5分钟），请稍后重试。')
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      throw new Error('网络请求失败，请检查网络连接后重试。')
    }
    throw e
  } finally {
    State._abortController = null
  }
}
