// Global formatting utilities for CaseCon Web

/**
 * Format a time string (e.g., '7PM-11PM', '6AM-2PM', '10:15AM-4:15PM')
 * to the standardized format: 00:00am-00:00pm
 * Handles both single and range times.
 */
export function formatTime12hRange(timeString) {
  if (!timeString || typeof timeString !== 'string') return '';
  // Split on dash or to (allowing for whitespace)
  const parts = timeString.split(/\s*-\s*|\s*to\s*/i);
  if (parts.length === 1) {
    // Single time (e.g., '7PM')
    return to12h(parts[0]);
  }
  // Format both start and end
  return `${to12h(parts[0])}-${to12h(parts[1])}`;
}

/**
 * Helper: Convert a time string to 12h format with lowercase am/pm.
 * Accepts '7PM', '7:00PM', '19:00', etc.
 */
function to12h(time) {
  if (!time) return '';
  // Try to parse as 24h or 12h time
  let t = time.trim().toUpperCase();
  // If already has AM/PM, parse and format as HH:MMam/pm
  const ampmMatch = t.match(/^(\d{1,2})(:(\d{2}))?([AP]M)$/);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    let min = ampmMatch[3] || '00';
    let ampm = ampmMatch[4].toLowerCase();
    const hourStr = hour.toString().padStart(2, '0');
    const minStr = min.toString().padStart(2, '0');
    return `${hourStr}:${minStr}${ampm}`;
  }
  // If 24h (e.g., '19:00'), convert
  const match = t.match(/^(\d{1,2})(:(\d{2}))?$/);
  if (match) {
    let hour = parseInt(match[1], 10);
    let min = match[3] || '00';
    let ampm = hour >= 12 ? 'pm' : 'am';
    if (hour > 12) hour -= 12;
    if (hour === 0) hour = 12;
    // Pad hour and minute to two digits
    const hourStr = hour.toString().padStart(2, '0');
    const minStr = min.toString().padStart(2, '0');
    return `${hourStr}:${minStr}${ampm}`;
  }
  // Fallback: return as lowercase
  return t.toLowerCase();
}

// Add more global formatting helpers as needed
