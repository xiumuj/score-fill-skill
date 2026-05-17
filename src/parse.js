import { State } from './state.js'
import { callLLM } from './chat.js'
import { goStep } from './ui.js'
import { detectIssues, renderParseResults } from './render.js'

function tryParseJSON(text) {
  try {
    return JSON.parse(text)
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]) } catch { /* fall through */ }
    }
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) } catch { /* fall through */ }
    }
    return null
  }
}

function normalizeScoreData(parsed) {
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
      if (isNaN(score)) continue
      if (!rawMap[sid]) rawMap[sid] = []
      rawMap[sid].push(score)
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
}

function enterParseProgress() {
  document.getElementById('panel1').classList.remove('active')
  document.getElementById('panel_parse').classList.add('active')
  document.getElementById('parse_status').textContent = '正在请求 LLM...'
  document.getElementById('stream_box').innerHTML = '<span class="cursor"></span>'
  document.getElementById('parse_elapsed').textContent = '⏱ 0s'
  document.getElementById('token_count').textContent = '已接收 0 字符'

  let elapsedSec = 0
  State._parseElapsedTimer = setInterval(() => {
    document.getElementById('parse_elapsed').textContent = '⏱ ' + (++elapsedSec) + 's'
  }, 1000)
}

function exitParseProgress() {
  if (State._parseElapsedTimer) {
    clearInterval(State._parseElapsedTimer)
    State._parseElapsedTimer = null
  }
}

function buildExtractPrompt(scoreText, classNames) {
  return `你是一个成绩解析专家。请从以下成绩文本中提取所有班级、学号和分数信息。

## 成绩文本
${scoreText}

## 花名册班级
以下为本次需要关注的班级：${classNames.join('、')}

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
}

function matchClasses(parsedClassNames, excelClassNames) {
  const matched = parsedClassNames.filter(cls => excelClassNames.includes(cls))
  return {
    matched,
    unmatchedFromParsed: parsedClassNames.filter(cls => !excelClassNames.includes(cls)),
    unmatchedFromExcel: excelClassNames.filter(cls => !parsedClassNames.includes(cls)),
  }
}

export async function doParse() {
  State.scoreText = document.getElementById('score_text').value.trim()
  if (!State.scoreText) { alert('请先粘贴成绩文本'); return }
  if (!State.uploadedFiles.length) { alert('请先上传花名册'); return }

  const btn = document.getElementById('btn_parse')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> 解析中...'

  const excelClassNames = State.uploadedFiles.map(f => f.className)
  enterParseProgress()

  try {
    document.getElementById('parse_status').textContent = 'LLM 正在解析成绩文本...'
    const streamBox = document.getElementById('stream_box')

    const fullResponse = await callLLM(
      buildExtractPrompt(State.scoreText, excelClassNames),
      true,
      (chunk, accumulated) => {
        const escaped = accumulated
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        streamBox.innerHTML = escaped + '<span class="cursor"></span>'
        streamBox.scrollTop = streamBox.scrollHeight
        document.getElementById('token_count').textContent = '已接收 ' + accumulated.length + ' 字符'
      }
    )

    const parsed = tryParseJSON(fullResponse)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('LLM 返回内容不包含有效 JSON。原始内容：' + fullResponse.substring(0, 300))
    }

    document.getElementById('parse_status').textContent = '正在与花名册班级匹配...'

    const { matched: matchedClasses, unmatchedFromParsed, unmatchedFromExcel } = matchClasses(
      Object.keys(parsed), excelClassNames
    )

    State.unmatchedFromParsed = unmatchedFromParsed
    State.unmatchedFromExcel = unmatchedFromExcel

    if (!matchedClasses.length) {
      throw new Error(`未找到匹配的班级。\n\n成绩文本中解析到的班级：${Object.keys(parsed).join('、') || '无'}\n花名册中的班级：${excelClassNames.join('、')}\n\n请检查班级名称是否一致。`)
    }

    exitParseProgress()
    document.getElementById('parse_status').textContent = '正在处理解析结果...'

    const matchedResult = {}
    for (const cls of matchedClasses) {
      matchedResult[cls] = parsed[cls]
    }
    normalizeScoreData(matchedResult)
    detectIssues()
    renderParseResults()

    document.getElementById('panel_parse').classList.remove('active')
    goStep(2)
  } catch (err) {
    exitParseProgress()
    alert('✕ 解析失败：' + err.message)
    document.getElementById('panel_parse').classList.remove('active')
    btn.disabled = false
    btn.innerHTML = '🚀 开始解析'
    goStep(1)
  }
}
