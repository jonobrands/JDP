// Utility for handling multiple caregivers in BUCA or other data
// Modular, reusable, and easily extendable

/**
 * Identifies rows with multiple caregivers.
 * @param {Array} rows - Array of data rows (e.g., BUCA rows)
 * @returns {Array} - Filtered array of rows with multiple caregivers
 */
export function getMultipleCaregiverRows(rows) {
  return rows.filter(row =>
    Array.isArray(row.caregivers) && row.caregivers.length > 1
  );
}

/**
 * Resolves a multiple-caregiver row to a single caregiver (by user selection or default).
 * @param {Object} row - The row to resolve
 * @param {String} selectedCaregiver - The caregiver to select
 * @returns {Object} - The updated row with only the selected caregiver
 */
export function resolveMultipleCaregiverRow(row, selectedCaregiver) {
  return {
    ...row,
    caregivers: [selectedCaregiver],
  };
}

/**
 * Modal logic helper: returns modal state for multi-CG correction.
 * This is a pure function, but you can adapt to use React state/hooks as needed.
 * @param {Array} rows
 * @returns {Object} { flaggedRows, modalOpen }
 */
export function getMultiCGModalState(rows) {
  const flaggedRows = getMultipleCaregiverRows(rows);
  return {
    flaggedRows,
    modalOpen: flaggedRows.length > 0,
  };
}

// Add more helpers as needed for corrections, UI state, etc.
