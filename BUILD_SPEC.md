# CaseConWeb – Build Specification (Self-Contained Blueprint)
Version: 2025.08.12-compare-refinement

This document is a standalone blueprint to rebuild the application without referencing any other files. Follow it to recreate the same behavior and UI.

## 1) Tech Stack
- Frontend: React (Vite or CRA), TailwindCSS (or equivalent utility classes), Zustand for state
- Backend: Node/Express or Flask (thin layer only if needed for file IO); not required for core UI
- Excel Export: xlsx-populate (preferred) with SheetJS (xlsx) fallback

## 2) App Structure (Frontend)
```
src/
  App.js
  CopyCell.js
  store/
    bcasStore.js
    timeckStore.js
    reconStore.js
  components/
    BCASPanel.js
    TimeCKPanel.js
    ReconPanel.js
```

## 3) Cross-Cutting UI
- CopyCell: a table cell wrapper that preserves whitespace, wraps text, and allows copying visible lines.
- Styling: utility classes to color cells based on status (green/orange/red) and provide consistent spacing.

## 4) Shared Stores (Zustand)

bcasStore.js
- State:
  - bcasTableRows: []
  - editedResults: { [rowIndex]: parsedCase }
  - confirmations: { [rowIndex]: { parsedCase, matched: boolean, timestamp } }
- Actions:
  - setBcasTableRows(rows)
  - setEditedResult(index, value)
  - setEditedResults(map)
  - clearEditedResults()
  - setConfirmation(index, payload)
  - setConfirmations(map)
  - clearConfirmations()

timeckStore.js
- State:
  - editedValues: { [rowIndex]: any }
  - deviationMessages: { [rowIndex]: string }

reconStore.js
- State:
  - reconRows: [] (source rows rendered in Recon)

## 5) Panels and Behavior

### 5.1 BCASPanel
- Columns: Line #, Client, Caregiver, Case #, Result (contentEditable div)
- Search bar above the table with onPaste handler:
  - Always intercept paste; read clipboard text.
  - Extract a case number via regex.
  - If parsed:
    - Set search query to parsed.
    - Find target row by comparing parsed to the displayed Case # (sanitize before compare).
    - If found: setEditedResult(targetIdx, parsed) and setConfirmation(targetIdx, { parsedCase, matched, timestamp })
    - If not found: show brief feedback (e.g., 'No matching case found').
- Result cell onPaste (and Ctrl+V keydown):
  - Always intercept; read clipboard text.
  - Extract parsed; if found, update contentEditable textContent and setEditedResult(rowIndex, parsed), publish setConfirmation(rowIndex, ...)
- Visual cues:
  - Result cell background: green when parsed matches displayed Case #; red when mismatched; default focus ring if none.
- Buttons:
  - Clear Results: clearEditedResults() and clearConfirmations().
  - Export: generate CaseConBCAS.xlsx using xlsx-populate; fallback to SheetJS.

Helpers:
- extractCaseNumber(text): regex to extract case-like token; first try labeled pattern `BUC\s*Case\s*Number\s*:\s*([A-Z0-9-]+)` then generic `(?:^|\s)((?:00[a-zA-Z0-9]|CAS)[-A-Z0-9]+)(?=\b)`
- sanitizeCaseNumber(val): strip trailing labels like `Date:` or `ESTCaregiver:` and trim
- getDisplayedCase(row, idx): prefer sanitized row.caseNumber; else editedResults[idx]; else extract from row.result

### 5.2 TimeCKPanel
- Accepts reference and actual time ranges per row; computes a canonical deviation badge.
- analyzeDeviation(refStr, valStr):
  - Parse both ranges; if equal starts/ends, return 'YES'.
  - Otherwise compose parts: Arrived early/late X, Left early/late X.
  - If any absolute diff exceeds 60 minutes, prefix 'More than hour deviation: ' and join parts.
- Publishes deviationMessages[idx] for Recon to consume.

### 5.3 ReconPanel
- Columns: #, Client, Caregiver, Case Number, Time, Status.
- Case Number: sanitized display of row.caseNumber or fallback to editedResults/extracted result.
- Time: render TimeCK badge; special two-line format when it starts with 'More than hour deviation:'.
- Status: derived solely from bcasStore.confirmations[idx]
  - Checked (green) when matched === true
  - Pending (orange) when missing or matched === false
  - Tooltip shows parsed case and timestamp if available
- Export: JSON-to-Excel with Status column reflecting the same logic.

### 5.4 JoviePanel
- Purpose: ingest Jovie text, parse into rows, and optionally enrich UIDs.
- Actions:
  - Calls `api.processJovie(jovieText)`; stores rows/date in `useJovieStore`.
  - May call UID enrichment API and merge results.
- Outputs: `useJovieStore.jovieRows`, `jovieDate` for downstream tabs.

### 5.5 ComparePanel
- Purpose: compare BUCA and Jovie data sets and produce per-row results.
- Props: `rows`, `onCompare`, `onClearResults`, `onExport`.
- Outputs: rows usable by TimeCK; triggers exports via provided callbacks.
 - Matching rules:
   - Primary key is MAST UID when available on both sides:
     - If both BUCA and JOVIE caregiver UIDs are present and equal → Exact Match (green)
     - If both present and different → Caregiver Mismatch (orange) with inline hint "BUCA -> {name}"
   - Fallback when one or both UIDs missing:
     - Compare names; a mismatch only when names differ
     - Conservative nickname handling: first-name aliasing (e.g., Sam→Samantha) applies only if the surname (and any remaining tokens) match exactly
   - Temporary UIDs:
     - Generate session-only temporary UIDs for sides missing a MAST UID to keep identities stable across re-renders
     - These are never displayed, persisted, or used for match decisions
 - UI:
   - Removed inline UID debug lines for a cleaner display
   - Row background priority: backend Complete Mismatch (red) > caregiver mismatch (orange) > Exact Match (green)
   - Display rule refinement:
     - When multiple BUCA caregivers are present on BOTH rows, show only the JOVIE caregiver in the Caregiver column.
     - Keep the BUCA caregivers visible in the Result/Match column via the `BUCA -> {names}` hint for context.
 - Architecture:
   - Compare tab is a module socket; lazy-load `components/ComparePanel.js`

### 5.6 NameIDRegistryPanel
- Purpose: registry utilities to resolve/name IDs and synchronize UIDs.
- Behavior: interacts with UID APIs (ensure/sync), shows mappings, assists other tabs.

### 5.7 DEVPanel
- Purpose: sandbox for experiments and developer tools.
- Behavior: placeholder until features are plugged in.

## 6) Index Mapping
- All cross-panel state uses original row indices (position within source rows) to correlate.
- When filtering/sorting for display, retain the original index in closures to map back to shared stores.

## 7) Excel Export
- Prefer xlsx-populate for formatting (bold headers, frozen top row, borders, best-fit column widths).
- Fallback to SheetJS when xlsx-populate fails at runtime.
- Filenames: CaseConBCAS.xlsx, CaseConTimeCK.xlsx (TimeCK export), Recon file name per product choice.

## 8) Styling Conventions
- Green: success/confirmed (e.g., Checked, YES)
- Orange: pending or minor deviations
- Red: significant deviation (e.g., >1h), or mismatches
- Use small, legible text with wrapped content for multi-line cells.

## 9) Module Loader (Optional)
- Implement a ModuleLoader that lazy-loads components by name and shows placeholders for unplugged modules.

## 10) Testing Checklist
- Paste blob in BCAS search: assigns the correct row and publishes confirmation.
- Paste blob in Result cell: sets parsed case and confirmation for that row.
- Recon shows Status per row: Checked vs Pending; tooltip populated.
- TimeCK produces expected deviation messages and Recon Time reflects them.
- Clear Results resets BCAS edited and confirmation states; Recon Status turns Pending.
- Exports produce the expected files with correct columns and widths.

## 11) App Shell and Tabs
- Tabs (App.js `TAB_NAMES`):
  - 0 BUCA: BUCA data ingestion and parsing
  - 1 JOVIE: Jovie data ingestion
  - 2 Compare: Side-by-side compare and tools
  - 3 TimeCK: Time checking/calculation (formerly Results)
  - 4 BCAS: Case number verification module
  - 5 RECON: Reconciliation overview (Case, Time, Status)
  - 6 UID Registry: Name/ID resolution utilities
  - 7 DEV: Development/experiments placeholder

- Module Loader pattern: each tab lazy-loads its module and shows a placeholder when unplugged. Placeholders list expected props/location.

## 12) Module Catalog (Components)
- BucaPanel (`components/BucaPanel.js`)
  - Text input → `api.processBuca` → sets `useBucaStore.bucaRows`
  - Export BUCA view to Excel
  - Feeds normalized rows into Exchange (see Stores)

- JoviePanel (`components/JoviePanel.js`)
  - Text input → `api.processJovie` → `useJovieStore.jovieRows` and date
  - Optional UID enrichment via external API

- ComparePanel (`components/ComparePanel.js`)
  - Receives `rows`, `onCompare`, `onClearResults`, `onExport`
  - Produces per-row results used by TimeCK

- TimeCKPanel (`components/TimeCKPanel.js`)
  - Computes deviation badge via `analyzeDeviation`
  - Publishes `timeckStore.deviationMessages`
  - Exports `CaseConTimeCK.xlsx`

- BCASPanel (`components/BCASPanel.js`)
  - Paste-aware search and Result cells; publishes `bcasStore.editedResults` and `bcasStore.confirmations`
  - Clear resets edited state and confirmations
  - Exports `CaseConBCAS.xlsx`

- ReconPanel (`components/ReconPanel.js`)
  - Displays BUCA case rows, Time (from TimeCK), Status (from BCAS confirmations)
  - Includes tooltips and exports with Status column

- NameIDRegistryPanel (`components/NameIDRegistryPanel.js`)
  - Registry tools for resolving IDs/UIDs

- DEVPanel (`components/DEVPanel.js`, optional)
  - Placeholder for experiments

## 13) Store Catalog (Zustand)
- `store/bucaStore.js`
  - `useBucaStore`: bucaText, bucaRows, setters/clearers
  - `useExchangeStore`:
    - State: `bucaCases: {client, caregiver, caseNumber, line}[]`, `timeByCase: { [lowerCaseCaseNr]: timeChecked }`
    - Actions: `setBucaCases(cases)`, `setTimeByCase(map)`
    - Helper: `_sanitizeCase(val)` strips trailing labels like `Date:` and `ESTCaregiver:`
    - Selector: `getReconRows()` merges BUCA cases with `timeByCase` to create RECON rows

- `store/bcasStore.js`
  - `bcasTableRows`, `editedResults`, `confirmations`
  - Actions: `setEditedResult(s)`, `clearEditedResults`, `setConfirmation(s)`, `clearConfirmations`

- `store/timeckStore.js`
  - `editedValues`, `deviationMessages`

- Additional stores present (one-liners):
  - `authStore.js`: auth/session tokens
  - `caseStore.js`: case-related models or cache
  - `compareStore.js`: compare tab state
  - `exchangeStore.js`: older generic pub/sub hub (superseded by `useExchangeStore` in `bucaStore.js` for buca/time flow)
  - `index.js`: store aggregation helpers
  - `jovieStore.js`: Jovie rows/date
  - `moduleStore.js`: module-level flags
  - `persistentStore.js`: persistence helpers
  - `reconStore.js`: recon rows when needed directly
  - `resultsStore.js`: legacy results
  - `sessionStore.js`: UI/session flags

## 14) End-to-End Data Flows
- BUCA → Exchange
  - App normalizes `useBucaStore.bucaRows` to `{client, caregiver, caseNumber, line}` and calls `useExchangeStore.setBucaCases` on changes.

- TimeCK → Exchange
  - App derives `timeByCase` from analysis rows: `{ [case.toLowerCase()]: timeChecked }` and calls `useExchangeStore.setTimeByCase` on changes.

- Exchange → Recon
  - `ReconPanel` consumes `getReconRows()` from `useExchangeStore` to render base rows; Time field comes from `timeByCase` mapping.

- BCAS → Recon Status
  - `BCASPanel` publishes `confirmations[rowIndex] = { parsedCase, matched, timestamp }` into `bcasStore`.
  - `ReconPanel` reads `confirmations[rowIndex]` to render color-coded Status and tooltip.

## 15) Build/Run Notes
- Ensure environment variable for optional UID API: `REACT_APP_UID_API_URL` (POST /resolve)
- If no backend is used, keep API stubs no-ops and focus on front-end state flows.

## 16) API Contracts (frontend/src/api.js)
- POST http://localhost:5000/process_buca { buca_text }
  - -> { rows: Array<{ line?, client, caregiver|caregivers[], caseNumber }> }
- POST http://localhost:5000/process_jovie { jovie_text }
  - -> { rows: Array, date?: string }
- POST http://localhost:5000/upload { buca_text?, jovie_text? } -> { ok }
- POST http://localhost:5000/compare { bucaRows, jovieRows } -> { rows }
- GET  http://localhost:5000/corrections -> { corrections: [] }
- POST http://localhost:5000/corrections { corrections }
- POST http://localhost:5000/add_correction { correction }
- POST http://localhost:5000/delete_correction { correction }
- UID API (optional): `REACT_APP_UID_API_URL` base
  - POST {base}/ensure { clients: string[], caregivers: string[] } -> { clients: map, caregivers: map }
  - GET  {base} -> map

## 17) Utilities (frontend/src/utils)
- formatting.js
  - formatTime12hRange(timeString)
- multipleCaregiver.js
  - getMultipleCaregiverRows(rows)
  - resolveMultipleCaregiverRow(row, selectedCaregiver)
  - getMultiCGModalState(rows)
- normalizeName.js: tiny normalizer used by panels
- uidRegistrySync.js: helper to sync/register UIDs via API
- temporaryMismatch.js: helpers for mismatch/correction workflow

## 18) Shared Components and Tabs
- Shared components
  - CopyCell.js: preserves whitespace, wraps, supports copy UX
  - CorrectionsModal.js: per-row correction modal (Identify CG flow)
  - UniversalCorrectionsModal.js: global corrections management

- Tabs (frontend/src/tabs)
  - CaseNrTab.js: BCAS/CaseNr focused tab wrapper
  - CompareTab.js: compare workflow wrapper
  - CorrectionsTab.js: corrections management surface
  - ExportTab.js: export utilities UI
  - LicenseTab.js: licensing/help
  - ResultsTab.js: legacy; TimeCK took over core results display

Notes
- App.js lazy-loads module panels directly from `components/`, while `tabs/*` provide alternative or legacy wrappers. Keep both patterns documented for clarity during migration.

## 19) Component Contracts (Interfaces)

Conventions
- Types shown as simple shapes; optional fields marked with (optional).
- “Consumes”/“Publishes” refer to Zustand stores.

App (frontend/src/App.js)
- Props: none (root)
- Responsibilities: tab routing, lazy-load panels, wire stores/props, orchestrate exports
- Exposes: none

ModuleLoader ({ moduleName })
- Props:
  - moduleName: string (e.g., 'BucaPanel')
- Behavior: dynamic `import(./components/${moduleName})` with placeholder fallback
- Exposes: renders the loaded module as default export

BucaPanel (components/BucaPanel.js)
- Props: none
- Consumes: useBucaStore { bucaText, bucaRows, setBucaText, setBucaRows, clearBuca }
- Publishes: useBucaStore.bucaRows; useExchangeStore { bucaCases, timeByCase }
- External: api.processBuca(text)
- Events/Callbacks: internal handlers for paste/upload; triggers export
- Export: CaseConBUCA.xlsx (SheetJS/xlsx)

JoviePanel (components/JoviePanel.js)
- Props: none
- Consumes: useJovieStore { jovieText, jovieRows, jovieDate, setters }
- Publishes: useJovieStore.jovieRows (and date)
- External: api.processJovie(text); optional UID ensure via REACT_APP_UID_API_URL
- Export: optional per-module export (if UI provides)

ComparePanel (components/ComparePanel.js)
- Props:
  - rows: any[]
  - onCompare: (bucaRows, jovieRows) => void
  - onClearResults: () => void
  - onExport: () => void
- Consumes: none directly (receives data via props)
- Publishes: comparison output via onCompare
- External: api.compareData(bucaRows, jovieRows) (when used)

TimeCKPanel (components/TimeCKPanel.js)
- Props: none
- Consumes: useExchangeStore { bucaCases, timeByCase }
- Publishes: timeckStore.deviationMessages: { [rowIndex: number]: string }
- Helpers: analyzeDeviation(refStr, valStr) -> { badge: string }
- Export: CaseConTimeCK.xlsx

BCASPanel (components/BCASPanel.js)
- Props: none
- Consumes: useBucaStore (for source rows when needed)
- Publishes:
  - bcasStore.editedResults: { [rowIndex: number]: string }
  - bcasStore.confirmations: { [rowIndex: number]: { parsedCase: string, matched: boolean, timestamp: string } }
- Key UI Contracts:
  - Search onPaste: intercept -> extractCaseNumber -> setEditedResult + setConfirmation
  - Result cell onPaste/Ctrl+V: same as above; cell turns green on match, red on mismatch
- Helpers: extractCaseNumber(text), sanitizeCaseNumber(val), getDisplayedCase(row, idx)
- Export: CaseConBCAS.xlsx (xlsx-populate primary, SheetJS fallback)

ReconPanel (components/ReconPanel.js)
- Props: none
- Consumes:
  - useExchangeStore.getReconRows() -> base rows
  - timeckStore.deviationMessages -> Time column
  - bcasStore.confirmations -> Status column
- Publishes: none
- UI Contracts:
  - Status: Checked (green) when confirmations[idx].matched === true; else Pending (orange)
  - Tooltip: shows parsedCase and timestamp if present
- Export: Recon export includes Status column consistent with UI

NameIDRegistryPanel (components/NameIDRegistryPanel.js)
- Props: none
- Consumes: optional UID maps (fetched via utils/api or api.js)
- Publishes: updates to local UID registry view; may call UID ensure/sync utilities
- External: utils/uidRegistrySync.js, api.ensureUidsForRows, api.fetchAllUids

DEVPanel (components/DEVPanel.js) [optional]
- Props: none
- Behavior: sandbox; no required contracts

Tabs (frontend/src/tabs/*.js)
- CaseNrTab, CompareTab, CorrectionsTab, ExportTab, LicenseTab, ResultsTab
- Props: none (connected to stores or App-managed callbacks)
- Purpose: alternative or legacy wrappers around module functionality

Stores (summary contracts)
- useBucaStore: { bucaText: string, bucaRows: any[], timeByCase?: map, setBucaText(), setBucaRows(), clearBuca() }
- useExchangeStore (embedded): { bucaCases: map, timeByCase: map, setBucaCases(), setTimeByCase(), getReconRows() }
- bcasStore: { editedResults: { [idx]: string }, confirmations: { [idx]: { parsedCase, matched, timestamp } }, setters/clearers }
- timeckStore: { deviationMessages: { [idx]: string }, setters }

## 20) Example Payloads and Schemas

### 20.1 API Requests/Responses

process_buca
- Request
```json
{ "buca_text": "Client: Jane Doe\nCaregiver: John A\nCase: 00A-123\n..." }
```
- Response
```json
{
  "rows": [
    {
      "line": 1,
      "client": "Jane Doe",
      "caregiver": "John A",
      "caseNumber": "00A-123",
      "timeRef": "07:00am-03:00pm",
      "timeVal": "07:05am-03:02pm"
    }
  ]
}
```

process_jovie
- Request
```json
{ "jovie_text": "...raw Jovie export blob..." }
```
- Response
```json
{
  "date": "2025-08-01",
  "rows": [
    {
      "client": "Jane Doe",
      "caregivers": ["John A"],
      "caseNumber": "00A-123",
      "time": "7AM-3PM"
    }
  ]
}
```

upload
- Request
```json
{ "buca_text": "...", "jovie_text": "..." }
```
- Response
```json
{ "ok": true }
```

compare
- Request
```json
{
  "bucaRows": [{ "client": "Jane Doe", "caregiver": "John A", "caseNumber": "00A-123" }],
  "jovieRows": [{ "client": "Jane Doe", "caregivers": ["John A"], "caseNumber": "00A-123" }]
}
```
- Response
```json
{ "rows": [{ "match": true, "caseNumber": "00A-123" }] }
```

corrections (GET)
- Response
```json
{ "corrections": [ { "from": "J A.", "to": "John A" } ] }
```

corrections (POST)
- Request
```json
{ "corrections": [ { "from": "J A.", "to": "John A" } ] }
```
- Response
```json
{ "ok": true }
```

add_correction / delete_correction
- Request
```json
{ "correction": { "from": "J A.", "to": "John A" } }
```
- Response
```json
{ "ok": true }
```

UID ensure (optional)
- Request
```json
{ "clients": ["Jane Doe"], "caregivers": ["John A"] }
```
- Response
```json
{ "clients": { "Jane Doe": "cli_123" }, "caregivers": { "John A": "cg_456" } }
```

UID fetchAllUids (optional)
- Response
```json
{ "clients": {"Jane Doe":"cli_123"}, "caregivers": {"John A":"cg_456"} }
```

### 20.2 Row Shapes (internal)

BUCA row (normalized)
```json
{
  "client": "Jane Doe",
  "caregiver": "John A",
  "caseNumber": "00A-123",
  "timeRef": "07:00am-03:00pm",
  "timeVal": "07:05am-03:02pm"
}
```

Jovie row (normalized)
```json
{
  "client": "Jane Doe",
  "caregivers": ["John A"],
  "caseNumber": "00A-123",
  "time": "7AM-3PM"
}
```

Recon row (derived)
```json
{
  "index": 0,
  "client": "Jane Doe",
  "caregiver": "John A",
  "caseNumber": "00A-123",
  "time": "Arrived late 00:05, Left late 00:02", // from timeckStore.deviationMessages[0]
  "status": "Checked" // from bcasStore.confirmations[0]
}
```

### 20.3 Store Samples

bcasStore.confirmations
```json
{
  "0": { "parsedCase": "00A-123", "matched": true, "timestamp": "2025-08-12T07:44:00.000Z" },
  "1": { "parsedCase": "CAS-999", "matched": false, "timestamp": "2025-08-12T07:45:10.000Z" }
}
```

timeckStore.deviationMessages
```json
{ "0": "YES", "1": "Arrived early 00:10" }
```

### 20.4 Export Column Schemas

CaseConBUCA.xlsx
- Columns: Line # (optional), Client, Caregiver, Case #, Result/Notes (module-defined)

CaseConBCAS.xlsx
- Columns: Line #, Client, Caregiver, Case #, Result, Match (YES/NO), Timestamp

CaseConTimeCK.xlsx
- Columns: Client, Caregiver, Case #, Reference Time, Actual Time, Deviation Badge

Recon Export
- Columns: Client, Caregiver, Case #, Time (badge), Status (Checked/Pending)

## 21) Component Prop Types (TypeScript-style)

Note: These are documentation-only interfaces. Components without props are annotated accordingly.

```ts
// App root
interface AppProps {}

// Dynamic loader
interface ModuleLoaderProps {
  moduleName: 'BucaPanel' | 'JoviePanel' | 'ComparePanel' | 'TimeCKPanel' | 'BCASPanel' | 'ReconPanel' | 'NameIDRegistryPanel' | 'DEVPanel';
}

// ComparePanel receives everything via props
type Row = Record<string, any>;
interface ComparePanelProps {
  rows: Row[];
  onCompare: (bucaRows: Row[], jovieRows: Row[]) => void;
  onClearResults: () => void;
  onExport: () => void;
}

// Panels with no external props (store-driven)
interface BucaPanelProps {}
interface JoviePanelProps {}
interface TimeCKPanelProps {}
interface BCASPanelProps {}
interface ReconPanelProps {}
interface NameIDRegistryPanelProps {}
interface DEVPanelProps {}

// Tabs (wrapper components) — normally no props
interface CaseNrTabProps {}
interface CompareTabProps {}
interface CorrectionsTabProps {}
interface ExportTabProps {}
interface LicenseTabProps {}
interface ResultsTabProps {}

## 22) Strict Row and Store Types (TypeScript)

```ts
// Core rows
export interface BucaRow {
  line?: number;
  client: string;
  caregiver: string; // single caregiver post-normalization
  caseNumber: string;
  timeRef?: string; // e.g., "07:00am-03:00pm"
  timeVal?: string; // e.g., "07:05am-03:02pm"
}

export interface JovieRow {
  client: string;
  caregivers: string[]; // Jovie may contain multiple
  caseNumber: string;
  time?: string; // e.g., "7AM-3PM"
}

export interface ReconRow {
  index: number; // original BUCA index
  client: string;
  caregiver: string;
  caseNumber: string;
  time: string; // deviation badge from TimeCK, e.g., 'YES' or 'Arrived late 00:05'
  status: 'Checked' | 'Pending';
}

// Stores
export interface Confirmation {
  parsedCase: string;
  matched: boolean;
  timestamp: string; // ISO
}

export type ConfirmationsMap = Record<number, Confirmation>;
export type EditedResultsMap = Record<number, string>;
export type DeviationMessagesMap = Record<number, string>; // idx -> badge text

export interface BcasStoreShape {
  editedResults: EditedResultsMap;
  confirmations: ConfirmationsMap;
}

export interface TimeckStoreShape {
  deviationMessages: DeviationMessagesMap;
}
```

## 23) BCAS Case Extraction and Sanitize Rules (verbatim)

Extraction order
1) Labeled pattern (preferred)
```js
const LABELED = /BUC\s*Case\s*Number\s*:\s*([A-Z0-9-]+)/i;
```
2) Generic case-like token (fallback)
```js
const GENERIC = /(?:^|\s)((?:00[a-zA-Z0-9]|CAS)[-A-Z0-9]+)(?=\b)/;
```

Helper implementation
```js
function extractCaseNumber(text = '') {
  const s = String(text);
  const m1 = s.match(LABELED);
  if (m1 && m1[1]) return m1[1].toUpperCase();
  const m2 = s.match(GENERIC);
  if (m2 && m2[1]) return m2[1].toUpperCase();
  return '';
}

function sanitizeCaseNumber(val = '') {
  // Remove trailing labels like 'Date:' or 'ESTCaregiver:' fragments
  const cleaned = String(val)
    .replace(/\bDate\s*:\s*.*$/i, '')
    .replace(/\bEST\s*Caregiver\s*:\s*.*$/i, '')
    .trim();
  return cleaned;
}

function getDisplayedCase(row, idx, editedResults) {
  const fromRow = row && row.caseNumber ? sanitizeCaseNumber(row.caseNumber) : '';
  if (fromRow) return fromRow;
  const edited = editedResults && editedResults[idx] ? sanitizeCaseNumber(editedResults[idx]) : '';
  if (edited) return edited;
  // Fallback: try to extract from any result blob on the row
  const blob = row && row.result ? row.result : '';
  return sanitizeCaseNumber(extractCaseNumber(blob));
}
```

Notes
- Matching is case-insensitive but stored as uppercase.
- UI color rules in BCASPanel depend on equality of sanitized(displayedCase) vs sanitized(parsed).

## 24) Export Samples (first 2–3 rows)

CaseConBUCA.xlsx

| Line # | Client   | Caregiver | Case #   | Result/Notes        |
|--------|----------|-----------|----------|---------------------|
| 1      | Jane Doe | John A    | 00A-123  | Parsed from BUCA    |
| 2      | Jim Poe  | Ann B     | 00B-234  | Needs verification  |

CaseConBCAS.xlsx

| Line # | Client   | Caregiver | Case #   | Result   | Match | Timestamp                  |
|--------|----------|-----------|----------|----------|-------|----------------------------|
| 1      | Jane Doe | John A    | 00A-123  | 00A-123  | YES   | 2025-08-12T07:44:00.000Z  |
| 2      | Jim Poe  | Ann B     | 00B-234  | CAS-999  | NO    | 2025-08-12T07:45:10.000Z  |

CaseConTimeCK.xlsx

| Client   | Caregiver | Case #   | Reference Time   | Actual Time       | Deviation Badge                  |
|----------|-----------|----------|------------------|-------------------|----------------------------------|
| Jane Doe | John A    | 00A-123  | 07:00am-03:00pm  | 07:05am-03:02pm   | Arrived late 00:05, Left late 00:02 |
| Jim Poe  | Ann B     | 00B-234  | 06:00am-02:00pm  | 05:50am-01:45pm   | More than hour deviation: Arrived early 00:10, Left early 00:15 |

Recon Export

| Client   | Caregiver | Case #   | Time                                   | Status   |
|----------|-----------|----------|----------------------------------------|----------|
| Jane Doe | John A    | 00A-123  | Arrived late 00:05, Left late 00:02    | Checked  |
| Jim Poe  | Ann B     | 00B-234  | More than hour deviation: Arrived early 00:10, Left early 00:15 | Pending  |

## 25) Store Interfaces with Actions (TypeScript)

```ts
// Embedded exchange store (in bucaStore module)
export interface ExchangeStoreShape {
  bucaCases: Record<string, BucaRow>; // keyed by caseNumber or composite key
  timeByCase: Record<string, { ref?: string; val?: string }>; // normalized times
  setBucaCases: (map: ExchangeStoreShape['bucaCases']) => void;
  setTimeByCase: (map: ExchangeStoreShape['timeByCase']) => void;
  clear: () => void;
  getReconRows: () => ReconRow[];
}

export interface BucaStoreShape {
  bucaText: string;
  bucaRows: BucaRow[];
  lastUpdated?: string; // ISO
  setBucaText: (text: string) => void;
  setBucaRows: (rows: BucaRow[]) => void;
  clearBuca: () => void;
  // Exchange facade
  exchange: Pick<ExchangeStoreShape, 'setBucaCases' | 'setTimeByCase' | 'getReconRows'>;
}

export interface BcasStoreShape {
  editedResults: EditedResultsMap;
  confirmations: ConfirmationsMap;
  setEditedResult: (index: number, value: string) => void;
  clearEditedResults: () => void;
  setConfirmation: (index: number, c: Confirmation) => void;
  clearConfirmations: () => void;
}

export interface TimeckStoreShape {
  deviationMessages: DeviationMessagesMap;
  setDeviationMessage: (index: number, badge: string) => void;
  clearDeviationMessages: () => void;
}
```

Notes
- getReconRows merges BUCA base rows with TimeCK and BCAS decorations via indices.
- Index stability is required for correct cross-store joins.

## 26) Minimal Backend Spec (Flask)

Assumptions
- Python 3.10+, Flask, simple in-memory storage for corrections and UID maps.
- CORS enabled for localhost:3000.

Dependencies (requirements.txt)
```
Flask==3.0.2
Flask-Cors==4.0.1
```

app.py outline
```py
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CORRECTIONS = []  # [{from: str, to: str}]
UIDS = { 'clients': {}, 'caregivers': {} }

@app.post('/process_buca')
def process_buca():
    data = request.get_json(force=True) or {}
    text = data.get('buca_text', '')
    # TODO: parse text -> rows
    rows = []
    return jsonify({ 'rows': rows })

@app.post('/process_jovie')
def process_jovie():
    data = request.get_json(force=True) or {}
    text = data.get('jovie_text', '')
    # TODO: parse text -> rows/date
    rows = []
    date = None
    return jsonify({ 'rows': rows, 'date': date })

@app.post('/upload')
def upload():
    # Optionally persist the raw blobs
    return jsonify({ 'ok': True })

@app.post('/compare')
def compare():
    data = request.get_json(force=True) or {}
    bucaRows = data.get('bucaRows', [])
    jovieRows = data.get('jovieRows', [])
    # TODO: implement match logic
    rows = []
    return jsonify({ 'rows': rows })

@app.get('/corrections')
def get_corrections():
    return jsonify({ 'corrections': CORRECTIONS })

@app.post('/corrections')
def save_corrections():
    data = request.get_json(force=True) or {}
    CORRECTIONS.clear()
    CORRECTIONS.extend(data.get('corrections', []))
    return jsonify({ 'ok': True })

@app.post('/add_correction')
def add_correction():
    data = request.get_json(force=True) or {}
    corr = data.get('correction')
    if corr:
        CORRECTIONS.append(corr)
    return jsonify({ 'ok': True })

@app.post('/delete_correction')
def delete_correction():
    data = request.get_json(force=True) or {}
    corr = data.get('correction')
    if corr in CORRECTIONS:
        CORRECTIONS.remove(corr)
    return jsonify({ 'ok': True })

@app.get('/uids')
def list_uids():
    return jsonify(UIDS)

@app.post('/uids/ensure')
def ensure_uids():
    data = request.get_json(force=True) or {}
    for name in data.get('clients', []) or []:
        UIDS['clients'].setdefault(name, f"cli_{abs(hash(name))%100000}")
    for name in data.get('caregivers', []) or []:
        UIDS['caregivers'].setdefault(name, f"cg_{abs(hash(name))%100000}")
    return jsonify(UIDS)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

Endpoint summary
- POST /process_buca -> { rows }
- POST /process_jovie -> { rows, date }
- POST /upload -> { ok }
- POST /compare -> { rows }
- GET /corrections -> { corrections }
- POST /corrections -> { ok }
- POST /add_correction -> { ok }
- POST /delete_correction -> { ok }
- GET /uids -> { clients, caregivers }
- POST /uids/ensure -> { clients, caregivers }

Notes
- Align base URL with REACT_APP_UID_API_URL=http://localhost:5000/uids (front-end already configured).
- Parser implementations can evolve independently; payload contracts here are stable for the front end.
