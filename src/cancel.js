import { goStep, resetParseButton } from './ui.js'

export function cancelParse() {
  const state = window.State
  if (state._abortController) {
    state._abortController.abort()
    state._abortController = null
  }
  if (state._parseElapsedTimer) {
    clearInterval(state._parseElapsedTimer)
    state._parseElapsedTimer = null
  }
  goStep(1)
}

window.cancelParse = cancelParse
