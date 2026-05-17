import { State } from './state.js'
import { goStep } from './ui.js'

export function cancelParse() {
  if (State._abortController) {
    State._abortController.abort()
    State._abortController = null
  }
  if (State._parseElapsedTimer) {
    clearInterval(State._parseElapsedTimer)
    State._parseElapsedTimer = null
  }
  const btn = document.getElementById('btn_parse')
  btn.disabled = false
  btn.innerHTML = '🚀 开始解析'
  goStep(1)
}
