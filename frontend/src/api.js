// API helper for CaseCon backend
// Base URL resolution: prefer explicit API base, fallback to localhost
const API_BASE =
  (typeof window !== 'undefined' && window.CASECON_API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  process.env.REACT_APP_API_URL ||
  'http://localhost:5000';

export async function processBuca(bucaText) {
  const res = await fetch(`${API_BASE}/process_buca`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buca_text: bucaText }),
  });
  return res.json();
}

export async function processJovie(jovieText) {
  const res = await fetch(`${API_BASE}/process_jovie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jovie_text: jovieText }),
  });
  return res.json();
}

// Deprecated: endpoint not available on backend
export async function uploadBucaJovie() {
  console.warn('uploadBucaJovie is deprecated: no backend endpoint. Use processBuca/processJovie separately.');
  throw new Error('upload endpoint not available');
}

// Deprecated: endpoint not available on backend
export async function compareData() {
  console.warn('compareData is deprecated: no backend endpoint. Perform comparison client-side if needed.');
  throw new Error('compare endpoint not available');
}

export async function getCorrections() {
  try {
    const res = await fetch(`${API_BASE}/corrections`);
    if (!res.ok) {
      console.warn('Corrections endpoint not available, continuing with empty list');
      return { corrections: [] };
    }
    return res.json();
  } catch (e) {
    console.warn('Corrections fetch failed, continuing with empty list', e);
    return { corrections: [] };
  }
}

export async function saveCorrections(corrections) {
  const res = await fetch(`${API_BASE}/corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ corrections }),
  });
  return res.json();
}

export async function addCorrection(correction) {
  // Map to corrections POST as a no-op stub, for legacy callers
  const res = await fetch(`${API_BASE}/corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correction }),
  });
  return res.json();
}

export async function deleteCorrection(correction) {
  // Map to corrections POST as a no-op stub, for legacy callers
  const res = await fetch(`${API_BASE}/corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correction }),
  });
  return res.json();
}

export async function exportResults() {
  // Client-side Excel export: return a Blob for callers to save
  const mod = await import('xlsx');
  const XLSXLib = mod && mod.default ? mod.default : mod;
  const wb = XLSXLib.utils.book_new();
  // Minimal sheet to satisfy existing callers; can be extended to include real data
  const now = new Date().toISOString();
  const ws = XLSXLib.utils.json_to_sheet([
    { Export: 'CaseCon Export', GeneratedAt: now },
  ]);
  XLSXLib.utils.book_append_sheet(wb, ws, 'Export');
  const array = XLSXLib.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// UID Registry base for direct GET/POST when needed
const UID_API_BASE =
  (process.env.REACT_APP_UID_API_URL && process.env.REACT_APP_UID_API_URL.replace(/\/$/, '')) ||
  `${API_BASE}/uids`;

// Build name->UID maps by resolving rows via backend '/uids/resolve'
// Response: { clients: { [exactName]: uid }, caregivers: { [exactName]: uid } }
export async function ensureUidsForRows(rows = []) {
  try {
    const res = await fetch(`${API_BASE}/uids/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: Array.isArray(rows) ? rows : [] })
    });
    if (!res.ok) {
      console.warn('UID resolve call failed with status', res.status);
      return { clients: {}, caregivers: {} };
    }
    const resolved = await res.json(); // array of rows with possible clientUID/caregiverUID
    const out = { clients: {}, caregivers: {} };
    (resolved || []).forEach((r) => {
      if (!r) return;
      const clientName = r.originalClient || r.client;
      const caregiverName = r.originalCaregiver || r.caregiver;
      if (clientName && r.clientUID) out.clients[String(clientName)] = String(r.clientUID);
      if (caregiverName && r.caregiverUID) out.caregivers[String(caregiverName)] = String(r.caregiverUID);
      // Fallbacks from mast tokens if present
      if (clientName && !out.clients[clientName] && (r.client_mast_uid || r.mast_uid)) out.clients[String(clientName)] = String(r.client_mast_uid || r.mast_uid);
      if (caregiverName && !out.caregivers[caregiverName] && r.caregiver_mast_uid) out.caregivers[String(caregiverName)] = String(r.caregiver_mast_uid);
    });
    return out;
  } catch (e) {
    console.warn('UID resolve call error, returning empty maps', e);
    return { clients: {}, caregivers: {} };
  }
}

// Legacy helper retained for compatibility; attempts a simple GET to the UID API
export async function fetchAllUids() {
  try {
    const res = await fetch(`${UID_API_BASE}`);
    if (!res.ok) return {};
    const data = await res.json();
    return data || {};
  } catch (e) {
    return {};
  }
}
