# CaseConWeb Project Recipe: Step-by-Step Recreation Guide

This document provides a comprehensive, blow-by-blow guide to recreate the CaseConWeb app from scratch. Use this as a blueprint for rebuilding or onboarding new developers.

---

## 1. Project Setup

### Backend (Flask)
1. Create a new Python virtual environment.
2. Install dependencies:
   - flask
   - flask-cors
   - pandas
   - openpyxl
   - python-dotenv (optional)
3. Structure backend directory:
   - `app.py` (Flask app)
   - `utils.py` (comparison/correction logic)
   - `corrections.json` (persistent corrections)
   - `requirements.txt`
4. Implement endpoints:
   - `/process_buca`, `/process_jovie` for parsing
   - `/process_buca` uses a refined regex for case number extraction, ensuring no trailing characters (e.g., extra 'D' or 'Date') are included even if there is no whitespace after the case number.
   - `/compare` for comparison logic
   - `/corrections`, `/add_correction`, `/delete_correction` for correction management
   - `/export` for Excel export
5. Implement correction application logic in `utils.py`:
   - Use `{type, buca, jovie}` structure
   - Apply corrections by matching `buca` (case-insensitive) and replacing with `jovie`
6. Ensure corrections are loaded/saved from/to `corrections.json` on startup and every change.
7. Enable CORS for all origins (development convenience).

### Frontend (React + Vite)
1. Create a new React 18 project with Vite.
2. Install dependencies:
   - tailwindcss
   - xlsx (for Excel export)
3. Structure frontend directory:
   - `src/tabs/` for modular tab components (BUCA, JOVIE, ENGINE, Compare, BCAS, etc.)
   - `src/api.js` for backend API calls
   - `src/App.js` as main component
   - `src/UniversalCorrectionsModal.js` for corrections UI
4. Implement each tab as a persistent React component (always mounted).
5. **BCAS Tab Sticky Paste Bar:**
    - Add a sticky input bar at the top of the BCAS tab for rapid, repeatable reservation data entry.
    - User pastes a reservation block (with Client and BUC Case Number), which auto-fills the JCase for the matching row, compares to BCase, and updates the result.
    - Shows warnings for not found or duplicate clients/case numbers.
    - Allows repeated use, one row per paste, with highlight feedback.
6. Implement Compare tab:
   - Displays comparison results
   - Allows adding/removing corrections via modal
   - Calls `/compare` endpoint and applies corrections
7. Implement corrections modal:
   - Displays universal corrections from backend
   - Allows deletion (calls `/delete_correction`)
7. Ensure all correction API calls use `{type, buca, jovie}` structure (wrapped as `{ correction: ... }` for add/delete).
8. Display status bars and provide Excel export for each relevant tab.

## 2. Correction Workflow
1. User identifies mismatch in Compare tab
2. Adds correction in modal (client or caregiver)
3. Correction sent to backend and saved in `corrections.json`
4. On next comparison, backend applies corrections before matching
5. UI updates to reflect resolved matches (mismatches disappear)

## 3. Testing & Validation
- Test with sample data for BUCA, JOVIE, ENGINE
- Add corrections and verify mismatches disappear
- Delete corrections and verify mismatches reappear
- Confirm corrections.json updates on every change
- Test Excel export

## 4. Maintenance & Extension
- Add new tabs/components as needed
- Extend correction structure for new fields
- Harden backend for production (DB, auth, error handling)
- Improve UI/UX as desired

---

**This recipe ensures CaseConWeb can be rebuilt or extended at any time, with all critical logic and workflow steps documented.**
