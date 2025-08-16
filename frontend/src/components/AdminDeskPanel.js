import React, { useEffect, useMemo, useRef, useState } from 'react';

// AdminDeskPanel is self-contained and does not import app stores to avoid touching existing code.
// It discovers optional snapshot providers via globals, and gracefully degrades if the backend routes are missing.
// Expected (optional) globals other parts of the app can expose later without changing this panel:
// - window.CaseCon = {
//     getAppVersion?: () => string,
//     // Providers return plain JSON slices to be placed under stores: { storeKey: any }
//     snapshotProviders?: Array<() => Promise<Record<string, any>> | Record<string, any>>,
//     // UI state providers: return ui object and temporary data (e.g., tempUids)
//     uiProvider?: () => Promise<{ ui?: any; temporary?: any; } | { ui?: any; temporary?: any }>,
//     // Apply snapshot (atomic restore) if implemented by host app; panel emits an event if not present
//     applySnapshot?: (snapshot) => Promise<void> | void,
//   }

 
// - window.__CASECON_TEMP_UIDS (optional): Map or plain object of temporary session-only UIDs
// - window.__APP_VERSION (optional): string version

const SCHEMA_VERSION = 1;
const API_BASE = (() => {
  try {
    // 1) Runtime overrides
    if (typeof window !== 'undefined' && window.CASECON_API_BASE) {
      return String(window.CASECON_API_BASE).replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const ls = window.localStorage.getItem('casecon_api_base');
      if (ls) return String(ls).replace(/\/$/, '');
    }
    // 2) Build-time env
    const env = (typeof process !== 'undefined' && process.env) ? process.env : {};
    const direct = env.REACT_APP_API_BASE;
    if (direct && typeof direct === 'string') return direct.replace(/\/$/, '');
    const uidUrl = env.REACT_APP_UID_API_URL;
    if (uidUrl && typeof uidUrl === 'string') {
      try {
        const u = new URL(uidUrl);
        return `${u.protocol}//${u.host}`;
      } catch {}
    }
  } catch {}
  return '';
})();
try { console.info('[AdminDesk] API_BASE =', API_BASE || '(same-origin)'); } catch {}

function nowIso() {
  return new Date().toISOString();
}

async function sha256Hex(text) {
  if (window.crypto && window.crypto.subtle) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(hash));
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (non-crypto, not secure) to avoid breaking UI where SubtleCrypto is unavailable
  let h = 0;
  for (let i = 0; i < text.length; i++) { h = (h << 5) - h + text.charCodeAt(i); h |= 0; }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

function uuid4() {
  // RFC 4122 v4 (best-effort)
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

async function tryJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, raw: text }; }
}

export default function AdminDeskPanel() {
  const showDevInfo = false; // Hide developer-only notes from end users
  const btnStyle = {
    padding: '6px 10px',
    border: '1px solid #d0d7de',
    borderRadius: 6,
    background: '#f6f8fa',
    color: '#24292f',
    cursor: 'pointer'
  };
  const [showTagModal, setShowTagModal] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveForm, setSaveForm] = useState({
    name: '',
    includeFiles: false,
    makePublic: false,
    comment: ''
  });
  const [preview, setPreview] = useState(null);
  const [busyMsg, setBusyMsg] = useState('');
  const [saveInlineName, setSaveInlineName] = useState('');
  const [conn, setConn] = useState('checking'); // 'checking' | 'connected' | 'unavailable'
  const [apiBase, setApiBase] = useState(API_BASE);
  const [showApiEdit, setShowApiEdit] = useState(false);
  const [apiEditValue, setApiEditValue] = useState(API_BASE);

  // Initialize default names on mount
  useEffect(() => {
    try { setSaveInlineName(defaultSnapshotName()); } catch {}
  }, []);

  // Prefill Save As dialog name when opened
  useEffect(() => {
    if (showSaveDialog && !saveForm.name) {
      setSaveForm(s => ({ ...s, name: defaultSnapshotName() }));
    }
  }, [showSaveDialog]);

  // Check server connectivity
  async function checkServer() {
    try {
      const base = API_BASE || '';
      const res = await fetch(`${base}/api/snapshots`, { method: 'GET' });
      setConn(res.ok ? 'connected' : 'unavailable');
    } catch {
      setConn('unavailable');
    }
  }

  useEffect(() => {
    setConn('checking');
    checkServer();
  }, []);

  const appVersion = useMemo(() => {
    const fromEnv = typeof process !== 'undefined' && process.env && process.env.REACT_APP_VERSION;
    const fromGlobal = (window.__APP_VERSION) || (window.CaseCon && typeof window.CaseCon.getAppVersion === 'function' ? window.CaseCon.getAppVersion() : undefined);
    return fromEnv || fromGlobal || 'dev-unknown';
  }, []);

  const createdBy = useMemo(() => {
    // Try to read a non-sensitive username from globals if available
    const u = (window.CaseCon && window.CaseCon.username) || (window.__USER_NAME);
    return u || 'unknown';
  }, []);

  function defaultSnapshotName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const yyyy = d.getFullYear();
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `Recon-${mm}-${dd}-${yyyy}- ${hh}:${min}`;
  }

  async function collectStoresFromProviders() {
    const providers = (window.CaseCon && Array.isArray(window.CaseCon.snapshotProviders)) ? window.CaseCon.snapshotProviders : [];
    const results = await Promise.allSettled(providers.map(fn => Promise.resolve().then(() => fn())));
    const stores = {};
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
        Object.assign(stores, r.value);
      }
    });
    return stores;
  }

  function readTempUids() {
    const g = window.__CASECON_TEMP_UIDS;
    if (!g) return undefined;
    try {
      if (g instanceof Map) {
        return Object.fromEntries(g.entries());
      }
      if (typeof g === 'object') return g;
    } catch {}
    return undefined;
  }

  async function collectUIState() {
    if (window.CaseCon && typeof window.CaseCon.uiProvider === 'function') {
      try { return await window.CaseCon.uiProvider(); } catch {}
    }
    // Minimal fallback: try reading active tab from DOM if tabs have aria-selected
    let activeTab = undefined;
    try {
      const selected = document.querySelector('[role="tab"][aria-selected="true"]');
      if (selected) {
        const idx = selected.getAttribute('data-tab-index') || selected.getAttribute('data-index');
        activeTab = idx ? Number(idx) : undefined;
      }
    } catch {}
    return { ui: { activeTab }, temporary: { tempUids: readTempUids() } };
  }

  async function collectSnapshotEnvelope(name) {
    const stores = await collectStoresFromProviders();
    const { ui, temporary } = await collectUIState();
    const id = uuid4();
    const createdAt = nowIso();
    const envelope = {
      id,
      name: name || defaultSnapshotName(),
      createdBy,
      createdAt,
      appVersion,
      schemaVersion: SCHEMA_VERSION,
      stores,
      ui: ui || {},
      temporary: temporary || {},
      uploads: { items: [] },
    };
    const text = JSON.stringify(envelope);
    const checksum = await sha256Hex(text);
    const sizeBytes = new Blob([text]).size;
    return { ...envelope, meta: { sizeBytes, checksum: `sha256:${checksum}` } };
  }

  function validateSnapshot(s) {
    const errs = [];
    if (!s || typeof s !== 'object') errs.push('Invalid snapshot object');
    if (!s.schemaVersion) errs.push('Missing schemaVersion');
    if (s.schemaVersion && s.schemaVersion !== SCHEMA_VERSION) errs.push(`schemaVersion mismatch: app=${SCHEMA_VERSION} file=${s.schemaVersion}`);
    if (!s.appVersion) errs.push('Missing appVersion');
    return { ok: errs.length === 0, errs };
  }

  async function handleQuickSave() {
    setShowSaveDialog(false);
    setBusyMsg('Collecting snapshot...');
    try {
      const snap = await collectSnapshotEnvelope(defaultSnapshotName());
      await saveToServer(snap, false);
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setBusyMsg('');
    }
  }

  async function handleSave() {
    setBusyMsg('Collecting snapshot...');
    try {
      const snap = await collectSnapshotEnvelope(saveForm.name || defaultSnapshotName());
      await saveToServer(snap, saveForm.includeFiles === true);
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setBusyMsg('');
      setShowSaveDialog(false);
    }
  }

  async function handleSaveInline() {
    // Open tag selector modal; actual save is handled after tag selection
    setShowTagModal(true);
  }

  async function finalizeTaggedSave(tag) {
    setShowTagModal(false);
    setBusyMsg('Collecting snapshot...');
    try {
      const base = defaultSnapshotName(); // e.g., Recon-08-13-2025- 08:45
      const name = `${base} [${tag}]`;
      const snap = await collectSnapshotEnvelope(name);
      await saveToServer(snap, false);
      setSaveInlineName('');
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setBusyMsg('');
    }
  }

  async function saveToServer(snapshot, includeFiles) {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: snapshot.name, snapshot, includeFiles: !!includeFiles })
      });
      if (!res.ok) {
        const body = await tryJson(res);
        const msg = body && (body.error || body.message || body.raw);
        setError(`Server save failed (${res.status}): ${msg || res.statusText}`);
        return { ok: false, server: true };
      }
      const json = await res.json();
      // Refresh list
      await loadList();
      toast(`Snapshot saved on server${json.id ? ' (#'+json.id+')' : ''}`);
      return { ok: true, server: true, id: json.id };
    } catch (e) {
      console.warn('Server save unavailable; falling back to local download.', e);
      // Fallback to local download only on network errors
      downloadJson(`${snapshot.name}.casecon.snapshot.json`, snapshot);
      toast('Server unavailable; downloaded snapshot locally');
      return { ok: true, server: false };
    } finally {
      setLoading(false);
    }
  }

  async function loadList() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/snapshots`);
      if (!res.ok) throw new Error('List unavailable');
      const json = await res.json();
      setSnapshots(Array.isArray(json.snapshots) ? json.snapshots : []);
    } catch (e) {
      // Graceful: server may not exist yet
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(id) {
    try {
      const res = await fetch(`${API_BASE}/api/snapshots/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Download failed');
      const snap = await res.json();
      downloadJson(`${snap.name || id}.casecon.snapshot.json`, snap);
    } catch (e) {
      setError('Unable to download snapshot');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete snapshot permanently?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/snapshots/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await loadList();
    } catch (e) {
      setError('Unable to delete snapshot');
    }
  }

  async function handleLoad(id, snapObj) {
    let snap = snapObj;
    try {
      if (!snap) {
        const res = await fetch(`${API_BASE}/api/snapshots/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error('Load failed');
        snap = await res.json();
      }
      const v = validateSnapshot(snap);
      if (!v.ok) {
        if (!window.confirm(`Snapshot validation warnings: ${v.errs.join('; ')}. Continue anyway?`)) return;
      }
      await applySnapshot(snap);
    } catch (e) {
      setError('Unable to load/apply snapshot');
    }
  }

  async function applySnapshot(snapshot) {
    setBusyMsg('Restoring snapshot — please wait...');
    // Preferred: host app provides an atomic apply. Otherwise, emit a DOM event for the app to handle.
    try {
      if (window.CaseCon && typeof window.CaseCon.applySnapshot === 'function') {
        await window.CaseCon.applySnapshot(snapshot);
      } else {
        const evt = new CustomEvent('casecon:apply-snapshot', { detail: { snapshot } });
        window.dispatchEvent(evt);
      }
      toast('Snapshot restored');
    } catch (e) {
      console.error('Apply snapshot error', e);
      setError('Apply failed. See console for details.');
    } finally {
      setBusyMsg('');
    }
  }

  function toast(msg) {
    // Minimal non-intrusive toast
    try {
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.position = 'fixed';
      el.style.bottom = '16px';
      el.style.right = '16px';
      el.style.background = '#111';
      el.style.color = '#fff';
      el.style.padding = '8px 12px';
      el.style.borderRadius = '6px';
      el.style.zIndex = '9999';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2200);
    } catch {}
  }

  function onUploadLocalFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result || '');
        const snap = JSON.parse(text);
        setPreview(snap);
      } catch (e) {
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  useEffect(() => { loadList(); }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        Server
        <span
          title={apiBase ? `API: ${apiBase}` : 'API: same-origin'}
          style={{
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 999,
            background: conn === 'connected' ? '#e6ffed' : conn === 'checking' ? '#fffbea' : '#ffefef',
            color: conn === 'connected' ? '#046b1b' : conn === 'checking' ? '#896100' : '#8b0000',
            border: '1px solid ' + (conn === 'connected' ? '#b7f5c4' : conn === 'checking' ? '#ffe58f' : '#ffc4c4'),
          }}
        >
          {`Server: ${conn === 'connected' ? 'Connected' : conn === 'checking' ? 'Checking…' : 'Unavailable'}`}
        </span>
        <button
          onClick={() => { setConn('checking'); checkServer(); loadList(); }}
          style={{ ...btnStyle, fontSize: 12, marginLeft: 6 }}
          title="Retry connection check"
        >
          Retry
        </button>
        <button
          onClick={() => { setShowApiEdit(v => !v); setApiEditValue(apiBase || ''); }}
          style={{ ...btnStyle, fontSize: 12, marginLeft: 6 }}
          title="Set API base URL"
        >
          Set API
        </button>
      </h2>
      {showApiEdit && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <input
            style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, minWidth: 260 }}
            value={apiEditValue}
            placeholder="http://localhost:5000"
            onChange={e => setApiEditValue(e.target.value)}
          />
          <button
            style={{ ...btnStyle }}
            onClick={() => {
              const cleaned = String(apiEditValue || '').replace(/\/$/, '');
              try { window.localStorage && window.localStorage.setItem('casecon_api_base', cleaned); } catch {}
              setApiBase(cleaned);
              setConn('checking');
              checkServer();
              loadList();
            }}
          >Apply</button>
          <button style={{ ...btnStyle }} onClick={() => setShowApiEdit(false)}>Close</button>
        </div>
      )}
      {showDevInfo && (
        <p style={{ color: '#555' }}>Snapshot Manager — App version: <code>{appVersion}</code></p>
      )}

      {busyMsg ? <div style={{ margin: '12px 0', padding: 8, background: '#eef' }}>{busyMsg}</div> : null}
      {error ? <div style={{ margin: '12px 0', padding: 8, background: '#fee', color: '#900' }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          style={{ flex: '1 1 260px', minWidth: 220, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }}
          value={saveInlineName}
          placeholder={"Snapshot name (optional) e.g. 'post-recon-2025-08-12'"}
          onChange={(e) => setSaveInlineName(e.target.value)}
        />
        <button style={{ ...btnStyle }} onClick={handleSaveInline} title="Save snapshot with the given name">Save</button>
        <button style={{ ...btnStyle }} onClick={() => setShowSaveDialog(true)} title="Open advanced save options">Save As…</button>
        {/* Quick Save and file upload removed per request */}
      </div>

      {showSaveDialog && (
        <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Save Snapshot</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>
              <div>Name</div>
              <input
                style={{ width: '100%' }}
                value={saveForm.name}
                placeholder={defaultSnapshotName()}
                onChange={(e) => setSaveForm(s => ({ ...s, name: e.target.value }))}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={saveForm.includeFiles}
                onChange={(e) => setSaveForm(s => ({ ...s, includeFiles: e.target.checked }))} />
              Include attached files (if available)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={saveForm.makePublic}
                onChange={(e) => setSaveForm(s => ({ ...s, makePublic: e.target.checked }))} />
              Make public to team (admin-only server setting)
            </label>
            <label>
              <div>Comment</div>
              <textarea
                rows={2}
                style={{ width: '100%' }}
                value={saveForm.comment}
                onChange={(e) => setSaveForm(s => ({ ...s, comment: e.target.value }))}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btnStyle }} onClick={handleSave}>Save</button>
              <button style={{ ...btnStyle }} onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showTagModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, minWidth: 360 }}>
            <h3 style={{ marginTop: 0 }}>Select a tag</h3>
            <p style={{ marginTop: 0, color: '#555' }}>Choose where this Recon save belongs.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btnStyle }} onClick={() => finalizeTaggedSave('Atlanta')}>Atlanta</button>
              <button style={{ ...btnStyle }} onClick={() => finalizeTaggedSave('Charlotte')}>Charlotte</button>
              <button style={{ ...btnStyle }} onClick={() => finalizeTaggedSave('Raleigh')}>Raleigh</button>
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button style={{ ...btnStyle }} onClick={() => setShowTagModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Preview Local Snapshot</h3>
          <div style={{ fontSize: 12, color: '#333', marginBottom: 8 }}>
            <div><b>Name:</b> {preview.name} <b>AppVersion:</b> {preview.appVersion} <b>Schema:</b> {preview.schemaVersion}</div>
            <div><b>CreatedBy:</b> {preview.createdBy} <b>CreatedAt:</b> {preview.createdAt}</div>
            <div><b>Size:</b> {preview.meta && preview.meta.sizeBytes} <b>Checksum:</b> {preview.meta && preview.meta.checksum}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btnStyle }} onClick={() => handleLoad(undefined, preview)}>Load</button>
            <button style={{ ...btnStyle }} onClick={() => downloadJson(`${preview.name || 'snapshot'}.casecon.snapshot.json`, preview)}>Download</button>
            <button style={{ ...btnStyle }} onClick={() => setPreview(null)}>Close</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Server Snapshots</h3>
        <button style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }} onClick={loadList} disabled={loading}>Refresh</button>
      </div>
      <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ background: '#fafafa' }}>
            <tr>
              <th style={{ textAlign: 'left', padding: 8 }}>Name</th>
              <th style={{ textAlign: 'left', padding: 8 }}>CreatedBy</th>
              <th style={{ textAlign: 'left', padding: 8 }}>CreatedAt</th>
              <th style={{ textAlign: 'left', padding: 8 }}>AppVersion</th>
              <th style={{ textAlign: 'right', padding: 8 }}>Size</th>
              <th style={{ textAlign: 'left', padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: '#777' }}>No snapshots on server or server unavailable.</td>
              </tr>
            )}
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td style={{ padding: 8 }}>{s.name || s.id}</td>
                <td style={{ padding: 8 }}>{s.createdBy || ''}</td>
                <td style={{ padding: 8 }}>{s.createdAt || ''}</td>
                <td style={{ padding: 8 }}>{s.appVersion || ''}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{typeof s.sizeBytes === 'number' ? s.sizeBytes.toLocaleString() : ''}</td>
                <td style={{ padding: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button style={{ ...btnStyle }} onClick={() => handleDownload(s.id)}>Download</button>
                    <button style={{ ...btnStyle }} onClick={() => handleLoad(s.id)}>Load</button>
                    <button style={{ ...btnStyle }} onClick={() => setPreview({ id: s.id, ...s })}>Preview</button>
                    <button style={{ ...btnStyle }} onClick={() => handleDelete(s.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, color: '#666' }}>
        {showDevInfo && (
          <>Notes: This panel avoids touching existing code. For full fidelity, expose snapshotProviders/uiProvider/applySnapshot via window.CaseCon.</>
        )}
      </p>
    </div>
  );
}
