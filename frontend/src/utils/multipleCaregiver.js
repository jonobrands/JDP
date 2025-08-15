// Utility for handling multiple caregivers in BUCA or other data
// Modular, reusable, and easily extendable

/**
 * Identifies rows with multiple caregivers.
 * Handles both 'caregiver' (string with comma-separated names) and 'caregivers' (array) formats.
 * @param {Array} rows - Array of data rows (e.g., BUCA rows)
 * @returns {Array} - Filtered array of rows with multiple caregivers
 */
export function getMultipleCaregiverRows(rows) {
  if (!Array.isArray(rows)) return [];
  
  return rows.filter(row => {
    // Check for array format first
    if (Array.isArray(row.caregivers)) {
      return row.caregivers.length > 1;
    }
    
    // Then check for string format (comma-separated)
    if (typeof row.caregiver === 'string') {
      const caregivers = row.caregiver.split(',').map(cg => cg.trim()).filter(Boolean);
      return caregivers.length > 1;
    }
    
    return false;
  });
}

/**
 * Resolves a multiple-caregiver row to a single caregiver (by user selection or default).
 * Handles both 'caregiver' string and 'caregivers' array formats.
 * @param {Object} row - The row to resolve
 * @param {String} selectedCaregiver - The caregiver to select
 * @returns {Object} - The updated row with only the selected caregiver
 */
export function resolveMultipleCaregiverRow(row, selectedCaregiver) {
  // Create a new object to avoid mutating the original
  const updatedRow = { ...row };
  
  // Update both possible property names for consistency
  updatedRow.caregiver = selectedCaregiver;
  updatedRow.caregivers = [selectedCaregiver];
  
  return updatedRow;
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
