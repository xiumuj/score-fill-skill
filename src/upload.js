import * as XLSX from 'xlsx'
import { State } from './state.js'

export function setupDrop() {
  const zone = document.getElementById('drop_zone')
  const input = document.getElementById('file_input')
  zone.addEventListener('click', () => input.click())
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover') })
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleFiles(e.dataTransfer.files) })
  input.addEventListener('change', () => handleFiles(input.files))
}

export function handleFiles(fileList) {
  for (const file of fileList) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        if (raw.length < 3) { alert(file.name + '：数据不足，至少需要3行（标题+表头+数据）'); return }

        const className = String(raw[0][0] || '').replace(/花名册.*/, '').trim() || file.name.replace(/\.\w+$/, '')
        const headerRow = raw[1].map(h => String(h).trim())
        const dataRows = raw.slice(2).filter(r => r.some(c => c !== ''))

        const idCol = headerRow.findIndex(h => /学号|编号|号|序号/.test(h))
        const nameCol = headerRow.findIndex(h => /姓名|名字/.test(h))
        if (idCol === -1) { alert(file.name + '：未找到"学号"列，请检查表头'); return }

        const validCols = []
        const validHeaders = []
        headerRow.forEach((h, i) => {
          if (h) { validCols.push(i); validHeaders.push(h) }
        })
        const scoreColName = '成绩'
        if (!validHeaders.includes(scoreColName)) { validCols.push(-1); validHeaders.push(scoreColName) }

        const records = dataRows.map(row => {
          const obj = {}
          validHeaders.forEach((h, vi) => {
            const ci = validCols[vi]
            obj[h] = ci === -1 ? '' : (row[ci] !== undefined ? row[ci] : '')
          })
          return obj
        })

        State.uploadedFiles.push({ name: file.name, className, headers: validHeaders, data: records, idCol: headerRow[idCol], nameCol })
        renderFileList()
      } catch (err) { alert('读取 ' + file.name + ' 失败：' + err.message) }
    }
    reader.readAsArrayBuffer(file)
  }
}

export function renderFileList() {
  const el = document.getElementById('file_list')
  el.innerHTML = State.uploadedFiles.map((f, i) => `
    <div class="file-item">
      <span class="name">📄 ${f.name}</span>
      <span class="meta">${f.className} · ${f.data.length}条记录</span>
      <span class="remove" onclick="removeFile(${i})">✕ 移除</span>
    </div>
  `).join('')
}

export function removeFile(idx) {
  State.uploadedFiles.splice(idx, 1)
  renderFileList()
}
