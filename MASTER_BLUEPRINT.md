# CaseConWeb – Master Blueprint

This blueprint consolidates all project knowledge from `README.md`, `PROJECT_RECIPE.md`, `BUILD_SPEC.md`, `NEXT_STEPS.md`, `CHANGELOG.md`, and `backend/README.md`. It is the single source of truth to rebuild, operate, and extend CaseCon (Jovie Data Processor).

---

## Table of Contents
- [1) Overview](#1-overview)
- [2) Tech Stack](#2-tech-stack)
- [3) Core Modules (Panels)](#3-core-modules-panels)
- [4) Data Model & Stores (Zustand)](#4-data-model--stores-zustand)
- [5) Matching & Display Rules (Compare)](#5-matching--display-rules-compare)
- [6) TimeCK Deviation Badges](#6-timeck-deviation-badges)
- [7) BCAS Case Extraction & Status](#7-bcas-case-extraction--status)
- [8) End-to-End Flows](#8-end-to-end-flows)
- [9) API Contracts (primary backend Node/Express)](#9-api-contracts-primary-backend-nodeexpress)
- [10) Project Structure](#10-project-structure)
- [11) Runbook](#11-runbook)
- [12) Exports](#12-exports)
- [13) Styling & UX](#13-styling--ux)
- [14) Testing & QA](#14-testing--qa)
- [15) Security & Ops](#15-security--ops)
- [16) Deployment](#16-deployment)
- [17) Changelog Highlights](#17-changelog-highlights)
- [18) Roadmap & Housekeeping](#18-roadmap--housekeeping)
- [19) Appendix: Key Types](#19-appendix-key-types)
- [20) Appendix: UID Registry Persistence](#20-appendix-uid-registry-persistence)

## 1) Overview
- __Purpose__: Reconcile and report across BUCA and JOVIE datasets with advanced comparison, time checking (TimeCK), and reconciliation (Recon) views.
- __Audience__: Engineers, QA, and operations.
- __Status__: Active; latest changes include Admin Desk snapshot tagging and Compare caregiver display tweaks.

## 2) Tech Stack
- __Frontend__: React 18, Create React App (react-scripts), TailwindCSS, Zustand, Axios, XLSX (xlsx-populate preferred, SheetJS fallback)
- __Backend__: Node.js + Express. Database-related features (Prisma/Postgres/Redis/JWT) are currently disabled; app uses file-backed storage for snapshots and UID map. Docker supported.
- __Ports__: Frontend 3000, Backend 5000

## 3) Core Modules (Panels)
- __BUCA Panel (`components/BCASPanel.js`)__: Case extraction and confirmation via paste-aware UX; export `CaseConBCAS.xlsx`.
- __JOVIE Panel (`components/JoviePanel.js`)__: Ingest Jovie text → normalized rows; optional UID enrichment.
- __Compare Panel (`components/ComparePanel.js`)__: Match BUCA vs JOVIE by UID or name; caregiver display rules and row highlighting.
- __TimeCK Panel (`components/TimeCKPanel.js`)__: Compute canonical deviation badges (YES or deviations); export `CaseConTimeCK.xlsx`.
- __Recon Panel (`components/ReconPanel.js`)__: Final overview: Case, Time (from TimeCK), Status (from BCAS confirmations); export with Status.
- __NameID Registry__: Utilities to view/sync UID mappings; integrates with UID API.
- __DEV Panel__: Sandbox/experiments.

## 4) Data Model & Stores (Zustand)
- __bucaStore (`frontend/src/store/bucaStore.js`)__
  - BUCA module state: `bucaText`, `bucaRows`, row helpers (CRUD), timestamps.
  - Also exports __useReconExchangeStore__ (see below) for Recon-specific helpers.
- __useReconExchangeStore (in `bucaStore.js`)__
  - Recon helpers and derived data only.
  - State: `bucaCases: []`, `timeByCase: { [caseLower]: timeChecked }`.
  - Methods: `setBucaCases(cases)`, `setTimeByCase(map)`, `getReconRows()` which merges BUCA cases with TimeCK map.
  - Usage: imported by `src/App.js` to derive Recon base rows for display/export.
- __exchangeStore (`frontend/src/store/exchangeStore.js`)__
  - Shared pub/sub bus across modules.
  - Channels: `buca`, `jovie`, `uids`, `storage`.
  - API: `publish(channel, data)`, `subscribe(channel, selector)`, `clearChannel(channel)`, `getChannelData(channel)`.
  - Usage examples: `components/BucaPanel.js` publishes BUCA rows to `buca`; `components/NameIDRegistryPanel.js` consumes `buca`/`jovie` and publishes `uids`.
- __bcasStore__
  - `editedResults: { [idx]: string }`
  - `confirmations: { [idx]: { parsedCase, matched, timestamp } }`
- __timeckStore__
  - `deviationMessages: { [idx]: string }`
- __Index mapping__
  - All cross-panel joins rely on stable original row indices. Preserve indices through filtering/sorting.

## 5) Matching & Display Rules (Compare)
- __Primary key__: Caregiver MAST UID when present on both sides.
  - Equal → Exact Match (green)
  - Different → Caregiver Mismatch (orange), inline hint `BUCA -> {name}`
- __Fallback__: If a side lacks UID, compare names strictly. Conservative nickname handling only if surnames match.
- __Temporary UIDs__: Session-only; not displayed/persisted/matched; used to keep identities stable.
- __Caregiver column display__: When both rows have multiple BUCA caregivers, show only JOVIE caregiver in Caregiver column. BUCA list lives in Result/Match column (`BUCA -> {names}`).
- __Row background priority__: Backend Complete Mismatch (red) > caregiver mismatch (orange) > Exact Match (green).

## 6) TimeCK Deviation Badges
- `analyzeDeviation(refStr, valStr)`:
  - Equal intervals → `YES` (green)
  - Else compose: `Arrived early/late X`, `Left early/late X`
  - If any absolute diff ≥ 60 min → prefix `More than hour deviation: ` (red); others are orange.
- Publish to `timeckStore.deviationMessages[idx]`. Recon consumes this for Time column and exports.

## 7) BCAS Case Extraction & Status
- Paste intercept everywhere (search bar and Result cell).
- Extract case number by order:
  1) `BUC\s*Case\s*Number\s*:\s*([A-Z0-9-]+)`
  2) `(?:^|\s)((?:00[a-zA-Z0-9]|CAS)[-A-Z0-9]+)(?=\b)`
- Sanitize by dropping trailing labels like `Date:` and `ESTCaregiver:`.
- Status in Recon:
  - __Checked (green)__ when `confirmations[idx].matched === true`
  - __Pending (orange)__ when missing or `matched === false`
- `CopyCell` copies visible text preserving line breaks.

## 8) End-to-End Flows
- __BUCA → Exchange__: Normalize `{client, caregiver, caseNumber, line}`; update `exchange.bucaCases`.
- __TimeCK → Exchange__: Update `timeByCase` with `{ [case.toLowerCase()]: timeChecked }`.
- __Exchange → Recon__: `ReconPanel` renders base rows via `getReconRows()` and time via `timeByCase` mapping.
- __BCAS → Recon__: `bcasStore.confirmations[idx]` drives Status column and tooltip (parsedCase, timestamp).

## 9) API Contracts (primary backend Node/Express)
Active endpoints:
- POST `/process_buca` → `{ success, rows, count, invalidLines, hasErrors }`
- POST `/process_jovie` → `{ success, rows, count, date }`
- GET `/uids` → returns UID registry map `{ [key:string]: uid }`
- POST `/uids` → replace UID registry map with body JSON
- POST `/uids/resolve` → accepts `{ rows: Row[] }`, returns resolved rows with possible `clientUID`, `caregiverUID`, and `*-mast` tokens
- GET `/corrections` → returns `[]` (stub)
- POST `/corrections` → `{ ok: true }` (stub)
- GET `/api/snapshots` → `{ snapshots: SnapshotMeta[] }`
- POST `/api/snapshots` → `{ ok: true, id }`
- GET `/api/snapshots/:id` → full snapshot JSON
- DELETE `/api/snapshots/:id` → `{ ok: true }`
- GET `/health` and `/api/health` → health probes

Disabled placeholders (return 503): `/api/auth/*`, `/api/cases*`, `/api/sessions*`.

__UID Registry base__: Align with `REACT_APP_UID_API_URL` or default `http://localhost:5000/uids` for consistency across panels and utilities.

## 10) Project Structure
- __Frontend (`frontend/`)__
  - `public/`, `src/` with `components/`, `store/`, `utils/`, etc.
  - Tabs may wrap modules: `src/tabs/*` (legacy/alternatives).
- __Backend (`backend/`)__
  - `src/` with `config/`, `middleware/`, `routes/`, `utils/`, and entry (`app.js`/`server.js` or `index.js`)
  - Prisma schema/migrations under `prisma/`

## 11) Runbook
- __Local setup__ (Windows scripts available)
  - Backend: `backend` → `npm install` → `npm start` (or `node src/index.js`)
  - Frontend: `frontend` → `npm install` → `npm start`
  - Access: Frontend `http://localhost:3000`, Backend `http://localhost:5000`, UID Registry `http://localhost:5000/uids`
  - Note: DB-dependent routes are disabled and will return HTTP 503.
- __Docker__
  - `docker-compose -f docker-compose.dev.yml up -d` (if present)

## 12) Exports
- `CaseConBUCA.xlsx`: Line #, Client, Caregiver, Case #, Result/Notes
- `CaseConBCAS.xlsx`: Line #, Client, Caregiver, Case #, Result, Match, Timestamp
- `CaseConTimeCK.xlsx`: Client, Caregiver, Case #, Reference Time, Actual Time, Deviation Badge
- Recon export: Client, Caregiver, Case #, Time (badge), Status

## 13) Styling & UX
- Colors: green (success/YES/Checked), orange (pending/minor deviations), red (major deviation/mismatch)
- Multi-line cells wrap; `CopyCell` preserves whitespace and copies visible text.
- ModuleLoader pattern: lazy-load panels with placeholders for unplugged modules.

## 14) Testing & QA
- __Automated__: Jest (unit), Supertest (integration), Cypress (E2E).
- __Manual QA checklist__ (from `NEXT_STEPS.md`):
  - __Recon Status__: Checked vs Pending end-to-end; clears correctly when BCAS clears.
  - __BCAS Paste Flows__: Search and Result cells intercept paste, extract case; no raw blob insertion; brief no-match feedback.
  - __Time Colors__: YES (green), >1h deviation (red), others (orange). Two-line format with label on first line.
  - __Copy__: Copy-to-clipboard preserves both lines.
  - __TimeCK → Recon__: Canonical badge appears per row.
  - __Admin Desk Snapshots__: Save → tag modal (Atlanta/Charlotte/Raleigh), name `Recon-MM-DD-YYYY- HH:MM [Tag]`, cancel aborts; mirrored in Component Workshop.
  - __Compare__: Changes reflected in Recon UI.
  - __Consistency__: Row index mapping stable. Clearing TimeCK clears `deviationMessages` and Recon updates. Recon export matches on-screen Time.

## 15) Security & Ops
- JWT with short-lived access tokens; HTTP-only refresh cookies.
- Validation, rate limiting, CORS, security headers, logging (Morgan).
- Secrets via environment variables; Prisma prevents SQL injection.
- Sessions in Redis; session TTL configurable.

## 16) Deployment
- __Backend__: Build → run with PM2/systemd; HTTPS via reverse proxy; set `NODE_ENV=production`.
- __CI/CD__: Test on PRs; build Docker images; deploy to staging/production; run migrations.
- __Monitoring__: Health checks, logs, error tracking.

## 17) Changelog Highlights
- __2025-08-13__ (admindesk-compare-polish)
  - Admin Desk snapshot: local-time naming, tag modal (Atlanta/Charlotte/Raleigh), tag in final name, cancel aborts.
  - Compare caregiver display tweak: Caregiver column shows JOVIE when BUCA has multiple caregivers; BUCA list moved to mismatch label.
- __2025-08-12__ (compare-refinement)
  - BCAS → Recon Status integration; TimeCK ↔ Recon deviation sync; Copy UX improved; Results renamed to TimeCK; matching rules finalized; loader clean-up.

## 18) Roadmap & Housekeeping
- __Enhancements__
  - Time cell tooltips showing raw reference vs actual times; optional iconography/pills.
  - Granular filters (Checked/Pending); logging/fallbacks if `deviationMessages` missing.
- __Docs discipline__
  - Keep `README.md`, `BUILD_SPEC.md`, and `CHANGELOG.md` updated after sessions.
  - Revisit index-based keys if sorting/pagination architecture changes.

---

## 19) Appendix: Key Types
- __BucaRow__: `{ client, caregiver, caseNumber, timeRef?, timeVal?, line? }`
- __JovieRow__: `{ client, caregivers: string[], caseNumber, time? }`
- __ReconRow__: `{ index, client, caregiver, caseNumber, time, status }`
- __Confirmation__: `{ parsedCase, matched, timestamp }`

## 20) Appendix: UID Registry Persistence
- __Frontend config__: `frontend/.env` `REACT_APP_UID_API_URL=http://localhost:5000/uids`
- __Default base__: `http://localhost:5000/uids` if env not set.
- __Storage__: `uids.json` at repo root via backend.

This blueprint is authoritative. When in doubt, follow the matching, TimeCK, and Recon status contracts here for consistent UI and exports.
