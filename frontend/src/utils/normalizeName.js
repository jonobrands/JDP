// Helper: Normalize name for matching (case/space insensitive)
export function normalizeName(name) {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}
