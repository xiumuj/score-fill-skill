import { renderExportList, goStep } from './ui.js'

export function doFill() {
  const state = window.State

  document.querySelectorAll('.score-input').forEach(input => {
    const cls = input.dataset.cls
    const sid = input.dataset.sid
    const val = input.value.trim()
    if (!state.parsedScores[cls]) state.parsedScores[cls] = {}
    if (val !== '') {
      state.parsedScores[cls][sid] = val.includes('/') ? val : Number(val)
    } else {
      delete state.parsedScores[cls][sid]
    }
  })

  state.filledWorkbooks = {}

  state.uploadedFiles.forEach(f => {
    const cls = f.className
    const scores = state.parsedScores[cls] || {}
    const scoreColName = '成绩'

    const headers = [...f.headers]
    const rows = f.data.map(row => {
      const sid = String(row[f.idCol] || '')
      return headers.map(h => (h === scoreColName) ? (scores[sid] !== undefined ? scores[sid] : '') : (row[h] !== undefined ? row[h] : ''))
    })

    const wsData = [[cls], headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = headers.map((h, i) => ({ wch: h === scoreColName ? 8 : (i === 0 ? 8 : 12) }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    state.filledWorkbooks[cls] = wb
  })

  renderExportList()
  goStep(3)
}

export function downloadOne(cls) {
  const state = window.State
  const wb = state.filledWorkbooks[cls]
  if (!wb) return
  const f = state.uploadedFiles.find(f => f.className === cls)
  const fileName = (f ? f.name.replace(/\.\w+$/, '') : cls) + '_已填成绩.xlsx'
  XLSX.writeFile(wb, fileName)
}

export async function downloadAllZip() {
  const state = window.State
  if (typeof JSZip === 'undefined') { alert('JSZip 库未加载，请刷新页面'); return }
  const zip = new JSZip()
  for (const cls in state.filledWorkbooks) {
    const wb = state.filledWorkbooks[cls]
    const f = state.uploadedFiles.find(f => f.className === cls)
    const fileName = (f ? f.name.replace(/\.\w+$/, '') : cls) + '_已填成绩.xlsx'
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    zip.file(fileName, wbOut)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = '成绩填写结果.zip'; a.click()
  URL.revokeObjectURL(url)
}

window.doFill = doFill
window.downloadOne = downloadOne
window.downloadAllZip = downloadAllZip
