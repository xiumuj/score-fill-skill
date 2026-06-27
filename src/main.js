import './style.css'
import { setupDrop, removeFile } from './upload.js'
import { doParse } from './parse.js'
import { cancelParse } from './cancelParse.js'
import { goStep, toggleSection } from './ui.js'
import { doFill, downloadOne, downloadAllZip } from './export.js'

window.removeFile = removeFile
window.doParse = doParse
window.cancelParse = cancelParse
window.goStep = goStep
window.toggleSection = toggleSection
window.doFill = doFill
window.downloadOne = downloadOne
window.downloadAllZip = downloadAllZip

setupDrop()

document.getElementById('btn_parse').addEventListener('click', doParse)
document.getElementById('btn_cancel_parse').addEventListener('click', cancelParse)
document.getElementById('btn_back_to_step1').addEventListener('click', () => goStep(1))
document.getElementById('btn_confirm_fill').addEventListener('click', doFill)
document.getElementById('btn_download_zip').addEventListener('click', downloadAllZip)
document.getElementById('btn_back_to_step2').addEventListener('click', () => goStep(2))
