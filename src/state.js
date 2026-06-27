const state = {
  step: 1,
  scoreText: '',
  uploadedFiles: [],
  parsedScores: {},
  conflicts: {},
  missing: {},
  filledWorkbooks: {},
  _abortController: null,
  _parseElapsedTimer: null
}

export { state }
window.State = state
