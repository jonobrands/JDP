// API helper for CaseCon backend
export async function processBuca(bucaText) {
  const res = await fetch('http://localhost:5000/process_buca', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buca_text: bucaText }),
  });
  return res.json();
}

export async function processJovie(jovieText) {
  const res = await fetch('http://localhost:5000/process_jovie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jovie_text: jovieText }),
  });
  return res.json();
}

export async function uploadBucaJovie(bucaText, jovieText) {
  const payload = {};
  if (bucaText) payload.buca_text = bucaText;
  if (jovieText) payload.jovie_text = jovieText;
  const res = await fetch('http://localhost:5000/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function compareData(bucaRows, jovieRows) {
  const res = await fetch('http://localhost:5000/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucaRows, jovieRows }),
  });
  return res.json();
}

export async function getCorrections() {
  try {
    const res = await fetch('http://localhost:5000/corrections');
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
  const res = await fetch('http://localhost:5000/corrections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ corrections }),
  });
  return res.json();
}

export async function addCorrection(correction) {
  const res = await fetch('http://localhost:5000/add_correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correction }),
  });
  return res.json();
}

export async function deleteCorrection(correction) {
  const res = await fetch('http://localhost:5000/delete_correction', {
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

// Temporary implementation - returns empty UID mapping
// TODO: Replace with actual implementation when available
const UID_API_BASE = process.env.REACT_APP_UID_API_URL || 'http://localhost:5000/uids';

// Ensure UIDs exist for the exact names in provided rows (no aliasing or normalization here).
// Expects backend to upsert and return mappings per exact name.
// Request shape: { clients: string[], caregivers: string[] }
// Response shape: { clients: { [name: string]: string }, caregivers: { [name: string]: string } }
export async function ensureUidsForRows(rows = []) {
  try {
    const clients = Array.from(new Set((rows || []).map(r => (r && r.client) ? String(r.client).trim() : '').filter(Boolean)));
    const caregivers = Array.from(new Set((rows || []).flatMap(r => {
      if (!r) return [];
      if (Array.isArray(r.caregivers)) return r.caregivers;
      if (r.caregiver) return [r.caregiver];
      return [];
    }).map(n => String(n).trim()).filter(Boolean)));

    const res = await fetch(`${UID_API_BASE}/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clients, caregivers })
    });
    if (!res.ok) {
      console.warn('UID ensure call failed with status', res.status);
      return { clients: {}, caregivers: {} };
    }
    const data = await res.json();
    const safe = {
      clients: (data && data.clients) || {},
      caregivers: (data && data.caregivers) || {}
    };
    return safe;
  } catch (e) {
    console.warn('UID ensure call error, returning empty maps', e);
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
