# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bat
start.bat          # launches server.py and opens the browser automatically
python server.py   # equivalent, if you prefer running it directly
```

The app runs at `http://localhost:5000`. Opening `index.html` directly in a browser also works — it falls back to `localStorage` when the server isn't reachable.

## Architecture

This is a single-page expense-splitting calculator with no build step and no dependencies beyond Python's standard library.

**`server.py`** — minimal HTTP server (stdlib only). Serves `index.html` on `GET /` and exposes two API routes:
- `GET /api/data` → assembles the full payload from `data/` (settings + all per-month files)
- `POST /api/data` → splits the payload and writes per-month files atomically to `data/`

All writes use a `.tmp` + `os.replace()` pattern to prevent corruption on crash.

**`index.html`** — the entire frontend: HTML, CSS, and JS in one file. No framework, no bundler. Key JS sections:
- **Storage layer** (`initStorage`, `saveAll`) — on load, tries `fetch('/api/data')` with a 600ms timeout; if that fails, falls back to `localStorage`. Every save writes to both the server file and `localStorage` as a mirror.
- **Data model** — one global object `allData` keyed by `"YYYY-MM"` strings. Each entry: `{ accounts: [...], mortgage, periodFrom, periodTo }`. Global settings (`currency`, `mortgage`, `recurringCosts`, `accountTemplates`) are loaded from `data/_settings.json` and act as defaults for new months.
- **Render functions** — `renderList()`, `renderSummary()`, `renderRecords()` are called explicitly after any state change; there is no reactive/virtual-DOM layer.

**`data/` directory** — the persistent store (gitignored). Two file types:
- `data/_settings.json` — global settings: `{ currency, mortgage, recurringCosts, accountTemplates }`
- `data/YYYY-MM_YYYYMMDD_HHMMSS.json` — one timestamped file per month; old files for the same month are deleted atomically on each save

On first run, if the legacy `data.json` exists and `data/` does not, `server.py` migrates automatically and renames `data.json` → `data.json.bak`.

## Data model

Each month file (e.g. `data/2026-05_20260502_120000.json`):
```json
{
  "accounts": [
    { "id": 1744000000000, "name": "Santander", "expenses": [{ "id": 1744000000001, "name": "Groceries", "amount": 45.00 }] }
  ],
  "mortgage": 800,
  "periodFrom": "2026-05-01",
  "periodTo": "2026-05-31"
}
```

- `expense.name` is optional — empty string is valid, rendered as `#1`, `#2`, … in the UI.
- `ensureMonthData()` handles lazy initialisation and migration from the old flat `expenses` array format.
- `getAllExpenses()` flattens all accounts' expenses into one array for summary calculations.

## Period date logic

`defaultPeriod(y, m)` in JS: if the previous month has a `periodTo` date, the new month's `periodFrom` = `periodTo + 1 day` and `periodTo` = one calendar month later. Falls back to first/last day of the calendar month if no previous period exists.

## Split calculation

```
total = sum of all expenses across all accounts
mort  = monthly mortgage contribution
half  = total / 2
owes  = half + mort
```

Mortgage is stored per-month so historical records remain accurate when the mortgage changes. The global `mortgage` variable is the default for new months.

## Tabs

- **Calculator** — shared expenses grouped by account + mortgage input + live summary
- **My Costs** — personal recurring and one-off costs (not included in the shared split)
- **Records** — historical table of all months; click a row to navigate to that month
- **Settings** — recurring cost templates, account name templates, default currency
