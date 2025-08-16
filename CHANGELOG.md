# Changelog

> Note: This document is superseded by MASTER_BLUEPRINT.md. For the authoritative, consolidated source, see [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md).

## 2025-08-13
Release: 2025.08.13-admindesk-compare-polish

### Admin Desk – Snapshot Naming & Tagging
- Default snapshot name format changed from ISO to local time: `Recon-MM-DD-YYYY- HH:MM`.
- Save flow now opens a tag selection modal with three tags: Atlanta, Charlotte, Raleigh.
- Final snapshot name includes the tag in brackets (e.g., `Recon-08-13-2025- 08:45 [Atlanta]`).
- Cancel closes the modal without saving. Mirrored in Component Workshop version.

### ComparePanel – Caregiver Display Tweak
- For rows with multiple BUCA caregivers, the Caregiver column now shows only the JOVIE caregiver for clarity.
- BUCA caregiver list is still shown in the Result/Match column as part of the mismatch label: `BUCA -> {names}`.
- No change to matching logic; this is a display clean-up.

## 2025-08-12
Release: 2025.08.12-compare-refinement

### BCAS → Recon Status Integration
- Added shared confirmations in `bcasStore` and wired Recon Status column.
  - Status in Recon: Checked (green) when matched; Pending (orange) otherwise or missing.
  - Export includes Status per row.

### BCASPanel Paste Behavior Fix
- Restored intercept-and-parse behavior for search bar and Result cell.
  - Always intercept paste; extract case number from blob; apply if parsed; otherwise gentle feedback/no change.
  - Also publishes confirmations with matched flag and timestamp.

### TimeCK ↔ Recon Deviation Sync
- Extended `timeckStore` (Zustand) with `deviationMessages` and clearers.
- TimeCKPanel publishes computed deviation badge messages to the store by original row index.
- Fixed TDZ error by moving publish logic below `exactRows` definition.
- TimeCKPanel export now prefers shared `deviationMessages`, falling back to local `analyzeDeviation` only if missing.

### ReconPanel UI/Export
- Reads exact deviation from `timeckStore.deviationMessages` for the Time column and export.
- Word-wrapped Time column with controlled width; widened slightly to avoid splitting `00m`.
- Two-line rendering when message starts with "More than hour deviation:" (label on first line, details on second).
- Color coding for Time cell:
  - YES: green (bg-green-100 text-green-800)
  - More than hour deviation: red (bg-red-100 text-red-800)
  - Other deviations: orange (bg-orange-100 text-orange-800)

### Copy UX
- `CopyCell` now copies visible text (innerText), preserving line breaks.

### CompareTab Display Update
- CompareTab: Display override for caregiver mismatch on BOTH rows
  - Match Type cell now shows badge "PORTAL Mismatch" with inline note "BUCA -> {Name}" when BUCA and JOVIE caregivers differ for the same client/case.
  - Row highlights red in this state.
  - No tooltip added. No changes to exports.

### Renaming/Loader
- Results renamed to TimeCKPanel; App lazy-loads `./components/TimeCKPanel`; tab labeled "TimeCK".
- Default export filename: `CaseConTimeCK.xlsx`.

### ComparePanel – Caregiver Matching Refinement
- Matching rules finalized:
  - When both BUCA and JOVIE caregiver UIDs present: equal → Exact Match (green); different → Caregiver Mismatch (orange) with inline hint "BUCA -> {name}".
  - When either UID is missing: fallback to name comparison to decide mismatch; no mismatch solely for a missing UID.
  - Nickname handling is conservative and only applied in fallback: first-name aliasing (e.g., Sam→Samantha) is considered only if surnames match exactly; otherwise strict name compare.
- Session-only temporary UIDs are generated for tracking when a side lacks MAST UID; these are not displayed, not persisted, and not used for matching, purely to keep identities stable during the session.
- UI clean-up: removed inline UID debug lines; row background priority now respects backend flags (red for Complete Mismatch) before our caregiver mismatch (orange), and green for Exact Match.
- Architecture: Compare tab remains a module socket that lazy-loads `components/ComparePanel.js`; removed legacy `CompareTab.js` references/imports.
