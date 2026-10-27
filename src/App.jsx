import { useCallback, useEffect, useRef, useState } from 'react'

const LARGE_FILE_WARN_BYTES = 50 * 1024 * 1024 // 50MB

const STAGE_LABELS = {
  reading: 'Reading file…',
  parsing: 'Parsing JSON…',
  flattening: 'Flattening records…',
  building: 'Building workbook…',
  writing: 'Writing .xlsx bytes…',
}

function outputName(sourceName) {
  const base = sourceName.replace(/\.json$/i, '') || 'data'
  return `${base}.xlsx`
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function App() {
  const [fileName, setFileName] = useState(null)
  const [fileSize, setFileSize] = useState(0)
  const [preview, setPreview] = useState(null) // [{ name, rowCount, columns, previewRows }]
  const [activeSheet, setActiveSheet] = useState(0)
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [stage, setStage] = useState(null) // null | 'reading' | 'parsing' | 'flattening' | 'building' | 'writing'
  const inputRef = useRef(null)
  const workerRef = useRef(null)

  // Spin up one worker for the lifetime of the app; tear it down on unmount.
  useEffect(() => {
    const worker = new Worker(new URL('./workers/jsonWorker.js', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (event) => {
      const { type } = event.data
      if (type === 'progress') {
        setStage(event.data.stage)
      } else if (type === 'processed') {
        setPreview(event.data.preview)
        setActiveSheet(0)
        setStage(null)
      } else if (type === 'exported') {
        const { buffer, fileName: outName } = event.data
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = outName
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        setStage(null)
      } else if (type === 'error') {
        setError(event.data.message)
        setPreview(null)
        setStage(null)
      }
    }

    worker.onerror = (event) => {
      setError(
        `Processing failed: ${event.message || 'the worker crashed, likely from running out of memory on this file.'}`,
      )
      setPreview(null)
      setStage(null)
    }

    return () => worker.terminate()
  }, [])

  const processFile = useCallback((file) => {
    setError(null)
    setPreview(null)

    if (!file) return

    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      setError(`"${file.name}" isn't a .json file. Choose a JSON file to continue.`)
      return
    }

    setFileName(file.name)
    setFileSize(file.size)
    setStage('reading')
    // The File object itself is handed to the worker — it reads, parses,
    // and flattens there, so none of that blocks this tab's UI thread.
    workerRef.current.postMessage({ type: 'process', file })
  }, [])

  const handleInputChange = (event) => {
    const file = event.target.files?.[0]
    processFile(file)
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    processFile(file)
  }

  const handleDownload = () => {
    if (!preview) return
    setStage('building')
    workerRef.current.postMessage({
      type: 'export',
      fileName: outputName(fileName || 'data.json'),
    })
  }

  const reset = () => {
    setFileName(null)
    setFileSize(0)
    setPreview(null)
    setError(null)
    setActiveSheet(0)
    setStage(null)
  }

  const isBusy = stage !== null
  const current = preview?.[activeSheet]
  const isLargeFile = fileSize > LARGE_FILE_WARN_BYTES

  return (
    <div className="page">
      <header className="masthead">
        <span className="mark">JSON / XLSX</span>
        <h1>Turn a JSON file into a spreadsheet</h1>
        <p className="lede">
          Drop in a JSON file. Arrays of records become rows, nested fields get
          flattened into columns, and the result downloads as a real .xlsx
          workbook — parsed and built in a background thread, so the tab never
          locks up.
        </p>
      </header>

      <section
        className={`dropzone ${isDragging ? 'is-dragging' : ''} ${isBusy ? 'is-busy' : ''}`}
        onDragOver={(e) => {
          if (isBusy) return
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (isBusy) {
            e.preventDefault()
            return
          }
          handleDrop(e)
        }}
        onClick={() => !isBusy && inputRef.current?.click()}
        role="button"
        aria-disabled={isBusy}
        tabIndex={isBusy ? -1 : 0}
        onKeyDown={(e) => {
          if (isBusy) return
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleInputChange}
          hidden
          disabled={isBusy}
        />
        <div className="dropzone-grid" aria-hidden="true" />

        {isBusy ? (
          <div className="dropzone-content">
            <span className="spinner" aria-hidden="true" />
            <span className="dropzone-verb">{STAGE_LABELS[stage] || 'Working…'}</span>
            <span className="dropzone-hint">
              {fileName} · {formatBytes(fileSize)}
            </span>
          </div>
        ) : (
          <div className="dropzone-content">
            <span className="dropzone-verb">Drop file or click to browse</span>
            <span className="dropzone-hint">.json — parsed entirely in your browser</span>
          </div>
        )}
      </section>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}

      {!error && isLargeFile && (isBusy || preview) && (
        <div className="notice notice-info">
          {formatBytes(fileSize)} is a large file — this runs entirely in your
          browser, so processing time and memory use depend on your device.
        </div>
      )}

      {preview && !isBusy && (
        <section className="result">
          <div className="result-header">
            <div>
              <span className="result-label">Loaded</span>
              <span className="result-filename">
                {fileName} · {formatBytes(fileSize)}
              </span>
            </div>
            <div className="result-actions">
              <button className="btn btn-ghost" onClick={reset} type="button">
                Start over
              </button>
              <button className="btn btn-primary" onClick={handleDownload} type="button">
                Download .xlsx
              </button>
            </div>
          </div>

          {preview.length > 1 && (
            <div className="tabs" role="tablist">
              {preview.map((sheet, index) => (
                <button
                  key={sheet.name + index}
                  role="tab"
                  aria-selected={index === activeSheet}
                  className={`tab ${index === activeSheet ? 'is-active' : ''}`}
                  onClick={() => setActiveSheet(index)}
                  type="button"
                >
                  {sheet.name}
                  <span className="tab-count">{sheet.rowCount}</span>
                </button>
              ))}
            </div>
          )}

          <div className="table-wrap">
            {current.columns.length === 0 ? (
              <p className="empty-note">This sheet has no rows to preview.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    {current.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {current.columns.map((col) => (
                        <td key={col}>{formatCell(row[col])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {current.rowCount > current.previewRows.length && (
            <p className="table-footnote">
              Showing {current.previewRows.length} of {current.rowCount} rows.
              The full sheet is in the download
              {current.rowCount > 1048575 ? ' (split across multiple sheets — Excel caps sheets at 1,048,576 rows)' : ''}.
            </p>
          )}
        </section>
      )}
    </div>
  )
}

function formatCell(value) {
  if (value === undefined) return ''
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
