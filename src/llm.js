import { setLlmStatus } from './ui.js'

export async function callLLM(userMsg, stream, onChunk) {
  const controller = new AbortController()
  window.State._abortController = controller

  const timeoutMs = 300000
  const timeoutId = setTimeout(() => { controller.abort(); window.State._abortController = null }, timeoutMs)

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMsg, stream: stream || false }),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!resp.ok) {
      const data = await resp.json()
      throw new Error(data.error || 'HTTP ' + resp.status)
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
          } catch(e) { /* skip malformed SSE lines */ }
        }
      }
      return fullContent
    } else {
      const data = await resp.json()
      return data.content || ''
    }
  } catch(e) {
    if (e.name === 'AbortError') throw new Error('请求超时（5分钟），请稍后重试。')
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      throw new Error('网络请求失败，请检查网络连接后重试。')
    }
    throw e
  } finally {
    window.State._abortController = null
  }
}

export async function testLLM() {
  const btn = document.getElementById('btn_test_llm')
  btn.disabled = true
  setLlmStatus('⏳ 测试中...', 'var(--gray-500)')
  try {
    const resp = await callLLM('回复"ok"即可', false)
    if (resp && resp.length > 0) {
      setLlmStatus('✅ LLM 连通', 'var(--success)')
    } else {
      setLlmStatus('⚠️ 响应为空', 'var(--warning)')
    }
  } catch (e) {
    setLlmStatus('❌ ' + e.message.slice(0, 30), 'var(--danger)')
  } finally {
    btn.disabled = false
  }
}

window.callLLM = callLLM
window.testLLM = testLLM
