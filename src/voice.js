const SILENCE_TIMEOUT = 10000

const Voice = {
  active: false,
  ws: null,
  provider: null,
  mediaStream: null,
  audioCtx: null,
  processor: null,
  source: null,
  sendTimer: null,
  pcmQueue: [],
  elapsedTimer: null,
  elapsedSec: 0,
  interimText: '',
  finalText: '',
  sessionId: null,
  silenceTimer: null
}

window.Voice = Voice

function setVoiceStatus(text, cls) {
  const el = document.getElementById('voice_status')
  el.textContent = text
  el.className = 'voice-status' + (cls ? ' ' + cls : '')
}

function renderTranscript() {
  const el = document.getElementById('voice_transcript')
  if (!Voice.finalText && !Voice.interimText) {
    el.innerHTML = '<span class="voice-hint">点击"开始录音"后，这里会实时显示识别到的文字</span>'
    return
  }
  const final = escapeHtml(Voice.finalText)
  const interim = Voice.interimText ? `<span style="color:var(--gray-500);">${escapeHtml(Voice.interimText)}</span>` : ''
  el.innerHTML = final + interim
  el.scrollTop = el.scrollHeight
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function resetSilenceTimer() {
  if (Voice.silenceTimer) clearTimeout(Voice.silenceTimer)
  Voice.silenceTimer = setTimeout(() => {
    setVoiceStatus('🛑 10秒无语音输入，已自动停止', '')
    stopVoice()
  }, SILENCE_TIMEOUT)
}

function cleanupVoice() {
  if (Voice.processor) { try { Voice.processor.disconnect() } catch(e){} Voice.processor = null }
  if (Voice.source) { try { Voice.source.disconnect() } catch(e){} Voice.source = null }
  if (Voice.audioCtx) { try { Voice.audioCtx.close() } catch(e){} Voice.audioCtx = null }
  if (Voice.mediaStream) { Voice.mediaStream.getTracks().forEach(t => t.stop()); Voice.mediaStream = null }
  Voice.pcmQueue = []
  Voice.silenceTimer = null
}

function onAudioProcess(e) {
  if (!Voice.active) return
  const float32 = e.inputBuffer.getChannelData(0)
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  const bytes = new Uint8Array(int16.buffer)
  for (let i = 0; i < bytes.length; i += 1280) {
    const slice = bytes.slice(i, i + 1280)
    if (slice.length === 1280) Voice.pcmQueue.push(slice.buffer)
  }
}

function onWsOpen() {
  Voice.active = true
  setVoiceStatus('识别中...', 'recording')
  document.getElementById('btn_voice').classList.add('recording')
  document.getElementById('btn_voice').innerHTML = '⏹ 停止录音'
  Voice.interimText = ''; Voice.finalText = ''
  renderTranscript()

  Voice.pcmQueue = []
  Voice.sendTimer = setInterval(() => {
    if (!Voice.ws || Voice.ws.readyState !== WebSocket.OPEN) return
    while (Voice.pcmQueue.length) {
      Voice.ws.send(Voice.pcmQueue.shift())
    }
  }, 40)

  Voice.elapsedSec = 0
  Voice.elapsedTimer = setInterval(() => {
    Voice.elapsedSec++
    document.getElementById('voice_timer').textContent = '⏱ ' + Voice.elapsedSec + 's'
  }, 1000)

  resetSilenceTimer()
}

function extractXunfeiSentence(st) {
  let text = ''
  const rts = st.rt || []
  for (const rt of rts) {
    const wss = rt.ws || []
    for (const ws of wss) {
      const cws = ws.cw || []
      for (const cw of cws) {
        if (cw.w) text += cw.w
      }
    }
  }
  return text
}

function onXunfeiMessage(ev) {
  let msg
  try { msg = JSON.parse(ev.data) } catch (e) { return }

  if (msg.sid) Voice.sessionId = msg.sid

  if (msg.action === 'error') {
    setVoiceStatus('讯飞错误: ' + (msg.desc || JSON.stringify(msg.data || {})), 'error')
    return
  }
  if (msg.msg_type === 'error') {
    setVoiceStatus('讯飞错误: ' + (msg.desc || JSON.stringify(msg.data || {})), 'error')
    return
  }
  if (msg.msg_type === 'result' && msg.res_type === 'frc') {
    setVoiceStatus('讯飞错误: ' + (msg.data?.desc || '功能异常'), 'error')
    return
  }

  if (msg.action && msg.action !== 'result') return
  if (msg.msg_type && msg.msg_type !== 'result') return

  let result
  try {
    result = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
    if (result === null || typeof result !== 'object') return
  } catch (e) { return }

  const st = result?.cn?.st
  if (!st) return

  const sentence = extractXunfeiSentence(st)
  const type = st.type

  if (type === '1') {
    Voice.interimText = sentence
  } else {
    Voice.finalText += sentence
    Voice.interimText = ''
  }
  if (sentence) resetSilenceTimer()
  renderTranscript()
}

function onTencentMessage(ev) {
  let msg
  try { msg = JSON.parse(ev.data) } catch (e) { return }

  if (msg.code !== 0) {
    setVoiceStatus('腾讯错误: ' + (msg.message || JSON.stringify(msg)), 'error')
    return
  }

  if (msg.final === 1) return

  const result = msg.result
  if (!result) return

  const text = result.voice_text_str || ''

  if (result.slice_type === 1) {
    Voice.interimText = text
  } else if (result.slice_type === 2) {
    if (text) {
      Voice.finalText += text
      Voice.interimText = ''
    }
  } else if (result.slice_type === 0) {
    Voice.interimText = text || Voice.interimText
  }

  if (text) resetSilenceTimer()
  renderTranscript()
}

export async function toggleVoice() {
  if (Voice.active) { stopVoice(); return }
  const ok = await window.showConfirm('录音额度有限，建议使用手机自带语音输入法在成绩文本框中输入，是否继续录音？')
  if (!ok) return
  await startVoice()
}

async function fetchWsUrl(url) {
  const resp = await fetch(url, { method: 'POST' })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || '鉴权失败')
  return data.wsUrl
}

async function startVoice() {
  if (!window.State.uploadedFiles.length) { alert('请先上传花名册，再开始语音录入'); return }

  setVoiceStatus('鉴权中（腾讯云）...', '')
  let wsUrl, provider
  try {
    wsUrl = await fetchWsUrl('/api/tx-sign')
    provider = 'tencent'
  } catch (e1) {
    setVoiceStatus('腾讯云鉴权失败，尝试讯飞...', '')
    try {
      wsUrl = await fetchWsUrl('/api/xf-sign')
      provider = 'xunfei'
    } catch (e2) {
      setVoiceStatus('所有语音服务均不可用: ' + e2.message, 'error')
      return
    }
  }

  Voice.provider = provider

  setVoiceStatus('连接麦克风...', '')
  try {
    Voice.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true }
    })
  } catch (e) {
    setVoiceStatus('无法访问麦克风: ' + e.message, '')
    return
  }

  setVoiceStatus('连接语音服务...', '')
  Voice.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
  if (Voice.audioCtx.state === 'suspended') await Voice.audioCtx.resume()
  Voice.source = Voice.audioCtx.createMediaStreamSource(Voice.mediaStream)
  Voice.processor = Voice.audioCtx.createScriptProcessor(4096, 1, 1)
  Voice.processor.onaudioprocess = onAudioProcess
  Voice.source.connect(Voice.processor)
  Voice.processor.connect(Voice.audioCtx.destination)

  try {
    Voice.ws = new WebSocket(wsUrl)
  } catch (e) {
    setVoiceStatus('WebSocket 创建失败: ' + e.message, '')
    cleanupVoice()
    return
  }
  Voice.ws.onopen = onWsOpen
  Voice.ws.onmessage = provider === 'tencent' ? onTencentMessage : onXunfeiMessage
  Voice.ws.onerror = () => {
    setVoiceStatus('WebSocket 连接失败', 'error')
    Voice.active = false
    if (Voice.sendTimer) { clearInterval(Voice.sendTimer); Voice.sendTimer = null }
    if (Voice.elapsedTimer) { clearInterval(Voice.elapsedTimer); Voice.elapsedTimer = null }
    cleanupVoice()
  }
  Voice.ws.onclose = (ev) => {
    const reason = ev.reason ? ' (' + ev.reason + ')' : ''
    setVoiceStatus('连接已断开(code=' + ev.code + reason + ')', ev.code !== 1000 ? 'error' : '')
    Voice.active = false
    if (Voice.sendTimer) { clearInterval(Voice.sendTimer); Voice.sendTimer = null }
    if (Voice.elapsedTimer) { clearInterval(Voice.elapsedTimer); Voice.elapsedTimer = null }
    if (ev.code !== 1000) cleanupVoice()
    Voice.ws = null
  }
}

function stopVoice() {
  if (!Voice.active && !Voice.ws) { cleanupVoice(); return }
  Voice.active = false

  if (Voice.sendTimer) { clearInterval(Voice.sendTimer); Voice.sendTimer = null }
  if (Voice.elapsedTimer) { clearInterval(Voice.elapsedTimer); Voice.elapsedTimer = null }
  if (Voice.silenceTimer) { clearTimeout(Voice.silenceTimer); Voice.silenceTimer = null }

  if (Voice.ws) {
    try {
      if (Voice.ws.readyState === WebSocket.OPEN) {
        const stopMsg = Voice.provider === 'tencent'
          ? JSON.stringify({ type: 'end' })
          : JSON.stringify({ end: true, sessionId: Voice.sessionId || '' })
        Voice.ws.send(stopMsg)
      }
      Voice.ws.close()
    } catch (e) {}
    Voice.ws = null
    Voice.sessionId = null
  }
  cleanupVoice()
  document.getElementById('btn_voice').classList.remove('recording')
  document.getElementById('btn_voice').innerHTML = '🎤 开始录音'
  setVoiceStatus('已停止', '')

  const transcript = Voice.finalText.trim()
  if (transcript) {
    const ta = document.getElementById('score_text')
    if (ta.value.trim()) ta.value += '\n' + transcript
    else ta.value = transcript
    ta.focus()
    setVoiceStatus('✅ 已转录到文本框，可编辑后点击"开始解析"', '')
    document.getElementById('btn_parse').scrollIntoView({ behavior: 'smooth' })
  }
  Voice.provider = null
}

window.toggleVoice = toggleVoice