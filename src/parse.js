import { callLLM } from './llm.js'
import { showParseProgress, hideParseProgress, updateParseStatus, updateStreamBox, updateTokenCount, resetParseButton, renderParseResults, goStep } from './ui.js'

export function detectIssues() {
  const state = window.State
  state.missing = {}
  state.uploadedFiles.forEach(f => {
    const cls = f.className
    const scores = state.parsedScores[cls] || {}
    const rosterIds = f.data.map(r => String(r[f.idCol])).filter(Boolean)
    state.missing[cls] = rosterIds.filter(id => !(id in scores))
  })
}

export async function doParse() {
  const state = window.State
  state.scoreText = document.getElementById('score_text').value.trim()
  if (!state.scoreText) { alert('请先粘贴成绩文本'); return }
  if (!state.uploadedFiles.length) { alert('请先上传花名册'); return }

  const btn = document.getElementById('btn_parse')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> 解析中...'

  showParseProgress()
  let elapsedSec = 0
  state._parseElapsedTimer = setInterval(() => {
    elapsedSec++
    updateParseElapsed(elapsedSec)
  }, 1000)

  try {
    const classNames = state.uploadedFiles.map(f => f.className)
    const prompt = `你是一个成绩解析专家。请严格按以下要求提取每位学生的学号和分数。

成绩文本：
${state.scoreText}

班级名称列表（严格按这些名称输出）：${classNames.join('、')}

## 输出格式
只输出一个纯粹的 JSON 对象，不要任何 markdown、注释或其他文字。key 为班级名称，value 为学号-分数对的**数组**（保留所有出现，不要合并去重）。示例：
{"一班":[["1",5],["2",8]],"二班":[["12",6],["12",0]]}

要求：
- 每个出现的学号和分数都作为独立条目输出，不要合并去重
- 学号用数字字符串
- 分数用整数
- 中文数字（一、二、两、三、十二等）转为阿拉伯数字
- 班级名严格匹配给定的列表`
    updateParseStatus('LLM 正在生成回答...')

    let fullResponse = ''
    const streamBox = document.getElementById('stream_box')

    fullResponse = await callLLM(prompt, true, (chunk, accumulated) => {
      updateStreamBox(accumulated)
      updateTokenCount(accumulated.length)
    })

    updateParseStatus('正在解析结果...')

    if (state._parseElapsedTimer) {
      clearInterval(state._parseElapsedTimer)
      state._parseElapsedTimer = null
    }

    let parsed
    try {
      parsed = JSON.parse(fullResponse)
    } catch(e) {
      const jsonMatch = fullResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[1]) } catch(e2) { throw new Error('JSON 格式错误（尝试从代码块提取失败）') }
      } else {
        const objMatch = fullResponse.match(/\{[\s\S]*\}/)
        if (objMatch) {
          try { parsed = JSON.parse(objMatch[0]) } catch(e2) { throw new Error('JSON 格式错误（尝试从大括号提取失败）') }
        } else {
          throw new Error('LLM 返回内容不包含 JSON。原始内容：' + fullResponse.substring(0, 300))
        }
      }
    }

    if (typeof parsed !== 'object' || parsed === null) throw new Error('解析结果不是有效的 JSON 对象')

    const matchedClasses = Object.keys(parsed).filter(k => classNames.includes(k))
    if (matchedClasses.length === 0) {
      const fuzzyHint = classNames.map(cn => `${cn}`).join(', ')
      throw new Error(`LLM 返回的班级名与花名册不匹配。花名册班级：${fuzzyHint}，LLM 返回了：${Object.keys(parsed).join(', ')}`)
    }

    state.parsedScores = {}
    state.conflicts = {}
    for (const cls in parsed) {
      state.parsedScores[cls] = {}
      state.conflicts[cls] = {}
      const inner = parsed[cls]
      if (!Array.isArray(inner)) {
        if (typeof inner === 'object' && inner !== null) {
          for (const sid in inner) {
            state.parsedScores[cls][String(sid).trim()] = Number(inner[sid]) || 0
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
            state.conflicts[cls][sid] = scores
            state.parsedScores[cls][sid] = scores.join('/')
          } else {
            state.parsedScores[cls][sid] = scores[0]
          }
        } else {
          state.parsedScores[cls][sid] = scores[0]
        }
      }
    }

    detectIssues()
    renderParseResults()

    hideParseProgress()
    goStep(2)
  } catch(err) {
    if (state._parseElapsedTimer) {
      clearInterval(state._parseElapsedTimer)
      state._parseElapsedTimer = null
    }
    alert('✕ 解析失败：' + err.message)
    hideParseProgress()
    btn.disabled = false
    btn.innerHTML = '🚀 开始解析'
    goStep(1)
  }
}

function updateParseElapsed(secs) {
  document.getElementById('parse_elapsed').textContent = '⏱ ' + secs + 's'
}

window.doParse = doParse
