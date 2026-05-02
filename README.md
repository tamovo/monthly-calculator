# Monthly Cost Calculator

A lightweight, single-page expense-splitting calculator for two people sharing a home. No framework, no build step, no external dependencies — just Python's standard library and a single HTML file.

## Features

- **Multi-account shared expenses** — group expenses by bank account (colour-coded), with per-account subtotals
- **Mortgage split** — a configurable monthly mortgage contribution added on top of the shared-expense split
- **My Costs tab** — track your own recurring and one-off personal costs, separate from the shared pool
- **Records tab** — historical table of every month's totals; click any row to jump back to that month
- **Settings tab** — recurring cost templates, account name templates, default currency
- **Offline-capable** — falls back to `localStorage` automatically when the server isn't running; data is mirrored to both storages on every save
- **JSON backup / restore** — export or import the entire dataset from the Records tab
- **Split formula**: `your total = (shared expenses ÷ 2) + mortgage`

## Quick start

**Requirements:** Python 3.x (standard library only — no `pip install` needed)

```bat
start.bat          # Windows: launches the server and opens the browser
python server.py   # or run directly
```

The app is served at `http://localhost:5000`.  
Opening `index.html` directly in a browser also works — it falls back to `localStorage` when the server is unreachable.

## Architecture

```
Monthly calculator/
├── server.py       # Minimal HTTP server (Python stdlib)
├── index.html      # Entire frontend: HTML + CSS + JS in one file
├── start.bat       # Windows launcher
└── data/           # Runtime data (gitignored)
    ├── _settings.json           # Global settings (currency, mortgage, templates)
    └── YYYY-MM_YYYYMMDD_HHMMSS.json  # One file per month
```

### `server.py`

Serves `index.html` on `GET /` and exposes two API endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/data` | Assembles and returns the full payload from `data/` |
| `POST` | `/api/data` | Splits the payload and writes per-month files atomically |

On first run after the old format is detected, `server.py` migrates `data.json` → `data/` automatically (keeping `data.json.bak` as a safety copy).

### `index.html` — frontend

No framework, no bundler. Three render functions (`renderList`, `renderSummary`, `renderRecords`) are called explicitly after every state change.

**Storage layer** (`initStorage` / `saveAll`): on page load, attempts `fetch('/api/data')` with a 600 ms timeout. On failure, falls back to `localStorage`. Every save writes to both the server file and `localStorage` as a mirror.

**Data model** — one global object `allData` keyed by `"YYYY-MM"` strings:

```json
{
  "2026-05": {
    "accounts": [
      {
        "id": 1744000000000,
        "name": "Santander",
        "expenses": [
          { "id": 1744000000001, "name": "Groceries", "amount": 45.00 }
        ]
      }
    ],
    "mortgage": 800,
    "periodFrom": "2026-05-01",
    "periodTo":   "2026-05-31"
  }
}
```

Global settings (`currency`, `mortgage`, `recurringCosts`, `accountTemplates`) are stored separately in `data/_settings.json` and act as defaults for new months.

### Period date logic

`defaultPeriod(y, m)` in JS: if the previous month has a `periodTo` date, the new month's `periodFrom` = `periodTo + 1 day` and `periodTo` = one calendar month later. Falls back to the first/last day of the calendar month when no previous period exists.

## Data storage

Data is stored in the `data/` directory (gitignored — never committed):

- `data/_settings.json` — global settings
- `data/YYYY-MM_YYYYMMDD_HHMMSS.json` — one timestamped file per month; old files for the same month are replaced atomically on each save

All writes use a `.tmp` + `os.replace()` pattern to prevent corruption on crash.
