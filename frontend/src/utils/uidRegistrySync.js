// UID Registry Sync Utility
// Handles online/offline fallback for UID assignments

import { getUidApiBase } from '../api';
const getBase = () => getUidApiBase();
const LOCAL_KEY = 'nameIdMap';
const QUEUE_KEY = 'nameIdMapQueue';

// Check if backend is reachable
export async function isBackendAvailable() {
  try {
    const res = await fetch(getBase(), { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Not OK');
    return true;
  } catch (e) {
    return false;
  }
}

// Fetch all UID mappings (tries backend, falls back to localStorage)
export async function fetchNameIdMap() {
  if (await isBackendAvailable()) {
    const res = await fetch(getBase());
    if (!res.ok) throw new Error('Failed to fetch from backend');
    const data = await res.json();
    // Save to localStorage as backup
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    return data;
  } else {
    // Fallback
    const local = window.localStorage.getItem(LOCAL_KEY);
    return local ? JSON.parse(local) : {};
  }
}

// Save or update UID mapping (tries backend, falls back to localStorage+queue)
export async function saveNameIdMap(nameIdMap) {
  if (await isBackendAvailable()) {
    // Try to sync any queued changes first
    await syncQueuedChanges();
    // Save current map
    await fetch(getBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nameIdMap)
    });
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(nameIdMap));
    return true;
  } else {
    // Save locally and queue for sync
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(nameIdMap));
    queueChange(nameIdMap);
    return false;
  }
}

// Queue unsynced changes
function queueChange(map) {
  let queue = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]');
  queue.push(map);
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Sync any queued changes to backend
export async function syncQueuedChanges() {
  let queue = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]');
  if (queue.length === 0) return;
  for (const map of queue) {
    await fetch(getBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(map)
    });
  }
  window.localStorage.removeItem(QUEUE_KEY);
}

// Utility: listen for online event and try to sync
export function setupOnlineSync() {
  window.addEventListener('online', () => {
    syncQueuedChanges();
  });
}

// Purge the registry entirely (local and backend if available)
export async function purgeNameIdMap() {
  const empty = {};
  const backend = await isBackendAvailable();
  try {
    if (backend) {
      await fetch(getBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(empty)
      });
    }
  } catch (e) {
    // If backend purge fails, still clear local below
  }
  try {
    window.localStorage.removeItem(LOCAL_KEY);
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {}
  return true;
}

// Best-effort enrichment using UID registry
// For now, this is a safe passthrough so callers can rely on the function existing
// without breaking when the backend map format or connectivity is not guaranteed.
export async function enrichWithUIDs(rows = [], _sideLabel = '') {
  try {
    // In future, we can fetch the nameIdMap and merge resolved UIDs here.
    // const map = await fetchNameIdMap();
    // TODO: enrich rows using map
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return Array.isArray(rows) ? rows : [];
  }
}
