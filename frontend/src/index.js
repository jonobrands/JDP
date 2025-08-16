import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { getApiBase, getUidApiBase } from './api';
// Snapshot wiring: import module stores
import { useBucaStore } from './store/bucaStore';
import { useJovieStore } from './store/jovieStore';
import useCompareStore from './store/compareStore';
import { useTimeckStore } from './store/timeckStore';
import useBcasStore from './store/bcasStore';
import useReconStore from './store/reconStore';

// Initialize CaseCon snapshot providers/restorer on window before rendering
if (typeof window !== 'undefined') {
  const g = (window.CaseCon = window.CaseCon || {});

  // Wake backend on app open to spin up Render dyno
  (function wakeBackend() {
    try {
      const base = getApiBase();
      const uidBase = getUidApiBase();
      // Hit /health (no-cors so we don't block UI if backend is cold)
      if (base) {
        fetch(`${base}/health`, { method: 'GET', mode: 'no-cors' }).catch(() => {});
        // Light list call to ensure Flask app threads are live
        fetch(`${base}/api/snapshots`, { method: 'GET', mode: 'no-cors' }).catch(() => {});
      }
      if (uidBase) {
        fetch(uidBase, { method: 'GET', mode: 'no-cors' }).catch(() => {});
      }
      // Optional retry once after a short delay to finish waking if cold start
      setTimeout(() => {
        try {
          if (base) fetch(`${base}/health`, { method: 'GET', mode: 'no-cors' }).catch(() => {});
          if (uidBase) fetch(uidBase, { method: 'GET', mode: 'no-cors' }).catch(() => {});
        } catch {}
      }, 4000);
    } catch {}
  })();

  // Helper safe getters for each store
  const buca = () => useBucaStore.getState();
  const jovie = () => useJovieStore.getState();
  const compare = () => useCompareStore.getState();
  const timeck = () => useTimeckStore.getState();
  const bcas = () => useBcasStore.getState();
  const recon = () => useReconStore.getState();

  // Providers: each returns a namespaced object to merge into snapshot.stores
  const bucaProvider = async () => ({
    buca: {
      text: buca().bucaText || '',
      rows: Array.isArray(buca().bucaRows) ? buca().bucaRows : [],
      lastUpdated: buca().lastUpdated || null,
    },
  });

  const jovieProvider = async () => ({
    jovie: {
      text: jovie().jovieText || '',
      rows: Array.isArray(jovie().jovieRows) ? jovie().jovieRows : [],
    },
  });

  const compareProvider = async () => ({
    compare: {
      results: Array.isArray(compare().compareResults) ? compare().compareResults : [],
    },
  });

  const timeckProvider = async () => ({
    timeck: {
      editedValues: { ...(timeck().editedValues || {}) },
      deviationMessages: { ...(timeck().deviationMessages || {}) },
    },
  });

  const bcasProvider = async () => ({
    bcas: {
      tableRows: Array.isArray(bcas().bcasTableRows) ? bcas().bcasTableRows : [],
      editedResults: { ...(bcas().editedResults || {}) },
      confirmations: { ...(bcas().confirmations || {}) },
    },
  });

  const reconProvider = async () => ({
    recon: {
      editedResults: { ...(recon().editedResults || {}) },
    },
  });

  // Expose providers array
  g.snapshotProviders = [
    bucaProvider,
    jovieProvider,
    compareProvider,
    timeckProvider,
    bcasProvider,
    reconProvider,
  ];

  // UI provider: capture active tab index from DOM if available and any globals
  g.uiProvider = async () => {
    let activeTab;
    try {
      const selected = document.querySelector('[role="tab"][aria-selected="true"]');
      if (selected) {
        const idx = selected.getAttribute('data-tab-index') || selected.getAttribute('data-index');
        activeTab = idx ? Number(idx) : undefined;
      }
    } catch {}
    // Include any temporary session data, e.g., temp UIDs
    const temporary = {};
    if (window.__CASECON_TEMP_UIDS) {
      try {
        temporary.tempUids = window.__CASECON_TEMP_UIDS instanceof Map
          ? Object.fromEntries(window.__CASECON_TEMP_UIDS.entries())
          : { ...(window.__CASECON_TEMP_UIDS || {}) };
      } catch {}
    }
    return { ui: { activeTab }, temporary };
  };

  // Apply snapshot: restore each module store and temporary data
  g.applySnapshot = async (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    const stores = snapshot.stores || {};
    try {
      if (stores.buca) {
        const s = stores.buca;
        if (typeof s.text === 'string') buca().setBucaText(s.text);
        if (Array.isArray(s.rows)) buca().setBucaRows(s.rows);
      }
      if (stores.jovie) {
        const s = stores.jovie;
        if (typeof s.text === 'string') jovie().setJovieText(s.text);
        if (Array.isArray(s.rows)) jovie().setJovieRows(s.rows);
      }
      if (stores.compare) {
        const s = stores.compare;
        if (Array.isArray(s.results)) compare().setCompareResults(s.results);
      }
      if (stores.timeck) {
        const s = stores.timeck;
        if (s.editedValues) timeck().setEditedValues(s.editedValues);
        if (s.deviationMessages) timeck().setDeviationMessages(s.deviationMessages);
      }
      if (stores.bcas) {
        const s = stores.bcas;
        if (Array.isArray(s.tableRows)) bcas().setBcasTableRows(s.tableRows);
        if (s.editedResults) bcas().setEditedResults(s.editedResults);
        if (s.confirmations) bcas().setConfirmations(s.confirmations);
      }
      if (stores.recon) {
        const s = stores.recon;
        if (s.editedResults) recon().setEditedResults(s.editedResults);
      }
      // Temporary/globals
      const tmp = (snapshot.temporary || {});
      if (tmp.tempUids) {
        try {
          // Store as plain object; modules that use it can map to Map as needed
          window.__CASECON_TEMP_UIDS = { ...tmp.tempUids };
        } catch {}
      }
      // Notify app that snapshot has been applied so it can adjust UI and kick off derived work
      const ui = snapshot.ui || {};
      setTimeout(() => {
        try {
          const evt = new CustomEvent('casecon:snapshot-applied', { detail: { snapshot, ui } });
          window.dispatchEvent(evt);
        } catch {}
      }, 0);
    } catch (e) {
      console.error('applySnapshot failed:', e);
      throw e;
    }
  };

  // App version accessor
  g.getAppVersion = () => (process.env.REACT_APP_VERSION || 'dev');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
