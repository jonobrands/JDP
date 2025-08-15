# CaseConWeb Project Context

## Overview
CaseConWeb is a modular React + Flask application for comparing, correcting, and reconciling client and caregiver data from multiple sources (BUCA, JOVIE, ENGINE). It features a robust corrections workflow, persistent universal corrections, and Excel export. The app is designed for reliability, transparency, and easy extension.

## Tech Stack
- **Frontend:** React 18 (Vite), JavaScript, Tailwind CSS
- **Backend:** Flask (Python), pandas, flask-cors
- **Data Export:** xlsx (Excel)
- **Persistence:** corrections.json (local JSON file)

## Major Components
- **Tabs:**
  - BUCA: Parse and display BUCA data
  - JOVIE: Parse and display JOVIE data
  - ENGINE: Parse and display ENGINE data
  - Compare: Cross-source comparison and corrections
  - Results, Case#: Placeholders for future features
- **Corrections:**
  - Unified correction structure: `{ type, buca, jovie }`
  - Persistent in backend/corrections.json
  - Managed via Compare tab UI
- **Comparison Logic:**
  - Applies corrections before comparing
  - Matches on corrected names for both client and caregiver

## Key Design Decisions
- Modular tab structure (each tab is a React component, always mounted)
- Universal corrections applied globally
- Minimal-click workflow for corrections
- Robust error handling and debug logging
- All code and requirements are documented for easy resumption or extension

## State Management
- **BUCA** and **JOVIE** tab data are managed globally using Zustand stores (`bucaStore.js` and `jovieStore.js`).
- All tab components access their respective data directly from the global store (no prop drilling).
- **Global Time Rule:** The JOVIE session date is parsed from the first non-empty line of JOVIE input, lifted to App-level state, and passed to all tabs for status bars and context.

## UI and Tab Structure
- Modular React tab structure: BUCA, JOVIE, ENGINE, Compare, Results, Case#, BCAS (with sticky paste bar for rapid reservation entry).
- Each tab is a separate, always-mounted component (state preserved on tab switch).
- ResultsTab now dynamically pulls J-Time for each client/caregiver from the global JOVIE Zustand store if not already present in the row.

### BCAS Tab Sticky Paste Bar
- A sticky input bar at the top of the BCAS tab allows users to paste reservation data (Client and BUC Case Number) repeatedly, one row per paste.
- The app parses the pasted block, matches the client, auto-fills the JCase, compares to BCase, and updates the result.
- Duplicate case numbers and missing clients are flagged with clear warnings.
- The updated row is highlighted for feedback.

## Time Formatting
- All time values (J-Time, B-Time, etc.) are standardized to 12-hour format with AM/PM using the `formatTime12hRange` utility.
- This formatting is enforced in ResultsTab and should be used wherever times are displayed.

## Data Flow
- Data is parsed and processed in each tab, then stored in the respective global store.
- CompareTab, ResultsTab, and other summary tabs use these global states for all calculations and rendering.

## Export
- Excel export matches the visible columns and formatting in ResultsTab.

## Summary
- The app uses a robust, modular, and maintainable architecture with global state, standardized time formatting, and a clear global time rule for all session/date displays.

## File/Directory Structure
- `frontend/`: React app (src/tabs, src/api.js, src/App.js, etc.)
- `backend/`: Flask app (app.py, utils.py, corrections.json)

## Correction Workflow
1. User identifies a mismatch in Compare tab
2. Adds a correction via the modal (client or caregiver)
3. Correction is saved to backend/corrections.json
4. On next comparison, corrections are applied and mismatches disappear

## Persistence & Security
- Corrections are saved in a JSON file in the backend directory
- License key support (optional, for future feature gating)

## How to Extend
- Add new tabs/components as needed
- Add new correction types by extending correction structure and mapping logic
- UI/UX can be improved with more feedback, modals, or notifications

---
For full step-by-step recreation, see PROJECT_RECIPE.md
