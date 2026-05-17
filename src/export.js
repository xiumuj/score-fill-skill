import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { State } from './state.js'
import { goStep } from './ui.js'

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

  State.uploadedFiles.forEach(f => {
    const cls = f.className
    const scores = State.parsedScores[cls] || {}
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
    State.filledWorkbooks[cls] = wb
  })

  renderExportList()
  goStep(3)
}

function renderExportList() {
  const el = document.getElementById('export_list')
  let html = ''
  for (const cls in State.filledWorkbooks) {
    const f = State.uploadedFiles.find(f => f.className === cls)
    const fileName = (f ? f.name.replace(/\.\w+$/, '') : cls) + '_已填成绩.xlsx'
    html += `<div class="file-item">
      <span class="name">📊 ${fileName}</span>
      <span class="meta">${cls}</span>
      <button class="btn btn-sm btn-outline" onclick="downloadOne('${cls}')">⬇ 下载</button>
    </div>`
  }
  el.innerHTML = html
}

export function downloadOne(cls) {
  const wb = State.filledWorkbooks[cls]
  if (!wb) return
  const f = State.uploadedFiles.find(f => f.className === cls)
  const fileName = (f ? f.name.replace(/\.\w+$/, '') : cls) + '_已填成绩.xlsx'
  XLSX.writeFile(wb, fileName)
}

export async function downloadAllZip() {
  const zip = new JSZip()
  for (const cls in State.filledWorkbooks) {
    const wb = State.filledWorkbooks[cls]
    const f = State.uploadedFiles.find(f => f.className === cls)
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
