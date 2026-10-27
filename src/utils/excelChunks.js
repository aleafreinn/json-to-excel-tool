// Excel/xlsx sheets top out at 1,048,576 rows, including the header row.
export const EXCEL_MAX_ROWS = 1048576
const MAX_DATA_ROWS = EXCEL_MAX_ROWS - 1

// Splits a sheet into multiple { name, rows } chunks if it has more rows
// than a single Excel sheet can hold. Leaves it untouched otherwise.
export function splitSheetForExcel(sheet) {
  if (sheet.rows.length <= MAX_DATA_ROWS) return [sheet]

  const chunks = []
  for (let start = 0; start < sheet.rows.length; start += MAX_DATA_ROWS) {
    const part = chunks.length + 1
    const suffix = `_${part}`
    const baseName = sheet.name.slice(0, 31 - suffix.length)
    chunks.push({
      name: `${baseName}${suffix}`,
      rows: sheet.rows.slice(start, start + MAX_DATA_ROWS),
    })
  }
  return chunks
}
