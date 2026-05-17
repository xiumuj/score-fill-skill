export function goStep(n) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'))

  const targetPanel = document.getElementById('panel' + n)
  if (targetPanel) targetPanel.classList.add('active')

  for (let i = 1; i <= 3; i++) {
    const circle = document.getElementById('sc' + i)
    const label = document.getElementById('sl' + i)
    if (!circle || !label) continue
    circle.classList.remove('active', 'done')
    label.classList.remove('active')
    if (i < n) { circle.classList.add('done') }
    else if (i === n) { circle.classList.add('active'); label.classList.add('active') }
  }

  for (let i = 1; i <= 2; i++) {
    const line = document.getElementById('line' + i)
    if (line) line.classList.toggle('done', i < n)
  }

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export function showMsg(id, text, type) {
  const cls = { info: 'msg-info', success: 'msg-success', warning: 'msg-warning', error: 'msg-error' }
  document.getElementById(id).innerHTML = '<div class="msg ' + (cls[type] || 'msg-info') + '">' + text + '</div>'
}

export function toggleSection(header) {
  const body = header.nextElementSibling
  const arrow = header.querySelector('.arrow')
  body.classList.toggle('collapsed')
  arrow.classList.toggle('collapsed')
}
