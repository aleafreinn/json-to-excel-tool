// Turns arbitrary parsed JSON into a list of { name, rows } sheets,
// where each `rows` entry is a flat object suitable for a spreadsheet row.

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isArrayOfObjects = (value) =>
  Array.isArray(value) && value.length > 0 && value.every(isPlainObject)

// Flattens nested objects/arrays into dot + bracket notation, e.g.
// { user: { name: 'Ada', tags: ['a', 'b'] } } becomes
// { 'user.name': 'Ada', 'user.tags[0]': 'a', 'user.tags[1]': 'b' }
function flattenValue(value, path, out) {
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) {
      out[path] = '{}'
      return
    }
    keys.forEach((key) => {
      const nextPath = path ? `${path}.${key}` : key
      flattenValue(value[key], nextPath, out)
    })
    return
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      out[path] = '[]'
      return
    }
    const allPrimitive = value.every((item) => !isPlainObject(item) && !Array.isArray(item))
    if (allPrimitive) {
      out[path] = value.join(', ')
      return
    }
    value.forEach((item, index) => {
      flattenValue(item, `${path}[${index}]`, out)
    })
    return
  }

  out[path] = value
}

function flattenObject(obj) {
  const out = {}
  Object.keys(obj).forEach((key) => {
    flattenValue(obj[key], key, out)
  })
  return out
}

// Builds a friendly, capitalized sheet name from an object key, trimmed to
// Excel's 31 character sheet-name limit.
function toSheetName(key, fallback) {
  const name = (key || fallback || 'Sheet').toString().slice(0, 31)
  return name.length > 0 ? name : fallback
}

/**
 * @param {*} data - the parsed JSON value (array, object, or primitive)
 * @returns {{ name: string, rows: Record<string, any>[] }[]}
 */
export function jsonToSheets(data) {
  // Top-level array
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return [{ name: 'Sheet1', rows: [] }]
    }
    if (isArrayOfObjects(data)) {
      return [{ name: 'Sheet1', rows: data.map(flattenObject) }]
    }
    // Array of primitives / mixed values
    return [{ name: 'Sheet1', rows: data.map((value, index) => ({ index, value })) }]
  }

  // Top-level object
  if (isPlainObject(data)) {
    const keys = Object.keys(data)
    const arrayKeys = keys.filter((key) => isArrayOfObjects(data[key]))
    const remainingKeys = keys.filter((key) => !arrayKeys.includes(key))

    const sheets = arrayKeys.map((key) => ({
      name: toSheetName(key),
      rows: data[key].map(flattenObject),
    }))

    if (arrayKeys.length === 0) {
      // No tabular arrays anywhere: treat the whole object as one row.
      return [{ name: 'Sheet1', rows: [flattenObject(data)] }]
    }

    if (remainingKeys.length > 0) {
      const summary = {}
      remainingKeys.forEach((key) => {
        flattenValue(data[key], key, summary)
      })
      sheets.push({ name: toSheetName('Summary'), rows: [summary] })
    }

    return sheets
  }

  // Top-level primitive
  return [{ name: 'Sheet1', rows: [{ value: data }] }]
}
