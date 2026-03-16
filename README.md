# StratVest

StratVest is a URL and PDF investigation tool that converts raw documents into an interactive visual dashboard.

It combines a React frontend with an Express backend so you can inspect a webpage or PDF, extract text, classify claims, and visualize the result as a scorecard, gauge, timeline, and claim board.

## Stack

- Frontend: React, Vite, Tailwind, Framer Motion
- Backend: Express, TypeScript, Playwright, Lighthouse
- Deployment: Docker, Railway, GitHub Pages for static frontend builds

## Project structure

```
backend/    Express API, analysis queue, Playwright/Lighthouse agents
frontend/   React UI, Vite build, Tailwind styling
server.mjs  Single-process runtime that serves API + static frontend
Dockerfile  Multi-stage production build
railway.toml Railway deployment config
```

## Local development

### Backend

```bash
cd backend
npm install
npx playwright install chromium
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies API requests to the backend on `http://localhost:8787`.

## Docker

```bash
docker build -t stratvest .
docker run -p 8080:8080 stratvest
```

The production container serves the frontend and backend together on port `8080`.

## Railway

This repo includes a `railway.toml` file and a root `Dockerfile`, so Railway can deploy it directly as a Dockerfile-based service.

Health check path: `/api/healthz`

## What it does

- fetches and inspects URLs
- extracts readable text from HTML and PDFs
- groups claims into supported, mixed, unsupported, and normative buckets
- visualizes the result in a dark Observable-style interface
- exposes an API endpoint for raw source retrieval at `/api/view-source`

## Notes

This project is an investigative starting point, not a final truth machine. The text classifier is heuristic-based and should be treated as exploratory.
