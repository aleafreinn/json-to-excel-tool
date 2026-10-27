import * as XLSX from 'xlsx'
import { jsonToSheets } from '../utils/jsonToSheets'
import { splitSheetForExcel } from '../utils/excelChunks'

const PREVIEW_ROW_LIMIT = 8

// Sheets from the most recently processed file, kept in the worker so
// "export" doesn't have to re-parse/re-flatten the source file again.
let currentSheets = null

function post(type, payload, transfer) {
  self.postMessage({ type, ...payload }, transfer || [])
}

async function handleProcess(file) {
  try {
    post('progress', { stage: 'reading' })
    const text = await file.text()

    post('progress', { stage: 'parsing' })
    const data = JSON.parse(text)

    post('progress', { stage: 'flattening' })
    const sheets = jsonToSheets(data)
    currentSheets = sheets

    const preview = sheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rows.length,
      columns: sheet.rows.length ? Object.keys(sheet.rows[0]) : [],
      previewRows: sheet.rows.slice(0, PREVIEW_ROW_LIMIT),
    }))

    post('processed', { preview })
  } catch (err) {
    currentSheets = null
    post('error', { message: err.message || String(err) })
  }
}

function handleExport(fileName) {
  if (!currentSheets) {
    post('error', { message: 'No processed data to export. Upload a file first.' })
    return
  }

  try {
    post('progress', { stage: 'building' })
    const workbook = XLSX.utils.book_new()
    let sheetCount = 0

    currentSheets.forEach((sheet) => {
      splitSheetForExcel(sheet).forEach((chunk) => {
        sheetCount += 1
        const worksheet = XLSX.utils.json_to_sheet(chunk.rows)
        XLSX.utils.book_append_sheet(workbook, worksheet, chunk.name)
      })
    })

    post('progress', { stage: 'writing' })
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })

    post('exported', { buffer, fileName, sheetCount }, [buffer])
  } catch (err) {
    post('error', { message: err.message || String(err) })
  }
}

self.onmessage = (event) => {
  const { type } = event.data
  if (type === 'process') {
    handleProcess(event.data.file)
  } else if (type === 'export') {
    handleExport(event.data.fileName)
  }
}
