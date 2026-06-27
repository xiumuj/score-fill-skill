import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { State } from './state.js'
import { goStep } from './ui.js'

function getFileName(cls) {
  const f = State.uploadedFiles.find(f => f.className === cls)
  return (f ? f.name.replace(/\.\w+$/, '') : cls) + '_已填成绩.xlsx'
}

export function doFill() {
  document.querySelectorAll('.score-input').forEach(input => {
    const cls = input.dataset.cls
    const sid = input.dataset.sid
    const val = input.value.trim()
    if (!State.parsedScores[cls]) State.parsedScores[cls] = {}
    if (val !== '') {
      State.parsedScores[cls][sid] = val.includes('/') ? val : Number(val)
    } else {
      delete State.parsedScores[cls][sid]
    }
  })

  State.filledWorkbooks = {}

  const scoreColName = '成绩'
  State.uploadedFiles.forEach(f => {
    const cls = f.className
    const scores = State.parsedScores[cls] || {}

    const headers = [...f.headers]
    const rows = f.data.map(row => {
      const sid = String(row[f.idCol] || '')
      return headers.map(h =>
        h === scoreColName ? (scores[sid] !== undefined ? scores[sid] : '') : (row[h] !== undefined ? row[h] : '')
      )
    })

    const ws = XLSX.utils.aoa_to_sheet([[cls], headers, ...rows])
    ws['!cols'] = headers.map((h, i) => ({ wch: h === scoreColName ? 8 : (i === 0 ? 8 : 12) }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    State.filledWorkbooks[cls] = wb
  })

  renderExportList()
  goStep(3)
}

function renderExportList() {
  const el = document.getElementById('export_list')
  el.innerHTML = Object.keys(State.filledWorkbooks).map(cls => `
    <div class="file-item" data-cls="${cls}">
      <span class="name">📊 ${getFileName(cls)}</span>
      <span class="meta">${cls}</span>
      <button class="btn btn-sm btn-outline btn-download-one">⬇ 下载</button>
    </div>
  `).join('')

  el.querySelectorAll('.btn-download-one').forEach((btn, i) => {
    const cls = Object.keys(State.filledWorkbooks)[i]
    btn.addEventListener('click', () => downloadOne(cls))
  })
}

export function downloadOne(cls) {
  const wb = State.filledWorkbooks[cls]
  if (!wb) return
  XLSX.writeFile(wb, getFileName(cls))
}

export async function downloadAllZip() {
  const zip = new JSZip()
  for (const cls in State.filledWorkbooks) {
    const wb = State.filledWorkbooks[cls]
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    zip.file(getFileName(cls), wbOut)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = '成绩填写结果.zip'; a.click()
  URL.revokeObjectURL(url)
}
