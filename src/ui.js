export function goStep(n) {
  const state = window.State
  state.step = n

  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'))
  const targetPanel = document.getElementById('panel' + n)
  if (targetPanel) targetPanel.classList.add('active')

  for (let i = 1; i <= 3; i++) {
    const circle = document.getElementById('sc' + i)
    const label = document.getElementById('sl' + i)
    if (!circle || !label) continue
    circle.classList.remove('active', 'done')
    label.classList.remove('active')
    if (i < n) { circle.classList.add('done') }
    else if (i === n) { circle.classList.add('active'); label.classList.add('active') }
  }

  for (let i = 1; i <= 2; i++) {
    const line = document.getElementById('line' + i)
    if (line) line.classList.toggle('done', i < n)
  }

  window.scrollTo({ top: 0, behavior: 'smooth' })

  if (n === 1) {
    const btn = document.getElementById('btn_parse')
    if (btn) {
      btn.disabled = false
      btn.innerHTML = '🚀 开始解析'
    }
  }
}

export function toggleSection(header) {
  const body = header.nextElementSibling
  const arrow = header.querySelector('.arrow')
  body.classList.toggle('collapsed')
  arrow.classList.toggle('collapsed')
}

export function renderFileList() {
  const el = document.getElementById('file_list')
  el.innerHTML = window.State.uploadedFiles.map((f, i) => `
    <div class="file-item">
      <span class="name">📄 ${f.name}</span>
      <span class="meta">${f.className} · ${f.data.length}条记录</span>
      <span class="remove" onclick="removeFile(${i})">✕ 移除</span>
    </div>
  `).join('')
}

export function renderParseResults() {
  const state = window.State
  const el = document.getElementById('parse_results')
  let html = ''

  state.uploadedFiles.forEach(f => {
    const cls = f.className
    const scores = state.parsedScores[cls] || {}
    const missing = state.missing[cls] || []
    const hasMissing = missing.length > 0
    const totalMatched = f.data.filter(r => scores[String(r[f.idCol])] !== undefined).length
    const conflictSids = Object.keys(state.conflicts[cls] || {}).filter(sid => scores[sid] !== undefined)
    const conflictCount = conflictSids.length

    html += `<div class="class-section">
      <div class="class-header" onclick="toggleSection(this)">
        <div class="title">
          <span class="arrow">▼</span>
          ${cls}
          <span class="badge">${totalMatched}/${f.data.length} 人</span>
          ${hasMissing ? `<span class="badge conflict">${missing.length} 未匹配</span>` : ''}
          ${conflictCount > 0 ? `<span class="badge conflict">${conflictCount} 个冲突</span>` : ''}
          ${!hasMissing && conflictCount === 0 && totalMatched > 0 ? `<span class="badge" style="background:var(--success-bg);color:#065f46;">全部匹配 ✅</span>` : ''}
        </div>
      </div>
      <div class="collapse-body">
        <div class="table-wrap">
          <table class="result-table">
            <thead><tr>
              <th>学号</th><th>姓名</th><th>成绩</th><th>状态</th>
            </tr></thead>
            <tbody>`

    f.data.forEach(row => {
      const sid = String(row[f.idCol] || '')
      const name = f.nameCol >= 0 ? (row[f.headers[f.nameCol]] || '') : ''
      const score = scores[sid]
      const isMissing = missing.includes(sid)
      const conflictScores = state.conflicts[cls]?.[sid]
      const isConflict = conflictScores && conflictScores.length > 1
      const rowClass = isConflict ? 'conflict-row' : (isMissing ? 'missing-row' : '')

      html += `<tr class="${rowClass}">
        <td>${sid}</td>
        <td>${name}</td>
        <td>
          <input class="score-input${isConflict ? ' conflict-input' : ''}" data-cls="${cls}" data-sid="${sid}" value="${score !== undefined ? score : ''}" placeholder="-">
          ${isConflict ? `<span class="conflict-tag" title="原始值: ${conflictScores.join(', ')}">⚠️ ${conflictScores.join(', ')}</span>` : ''}
        </td>
        <td>${isConflict ? '⚠️ 冲突' : (isMissing ? '❓ 未匹配' : '✅')}</td>
      </tr>`
    })

    const rosterIds = new Set(f.data.map(r => String(r[f.idCol])))
    Object.keys(scores).forEach(sid => {
      if (!rosterIds.has(sid)) {
        const conflictScores = state.conflicts[cls]?.[sid]
        const isConflict = conflictScores && conflictScores.length > 1
        html += `<tr class="missing-row">
          <td>${sid}</td><td>（不在花名册中）</td>
          <td>
            <input class="score-input${isConflict ? ' conflict-input' : ''}" data-cls="${cls}" data-sid="${sid}" value="${scores[sid]}">
            ${isConflict ? `<span class="conflict-tag" title="原始值: ${conflictScores.join(', ')}">⚠️ ${conflictScores.join(', ')}</span>` : ''}
          </td>
          <td>${isConflict ? '⚠️ 冲突' : '⚠️ 多余'}</td>
        </tr>`
      }
    })

    html += `</tbody></table></div></div></div>`
  })

  el.innerHTML = html
}

export function renderExportList() {
  const state = window.State
  const el = document.getElementById('export_list')
  let html = ''
  for (const cls in state.filledWorkbooks) {
    const f = state.uploadedFiles.find(f => f.className === cls)
    const fileName = (f ? f.name.replace(/\.\w+$/, '') : cls) + '_已填成绩.xlsx'
    html += `<div class="file-item">
      <span class="name">📊 ${fileName}</span>
      <span class="meta">${cls}</span>
      <button class="btn btn-sm btn-outline" onclick="downloadOne('${cls}')">⬇ 下载</button>
    </div>`
  }
  el.innerHTML = html
}

export function renderTranscript() {
  const el = document.getElementById('voice_transcript')
  if (!window.Voice.finalText && !window.Voice.interimText) {
    el.innerHTML = '<span class="voice-hint">点击"开始录音"后，这里会实时显示识别到的文字</span>'
    return
  }
  const final = escapeHtml(window.Voice.finalText)
  const interim = window.Voice.interimText ? `<span style="color:var(--gray-500);">${escapeHtml(window.Voice.interimText)}</span>` : ''
  el.innerHTML = final + interim
  el.scrollTop = el.scrollHeight
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function setVoiceStatus(text, cls) {
  const el = document.getElementById('voice_status')
  el.textContent = text
  el.className = 'voice-status' + (cls ? ' ' + cls : '')
}

export function setLlmStatus(html, color) {
  const el = document.getElementById('llm_status')
  el.innerHTML = html
  el.style.color = color
}

export function showParseProgress() {
  document.getElementById('panel1').classList.remove('active')
  document.getElementById('panel_parse').classList.add('active')
  document.getElementById('parse_status').textContent = '正在请求 LLM...'
  document.getElementById('stream_box').innerHTML = '<span class="cursor"></span>'
  document.getElementById('parse_elapsed').textContent = '⏱ 0s'
  document.getElementById('token_count').textContent = '已接收 0 字符'
}

export function hideParseProgress() {
  document.getElementById('panel_parse').classList.remove('active')
}

export function updateParseStatus(text) {
  document.getElementById('parse_status').textContent = text
}

export function updateParseElapsed(secs) {
  document.getElementById('parse_elapsed').textContent = '⏱ ' + secs + 's'
}

export function updateTokenCount(len) {
  document.getElementById('token_count').textContent = '已接收 ' + len + ' 字符'
}

export function updateStreamBox(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const el = document.getElementById('stream_box')
  el.innerHTML = escaped + '<span class="cursor"></span>'
  el.scrollTop = el.scrollHeight
}

export function resetParseButton() {
  const btn = document.getElementById('btn_parse')
  btn.disabled = false
  btn.innerHTML = '🚀 开始解析'
}

window.goStep = goStep
window.toggleSection = toggleSection
window.renderFileList = renderFileList
window.renderParseResults = renderParseResults
window.renderExportList = renderExportList
window.renderTranscript = renderTranscript
window.escapeHtml = escapeHtml
window.setVoiceStatus = setVoiceStatus
