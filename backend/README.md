# URL Intent Auditor Backend

Production-shaped backend for the URL Intent Auditor UI.

It accepts a target URL, runs isolated agents, stores immutable artifacts per run, and returns explainable findings instead of hand-wavy nonsense.

## What it does

- queues URL inspections with bounded concurrency
- captures a browser session with Playwright
- records HAR, Playwright trace, screenshot, HTML snapshot, DOM resource inventory, console logs, cookies, and network metadata
- runs Lighthouse programmatically in a separate Chrome session
- correlates CDN assets to likely package identities
- detects markers for telemetry, third-party execution, CSP weakness, legacy polyfills, unpinned CDN assets, and missing SRI
- produces a final intent/risk score with evidence chains

## Stack

- Node.js 22.20+ or 24 LTS
- TypeScript
- Express 5
- Playwright
- Lighthouse
- chrome-launcher

Express 5 is the current default on npm and in the project's ACTIVE support line, according to the Express Technical Committee. Lighthouse's Node API returns the LHR object and artifacts when used programmatically, and Playwright supports non-persistent browser contexts, HAR recording, traces, request timing/sizes, and CDP sessions for raw DevTools data.

Citations for those facts are in the handoff message, because stuffing web citations into a README is ugly even by human standards.

## Install

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
```

Server starts on `http://localhost:8787` by default.

## API

### `POST /api/runs`

Create a new inspection run.

```json
{
  "targetUrl": "https://example.com",
  "sandbox": {
    "screenshot": true,
    "devtoolsTrace": true,
    "lighthouse": true,
    "captureHeaders": true,
    "timeoutMs": 45000,
    "waitUntil": "load"
  }
}
```

### `GET /api/runs`

List recent runs.

### `GET /api/runs/:id`

Get manifest and artifact index for a single run.

### `GET /api/runs/:id/artifacts`

Get artifact list.

### `GET /api/runs/:id/artifacts/:name`

Download a specific artifact.

### `GET /healthz`

Basic liveness check.

## Artifact layout

Each run creates a directory under `DATA_DIR/runs/<runId>/`.

Typical output:

- `manifest.json`
- `fetch-profile.json`
- `playwright-capture.json`
- `requests.json`
- `cdp-network.json`
- `page.html`
- `screenshot.png`
- `trace.zip`
- `session.har`
- `lighthouse.json`
- `lighthouse.html`
- `cdn-correlation.json`
- `markers.json`
- `intent-score.json`
- `report.json`

## Operational notes

- This backend is single-process but concurrency-limited and artifact-persistent.
- If you want distributed workers later, keep the API as-is and swap the in-memory queue for Redis or your broker of choice.
- Playwright contexts are non-persistent and isolated by design. Lighthouse's Node API requires a Chrome port; this backend launches a separate headless Chrome instance for that audit.
- HAR files are written when the browser context closes, and traces are saved when tracing stops.
