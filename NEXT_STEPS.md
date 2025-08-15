# Next Steps

## Immediate QA
- Validate Recon Status column end-to-end:
  - Paste matching and non-matching case numbers in BCAS; observe Recon: Checked (green) vs Pending (orange).
  - Clear Results in BCAS and ensure Recon Status clears to Pending.
  - Export from Recon and verify Status column values.
- QA paste flows in BCAS:
  - Search bar: blob → extract → assign target row; no-case feedback shown briefly.
  - Result cell: blob → extract → set; no raw blob inserted.
- Verify Recon Time cell colors across cases: YES (green), >1h deviation (red), others (orange).
- Confirm two-line format for 
  - "More than hour deviation:" on top line, details below.
- Ensure wrapping looks good for examples:
  - Arrived early 1h 0m, Left late 30m
  - More than hour deviation: Arrived early 1h 30m, Left early 4h 0m
- Check copy-to-clipboard copies both lines.
- TimeCK → Recon checks:
  - Confirm canonical badge (“YES” or deviation string) appears in Recon Time column for each row.
- Admin Desk save flow:
  - Click Save → tag modal appears with Atlanta/Charlotte/Raleigh.
  - Selecting a tag saves snapshot with correct name format including tag.
  - Cancel closes modal without saving.
  - Confirm same behavior in Component Workshop panel.
- Compare changes:
  - Verify changes are reflected in Recon UI.

## Functional Consistency
- Row index mapping: confirm it stays consistent if sorting/filtering is added later.
- TimeCK Clear Results: confirms it also clears `deviationMessages` and Recon updates.
- Recon export: Deviation column equals on-screen Time cell value for each row.

## Potential Enhancements
- Add hover tooltips for Time cell showing raw Jovie vs Result times.
- Optional: small badge for YES (e.g., rounded pill) vs deviation (warning/alert icon).
- Logging/fallbacks if `deviationMessages` are missing.
- Tooltip on Status with parsed case and timestamp (already included in Recon UI).
- Granular filters: show only Checked/Pending.

## Documentation
- README.md updated (TimeCK rename, Admin Desk snapshot UX).
- CHANGELOG.md updated (Admin Desk tagging, Compare caregiver display tweak).
- BUILD_SPEC.md kept in sync (Admin Desk section, Compare display rule).

## Housekeeping
- Keep README/BUILD_SPEC/CHANGELOG.md updated after each session.
- If architecture evolves (sorting, pagination), revisit index-based keys.
