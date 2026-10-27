# JSON → Excel

A small React + Vite app that converts an uploaded `.json` file into a
downloadable `.xlsx` workbook, entirely in the browser (no backend, no data
leaves the user's machine).

## Setup

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview   # optional: preview the production build locally
```

The build output goes to `dist/`, which you can deploy to any static host
(Vercel, Netlify, GitHub Pages, S3, etc.).

## How the conversion works

See `src/utils/jsonToSheets.js`:

- **Array of objects** (e.g. `[{...}, {...}]`) → one sheet, one row per object.
- **Object containing arrays of objects** (e.g. `{ users: [...], orders: [...] }`)
  → one sheet per array key, plus a "Summary" sheet for any leftover scalar fields.
- **Plain object** with no tabular arrays → a single-row sheet of its flattened fields.
- **Array of primitives** or a bare primitive value → a simple `index`/`value` sheet.

Nested objects and arrays are flattened into columns using dot and bracket
notation, e.g. `address.city`, `tags[0]`. This keeps the exported spreadsheet
flat and readable in Excel/Google Sheets while still preserving all the data.

The actual `.xlsx` file is generated client-side with
[SheetJS (`xlsx`)](https://www.npmjs.com/package/xlsx).

## Handling large files without freezing the tab

All of the heavy work — reading the file, `JSON.parse`, flattening, and
building the workbook bytes — runs inside a **Web Worker**
(`src/workers/jsonWorker.js`), not on the main UI thread:

1. The `File` object is handed directly to the worker (`file.text()` runs
   there), so the main thread never blocks reading or parsing it.
2. The worker posts `progress` messages (`reading` → `parsing` →
   `flattening`) that drive the spinner and status text in the UI.
3. The worker keeps the flattened sheets in memory and only sends back a
   small preview (first 8 rows per sheet) — the full dataset never has to be
   copied back to the main thread until export.
4. On "Download .xlsx", the worker builds the workbook and writes the binary
   `.xlsx` bytes (`building` → `writing`), then transfers the resulting
   `ArrayBuffer` back to the main thread (a zero-copy transfer, not a clone)
   for the actual download.

`src/utils/excelChunks.js` also guards against Excel's hard row limit: a
single worksheet can't exceed 1,048,576 rows, so any sheet with more rows
than that is automatically split into `SheetName_1`, `SheetName_2`, etc.

### Remaining limits

This is still a fully client-side tool, so it's bounded by the browser tab's
available memory — there's no server to offload to. In practice:

- Multi-hundred-MB JSON files may still be slow or, on memory-constrained
  devices, cause the worker to run out of memory (you'll see an error message
  rather than a silent freeze).
- If you routinely need to convert files in the multi-GB range, a streaming
  JSON parser (reading and flattening record-by-record instead of parsing the
  whole document into memory at once) or a server-side conversion step would
  scale further than an in-browser tool ever can.

## Notes

- Very large or deeply inconsistent JSON files will still convert, but review
  the in-browser preview before downloading — flattening is a best-effort
  mapping from arbitrary JSON to a tabular format.
- If a JSON file fails to parse, the app shows an error instead of a preview.
