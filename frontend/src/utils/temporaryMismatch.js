// Utility for handling Temporary Mismatch logic in comparison results

/**
 * Find all rows with a temporary mismatch.
 * @param {Array} rows - Array of comparison result rows
 * @returns {Array} - Rows flagged as temporary mismatches
 */
export function getTemporaryMismatchRows(rows) {
  return rows.filter(
    row =>
      row.tag === 'temp_mismatch' ||
      row.match_type === 'Temporary Mismatch'
  );
}

/**
 * Mark a temporary mismatch as resolved or update with user choice.
 * @param {Object} row - The mismatch row
 * @param {Object} resolution - The user’s resolution (e.g., preferred value or notes)
 * @returns {Object} - Updated row
 */
export function resolveTemporaryMismatch(row, resolution) {
  return {
    ...row,
    ...resolution,
    tag: 'resolved',
    match_type: 'Resolved',
  };
}

// Add more helpers as needed for modal state, UI, etc.
