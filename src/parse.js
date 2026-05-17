import { State } from './state.js'
import { callLLM } from './chat.js'
import { goStep } from './ui.js'

export async function doParse() {
  State.scoreText = document.getElementById('score_text').value.trim()
  if (!State.scoreText) { alert('请先粘贴成绩文本'); return }
  if (!State.uploadedFiles.length) { alert('请先上传花名册'); return }

  const btn = document.getElementById('btn_parse')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> 解析中...'

  document.getElementById('panel1').classList.remove('active')
  document.getElementById('panel_parse').classList.add('active')
  document.getElementById('parse_status').textContent = '正在请求 LLM...'
  document.getElementById('stream_box').innerHTML = '<span class="cursor"></span>'
  document.getElementById('parse_elapsed').textContent = '⏱ 0s'
  document.getElementById('token_count').textContent = '已接收 0 字符'
  let elapsedSec = 0
  State._parseElapsedTimer = setInterval(() => {
    elapsedSec++
    document.getElementById('parse_elapsed').textContent = '⏱ ' + elapsedSec + 's'
  }, 1000)

  try {
    const excelClassNames = State.uploadedFiles.map(f => f.className)

    document.getElementById('parse_status').textContent = 'LLM 正在解析成绩文本...'

    const extractPrompt = `你是一个成绩解析专家。请从以下成绩文本中提取所有班级、学号和分数信息。

## 成绩文本
${State.scoreText}

## 输出格式
只输出一个纯粹的 JSON 对象，不要任何 markdown、注释或其他文字。key 为班级名称，value 为学号-分数对的**数组**（保留所有出现，不要合并去重）。示例：
{"一班":[["1",5],["2",8]],"二班":[["12",6],["12",0]]}

## 要求
1. 仔细分析成绩文本，识别所有提到的班级
2. 每个班级的学生成绩用数组形式存储，每个条目为 [学号, 分数]
3. 学号用数字字符串表示
4. 分数用整数表示
5. 中文数字（一、二、两、三、十二等）转为阿拉伯数字
6. 保留所有出现的记录，不要合并去重

请确保完整解析所有成绩信息！`

    let fullResponse = ''
    const streamBox = document.getElementById('stream_box')

    fullResponse = await callLLM(extractPrompt, true, (chunk, accumulated) => {
      const escaped = accumulated
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      streamBox.innerHTML = escaped + '<span class="cursor"></span>'
      streamBox.scrollTop = streamBox.scrollHeight
      document.getElementById('token_count').textContent = '已接收 ' + accumulated.length + ' 字符'
    })

    let parsed
    try {
      parsed = JSON.parse(fullResponse)
    } catch (e) {
      const jsonMatch = fullResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[1]) } catch (e2) { throw new Error('JSON 格式错误（尝试从代码块提取失败）') }
      } else {
        const objMatch = fullResponse.match(/\{[\s\S]*\}/)
        if (objMatch) {
          try { parsed = JSON.parse(objMatch[0]) } catch (e2) { throw new Error('JSON 格式错误（尝试从大括号提取失败）') }
        } else {
          throw new Error('LLM 返回内容不包含 JSON。原始内容：' + fullResponse.substring(0, 300))
        }
      }
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('解析结果不是有效的 JSON 对象')
    }

    const parsedClassNames = Object.keys(parsed)

    document.getElementById('parse_status').textContent = '正在与花名册班级匹配...'

    const matchedClasses = parsedClassNames.filter(cls => excelClassNames.includes(cls))
    const unmatchedFromParsed = parsedClassNames.filter(cls => !excelClassNames.includes(cls))
    const unmatchedFromExcel = excelClassNames.filter(cls => !parsedClassNames.includes(cls))

    const matchedResult = {}
    for (const cls of matchedClasses) {
      matchedResult[cls] = parsed[cls]
    }

    State.unmatchedFromParsed = unmatchedFromParsed
    State.unmatchedFromExcel = unmatchedFromExcel

    if (matchedClasses.length === 0) {
      throw new Error(`未找到匹配的班级。\n\n成绩文本中解析到的班级：${parsedClassNames.join('、') || '无'}\n花名册中的班级：${excelClassNames.join('、')}\n\n请检查班级名称是否一致。`)
    }

    if (State._parseElapsedTimer) {
      clearInterval(State._parseElapsedTimer)
      State._parseElapsedTimer = null
    }

    document.getElementById('parse_status').textContent = '正在处理解析结果...'

    parsed = matchedResult

    State.parsedScores = {}
    State.conflicts = {}
    for (const cls in parsed) {
      State.parsedScores[cls] = {}
      State.conflicts[cls] = {}
      const inner = parsed[cls]
      if (!Array.isArray(inner)) {
        if (typeof inner === 'object' && inner !== null) {
          for (const sid in inner) {
            State.parsedScores[cls][String(sid).trim()] = Number(inner[sid]) || 0
          }
        }
        continue
      }
      const rawMap = {}
      for (const entry of inner) {
        if (!Array.isArray(entry) || entry.length < 2) continue
        const sid = String(entry[0]).trim()
        const score = Number(entry[1])
        if (!isNaN(score)) {
          if (!rawMap[sid]) rawMap[sid] = []
          rawMap[sid].push(score)
        }
      }
      for (const sid in rawMap) {
        const scores = rawMap[sid]
        if (scores.length > 1) {
          const unique = [...new Set(scores)]
          if (unique.length > 1) {
            State.conflicts[cls][sid] = scores
            State.parsedScores[cls][sid] = scores.join('/')
          } else {
            State.parsedScores[cls][sid] = scores[0]
          }
        } else {
          State.parsedScores[cls][sid] = scores[0]
        }
      }
    }

    detectIssues()
    renderParseResults()

    document.getElementById('panel_parse').classList.remove('active')
    goStep(2)
  } catch (err) {
    if (State._parseElapsedTimer) {
      clearInterval(State._parseElapsedTimer)
      State._parseElapsedTimer = null
    }
    alert('✕ 解析失败：' + err.message)
    document.getElementById('panel_parse').classList.remove('active')
    btn.disabled = false
    btn.innerHTML = '🚀 开始解析'
    goStep(1)
  }
}

function detectIssues() {
  State.missing = {}
  State.uploadedFiles.forEach(f => {
    const cls = f.className
    const scores = State.parsedScores[cls] || {}
    const rosterIds = f.data.map(r => String(r[f.idCol])).filter(Boolean)
    State.missing[cls] = rosterIds.filter(id => !(id in scores))
  })
}

function renderParseResults() {
  const el = document.getElementById('parse_results')
  let html = ''

  if (State.unmatchedFromParsed && State.unmatchedFromParsed.length > 0) {
    html += `<div class="alert alert-warning" style="margin-bottom:16px;">
      <strong>⚠️ 注意：</strong>成绩文本中解析到以下班级，但花名册中没有对应的班级：
      <span style="font-weight:bold;">${State.unmatchedFromParsed.join('、')}</span>
    </div>`
  }

  if (State.unmatchedFromExcel && State.unmatchedFromExcel.length > 0) {
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
      const conflictScores = State.conflicts[cls]?.[sid]
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
        const name = f.nameCol >= 0 ? '（不在花名册中）' : ''
        const conflictScores = State.conflicts[cls]?.[sid]
        const isConflict = conflictScores && conflictScores.length > 1
        html += `<tr class="missing-row">
          <td>${sid}</td><td>${name}</td>
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
