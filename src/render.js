import { State } from './state.js'

export function detectIssues() {
  State.missing = {}
  State.uploadedFiles.forEach(f => {
    const cls = f.className
    const scores = State.parsedScores[cls] || {}
    const rosterIds = f.data.map(r => String(r[f.idCol])).filter(Boolean)
    State.missing[cls] = rosterIds.filter(id => !(id in scores))
  })
}

export function renderParseResults() {
  const el = document.getElementById('parse_results')
  let html = ''

  if (State.unmatchedFromParsed?.length) {
    html += `<div class="alert alert-warning" style="margin-bottom:16px;">
      <strong>⚠️ 注意：</strong>成绩文本中解析到以下班级，但花名册中没有对应的班级：
      <span style="font-weight:bold;">${State.unmatchedFromParsed.join('、')}</span>
    </div>`
  }

  if (State.unmatchedFromExcel?.length) {
    html += `<div class="alert alert-info" style="margin-bottom:16px;">
      <strong>ℹ️ 提示：</strong>花名册中有以下班级，但成绩文本中未找到对应的成绩：
      <span style="font-weight:bold;">${State.unmatchedFromExcel.join('、')}</span>
    </div>`
  }

  State.uploadedFiles.forEach(f => {
    const cls = f.className
    const scores = State.parsedScores[cls] || {}
    const missing = State.missing[cls] || []
    const hasMissing = missing.length > 0
    const totalMatched = f.data.filter(r => scores[String(r[f.idCol])] !== undefined).length
    const conflictSids = Object.keys(State.conflicts[cls] || {}).filter(sid => scores[sid] !== undefined)
    const conflictCount = conflictSids.length

    html += `<div class="class-section">
      <div class="class-header" onclick="toggleSection(this)">
        <div class="title">
          <span class="arrow">▼</span>
          ${cls}
          <span class="badge">${totalMatched}/${f.data.length} 人</span>
          ${hasMissing ? `<span class="badge conflict">${missing.length} 未匹配</span>` : ''}
          ${conflictCount > 0 ? `<span class="badge conflict">${conflictCount} 个冲突</span>` : ''}
          ${!hasMissing && !conflictCount && totalMatched > 0 ? `<span class="badge" style="background:var(--success-bg);color:#065f46;">全部匹配 ✅</span>` : ''}
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
      const conflictScores = State.conflicts[cls]?.[sid]
      const isConflict = conflictScores?.length > 1
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
        html += `<tr class="missing-row">
          <td>${sid}</td>
          <td>${f.nameCol >= 0 ? '（不在花名册中）' : ''}</td>
          <td>
            <input class="score-input${State.conflicts[cls]?.[sid]?.length > 1 ? ' conflict-input' : ''}" data-cls="${cls}" data-sid="${sid}" value="${scores[sid]}">
            ${State.conflicts[cls]?.[sid]?.length > 1 ? `<span class="conflict-tag" title="原始值: ${State.conflicts[cls][sid].join(', ')}">⚠️ ${State.conflicts[cls][sid].join(', ')}</span>` : ''}
          </td>
          <td>${State.conflicts[cls]?.[sid]?.length > 1 ? '⚠️ 冲突' : '⚠️ 多余'}</td>
        </tr>`
      }
    })

    html += `</tbody></table></div></div></div>`
  })

  el.innerHTML = html
}
