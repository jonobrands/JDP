// NameIDRegistryPanel.js
// Purpose: Assign and manage permanent unique IDs for names across BUCA and JOVIE datasets.
// Pluggable, robust, and UI/logic as per user requirements.

import React, { useState, useEffect } from 'react';
import { useExchangeStore } from '../store/exchangeStore';
import { saveNameIdMap, fetchNameIdMap } from "../utils/uidRegistrySync";
import { purgeNameIdMap } from "../utils/uidRegistrySync";
import { isBackendAvailable } from "../utils/uidRegistrySync";
// Ensure persistence utility is available globally for panel actions
if (typeof window !== "undefined") window.saveNameIdMap = saveNameIdMap;

// Helper: Normalize name for matching (case/space insensitive)
function normalizeName(name) {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Helper: Generate next UID string
function getNextUID(existingIDs, source = "MAST") {
  let max = 0;
  existingIDs.forEach(id => {
    const match = id.match(/UID-(\d+)-/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  const nextNum = String(max + 1).padStart(4, "0");
  return `UID-${nextNum}-${source}`;
}

export default function NameIDRegistryPanel({
  bucaNames = [],
  jovieNames = [],
  bucaCaregivers = [],
  jovieCaregivers = [],
  initialNameMap = {},
  onNameMapChange,
  showIDs = true,
  allowAdmin = true,
}) {
  
  // --- All state hooks must be defined before any return ---
  const [nameMap, setNameMap] = useState(initialNameMap); // { type:normalizedName: UID }
  const [entityType, setEntityType] = useState('client'); // 'client' or 'caregiver'
  const exchange = useExchangeStore();
  // Subscribe to channels for reactive live data lists
  const channels = useExchangeStore(state => state.channels);

  // Only initialize nameMap from initialNameMap on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Auto-load from backend/localStorage; fall back to initialNameMap
        const loaded = await fetchNameIdMap().catch(() => initialNameMap || {});
        if (!mounted) return;
        setNameMap(loaded);
        onNameMapChange && onNameMapChange(loaded);
        // Persist locally and publish to exchange
        try { window.saveNameIdMap && window.saveNameIdMap(loaded); } catch {}
        try { exchange.publish('uids', { map: loaded, loadedAt: new Date().toISOString() }); } catch {}
        setMapLoaded(true);
      } catch {
        // Fallback to initial map if everything else fails
        if (!mounted) return;
        setNameMap(initialNameMap || {});
        setMapLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const [oldName, setOldName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [assignedList, setAssignedList] = useState([]); // [{names: [..], uid, sources: Set}]
  const [searchAssigned, setSearchAssigned] = useState("");
  const [searchBuca, setSearchBuca] = useState("");
  const [searchJovie, setSearchJovie] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [backendOnline, setBackendOnline] = useState(null); // null = unknown, true/false after check

  // Publish name map updates to exchange 'uids' channel
  useEffect(() => {
    try {
      exchange.publish('uids', { map: nameMap, updatedAt: new Date().toISOString() });
    } catch (e) {
      // no-op
    }
  }, [nameMap]);

  // Backend availability monitor (lightweight poll)
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const ok = await isBackendAvailable();
        if (!cancelled) setBackendOnline(ok);
      } catch {
        if (!cancelled) setBackendOnline(false);
      }
    }
    check();
    const id = setInterval(check, 15000); // check every 15s
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Key helpers for registry
  const registryKey = (name) => `${entityType}:${normalizeName(name)}`;
  const filterType = (k) => k.startsWith(entityType+':');

  // Alias support: generate common variants so future live data resolves to the same UID
  const generateAliases = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return [];
    const base = normalizeName(s);
    const aliases = new Set([base]);
    // Variants: remove hyphens, dots, apostrophes
    const dePunct = base.replace(/[\-\.']/g, ' ');
    aliases.add(dePunct);
    aliases.add(dePunct.replace(/\s+/g, ''));
    // Collapsed spaces
    aliases.add(base.replace(/\s+/g, ' '));
    // Handle quoted nicknames: e.g., Brittany "Tazz" Bentley
    const m = base.match(/"([^"]+)"/);
    if (m) {
      const nickname = m[1].toLowerCase().trim();
      let unquoted = base.replace(/"[^"]+"/g, '').replace(/\s+/g, ' ').trim();
      if (unquoted) aliases.add(unquoted);
      const parts = unquoted.split(/\s+/).filter(Boolean);
      const lastName = parts[parts.length - 1];
      if (lastName) aliases.add(`${nickname} ${lastName}`.trim());
      aliases.add(nickname);
    }
    // Truncated variant: drop last token for multi-word names
    const tokens = base.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      aliases.add(tokens.slice(0, -1).join(' '));
    }
    // Additional punctuation stripped (commas/quotes/periods)
    const noPunct = base.replace(/[",\.]/g, '').replace(/\s+/g, ' ').trim();
    if (noPunct) aliases.add(noPunct);
    return Array.from(aliases).filter(Boolean);
  };

  function aliasUIDFromMap(map, name) {
    const norms = generateAliases(name).map(n => normalizeName(n));
    const keys = [];
    norms.forEach(n => {
      keys.push(`client:${n}`);
      keys.push(`caregiver:${n}`);
    });
    let found = [];
    for (const k of keys) {
      const uid = map[k];
      if (uid) found.push(uid);
    }
    if (found.length === 0) return null;
    const isM = (u) => typeof u === 'string' && /-MAST$/.test(u);
    return found.find(isM) || found[0];
  }

  function applyAliasMappings(map, name, uid) {
    const out = { ...map };
    const aliases = generateAliases(name);
    aliases.forEach(a => {
      const n = normalizeName(a);
      out[`client:${n}`] = uid;
      out[`caregiver:${n}`] = uid;
    });
    return out;
  }

  // Utility: unique names (case/space insensitive) while preserving first occurrence
  function uniqueByNormalized(list) {
    const seen = new Set();
    const out = [];
    for (const n of list || []) {
      const norm = normalizeName(n);
      if (!seen.has(norm)) {
        seen.add(norm);
        out.push(n);
      }
    }
    return out;
  }

  // Derive a display name from a normalized key by checking current source data; fallback to title-casing the normalized string
  function displayNameForNormalized(norm) {
    const searchLists = [
      ...(entityType === 'client' ? [bucaNames, jovieNames] : [bucaCaregivers, jovieCaregivers])
    ];
    for (const lst of searchLists) {
      const match = (lst || []).find(n => normalizeName(n) === norm);
      if (match) return match;
    }
    // Title-case fallback
    return norm.split(' ').filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  }

  // Show only names with temporary source IDs per pane
  const isTempBuca = (uid) => typeof uid === 'string' && /-BUCA$/.test(uid);
  const isTempJovie = (uid) => typeof uid === 'string' && /-JOVIE$/.test(uid);

  // Build live-only name arrays from exchange channels instead of props
  function extractNamesFromChannel(channel, type) {
    const rows = channel?.rows || [];
    if (type === 'client') {
      return rows.map(r => r?.client).filter(Boolean);
    } else {
      const out = [];
      rows.forEach(r => {
        if (!r?.caregiver) return;
        if (Array.isArray(r.caregiver)) {
          r.caregiver.forEach(item => {
            if (!item) return;
            if (typeof item === 'string') { out.push(item); }
            else if (typeof item === 'object' && item.name) { out.push(String(item.name)); }
          });
        } else if (typeof r.caregiver === 'object' && r.caregiver.name) {
          out.push(String(r.caregiver.name));
        } else {
          String(r.caregiver || '').split(',').map(s => s.trim()).forEach(v => v && out.push(v));
        }
      });
      return out;
    }
  }
  const bucaFromChannels = extractNamesFromChannel(channels?.buca, entityType) || [];
  const jovieFromChannels = extractNamesFromChannel(channels?.jovie, entityType) || [];
  const bucaFromProps = entityType === 'client' ? (bucaNames || []) : (bucaCaregivers || []);
  const jovieFromProps = entityType === 'client' ? (jovieNames || []) : (jovieCaregivers || []);
  const allBucaNames = uniqueByNormalized((bucaFromChannels.length ? bucaFromChannels : bucaFromProps));
  const allJovieNames = uniqueByNormalized((jovieFromChannels.length ? jovieFromChannels : jovieFromProps));
  useEffect(() => {
    console.debug('[UIDRegistry] Derived BUCA live names', {
      entityType,
      fromChannelsCount: bucaFromChannels.length,
      fromPropsCount: bucaFromProps.length,
      finalCount: allBucaNames.length,
    });
    console.debug('[UIDRegistry] Derived JOVIE live names', {
      entityType,
      fromChannelsCount: jovieFromChannels.length,
      fromPropsCount: jovieFromProps.length,
      finalCount: allJovieNames.length,
    });
    // no deps on arrays themselves to avoid noise; entityType is sufficient for visibility
  }, [entityType]);

  // NOTE: Side panes should reflect only LIVE data from BUCA/JOVIE (no registry fallback)

  // Union: source-derived + registry-derived, de-duplicated by normalized name
  function dedupeItems(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const norm = normalizeName(it.name);
      if (!seen.has(norm)) { seen.add(norm); out.push(it); }
    }
    return out;
  }

  const bucaTempList = dedupeItems([
    ...allBucaNames
      .map(name => ({ name, uid: nameMap[registryKey(name)] }))
      .filter(it => isTempBuca(it.uid)),
  ]).filter(it => it.name.toLowerCase().includes(searchBuca.toLowerCase()));

  const jovieTempList = dedupeItems([
    ...allJovieNames
      .map(name => ({ name, uid: nameMap[registryKey(name)] }))
      .filter(it => isTempJovie(it.uid)),
  ]).filter(it => it.name.toLowerCase().includes(searchJovie.toLowerCase()));

  // Assigned list: show ALL names/UIDs in the registry, regardless of current BUCA/JOVIE data
  useEffect(() => {
    // Build a map of UID -> all names (from nameMap) for the selected entityType
    const uidToNames = {};
    Object.entries(nameMap).forEach(([key, uid]) => {
      if (!filterType(key)) return;
      if (!uidToNames[uid]) uidToNames[uid] = new Set();
      uidToNames[uid].add(key.split(':')[1]);
    });
    // Precompute original-cased lookups from live data (channels preferred) falling back to props
    const jovieOriginals = (jovieFromChannels.length ? jovieFromChannels : jovieFromProps) || [];
    const bucaOriginals = (bucaFromChannels.length ? bucaFromChannels : bucaFromProps) || [];

    // For display, order names so that the canonical (prefer JOVIE, then BUCA) is first
    const assigned = Object.entries(uidToNames).map(([uid, namesSet]) => {
      const norms = Array.from(namesSet);
      // Find first JOVIE original that matches any of the norms
      const jovieCanon = jovieOriginals.find(orig => norms.includes(normalizeName(orig)));
      // Else first BUCA original
      const bucaCanon = bucaOriginals.find(orig => norms.includes(normalizeName(orig)));
      const canonical = jovieCanon || bucaCanon || null;
      // Build ordered unique display list: canonical (if any) followed by the rest title-cased where needed
      const ordered = [];
      if (canonical) ordered.push(canonical);
      norms.forEach(n => {
        const fromJovie = jovieOriginals.find(orig => normalizeName(orig) === n);
        const fromBuca = bucaOriginals.find(orig => normalizeName(orig) === n);
        const disp = fromJovie || fromBuca || displayNameForNormalized(n);
        if (!ordered.some(x => normalizeName(x) === normalizeName(disp))) {
          ordered.push(disp);
        }
      });
      return { uid, names: ordered };
    });
    setAssignedList(assigned);
  }, [nameMap, entityType]);

  // --- Responsive/Card Layout Wrapper ---
  // The rest of the code remains unchanged...
  
  // Remove mapping for a name (by UID)
  function handleDeleteMapping(uid) {
    setNameMap(prev => {
      const newMap = { ...prev };
      Object.keys(newMap).forEach(n => {
        if (newMap[n] === uid) delete newMap[n];
      });
      // Persist immediately
      window.saveNameIdMap && window.saveNameIdMap(newMap);
      onNameMapChange && onNameMapChange(newMap);
      return newMap;
    });
  }

  // Save/export as JSON (and publish) — attempts backend sync first
  async function handleSave() {
    try {
      // Try backend save
      let synced = false;
      try {
        synced = await saveNameIdMap(nameMap);
      } catch {}

      // Always offer a local export as a backup
      const blob = new Blob([JSON.stringify(nameMap, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'name_id_map.json';
      a.click();

      // publish updated map to exchange (uids)
      try { exchange.publish('uids', { map: nameMap, savedAt: new Date().toISOString(), backend: synced }); } catch {}

      setSaveMsg(synced ? 'Saved to backend and exported JSON' : 'Backend unavailable — saved locally and exported JSON');
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (e) {
      setSaveMsg('Error saving');
      setTimeout(() => setSaveMsg(""), 2500);
    }
  }

  // Admin: purge registry locally and backend (if available)
  async function handlePurge() {
    try {
      await purgeNameIdMap();
      const empty = {};
      setNameMap(empty);
      onNameMapChange && onNameMapChange(empty);
      try { window.saveNameIdMap && window.saveNameIdMap(empty); } catch {}
      try { exchange.publish('uids', { map: empty, purgedAt: new Date().toISOString() }); } catch {}
      setSaveMsg("Registry purged");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg("Error purging registry");
      setTimeout(() => setSaveMsg(""), 2000);
    }
  }

  // (Auto-load on mount; manual load removed)

  // Assign or merge UID logic (fixed for entity type)
  function handleAssignUID() {
    const oldNorm = normalizeName(oldName);
    const prefNorm = normalizeName(preferredName);
    if (!oldNorm || !prefNorm) return;
    const oldKey = registryKey(oldName);
    const prefKey = registryKey(preferredName);
    // If either name already has a UID, use/merge it (manual flow must end as MAST)
    const existingUIDs = [nameMap[oldKey], nameMap[prefKey]].filter(Boolean);
    const isMaster = (uid) => typeof uid === 'string' && /-MAST$/.test(uid);
    let uid;
    // Only consider UIDs for this entityType
    const allUIDs = Object.entries(nameMap)
      .filter(([k, v]) => filterType(k))
      .map(([k, v]) => v);
    if (existingUIDs.length > 0) {
      // If any is already MAST, use that as the target
      const mast = existingUIDs.find(isMaster);
      if (mast) {
        uid = mast;
        setNameMap(prev => {
          let newMap = { ...prev };
          newMap[oldKey] = uid;
          newMap[prefKey] = uid;
          // Apply aliases for future resolution
          newMap = applyAliasMappings(newMap, oldName, uid);
          newMap = applyAliasMappings(newMap, preferredName, uid);
          window.saveNameIdMap && window.saveNameIdMap(newMap);
          onNameMapChange && onNameMapChange(newMap);
          return newMap;
        });
      } else if (existingUIDs.length === 2 && existingUIDs[0] !== existingUIDs[1]) {
        // Two different temp UIDs -> create a new MAST and remap both
        const newMast = getNextUID(allUIDs, 'MAST');
        setNameMap(prev => {
          let newMap = { ...prev };
          const [u1, u2] = existingUIDs;
          Object.keys(newMap).forEach(k => {
            if (filterType(k) && (newMap[k] === u1 || newMap[k] === u2)) newMap[k] = newMast;
          });
          newMap[oldKey] = newMast;
          newMap[prefKey] = newMast;
          newMap = applyAliasMappings(newMap, oldName, newMast);
          newMap = applyAliasMappings(newMap, preferredName, newMast);
          window.saveNameIdMap && window.saveNameIdMap(newMap);
          onNameMapChange && onNameMapChange(newMap);
          return newMap;
        });
      } else {
        // Exactly one temp UID -> promote to MAST and assign both
        const newMast = getNextUID(allUIDs, 'MAST');
        const temp = existingUIDs[0];
        setNameMap(prev => {
          let newMap = { ...prev };
          Object.keys(newMap).forEach(k => {
            if (filterType(k) && newMap[k] === temp) newMap[k] = newMast;
          });
          newMap[oldKey] = newMast;
          newMap[prefKey] = newMast;
          newMap = applyAliasMappings(newMap, oldName, newMast);
          newMap = applyAliasMappings(newMap, preferredName, newMast);
          window.saveNameIdMap && window.saveNameIdMap(newMap);
          onNameMapChange && onNameMapChange(newMap);
          return newMap;
        });
      }
    } else {
      // Neither name has a UID yet -> create a new MAST UID
      uid = getNextUID(allUIDs, 'MAST');
      setNameMap(prev => {
        let newMap = {
          ...prev,
          [oldKey]: uid,
          [prefKey]: uid,
        };
        newMap = applyAliasMappings(newMap, oldName, uid);
        newMap = applyAliasMappings(newMap, preferredName, uid);
        window.saveNameIdMap && window.saveNameIdMap(newMap);
        onNameMapChange && onNameMapChange(newMap);
        return newMap;
      });
    }
    setOldName("");
    setPreferredName("");
  }

  // Process data from either BUCA or JOVIE
  const processDataSource = (data, source) => {
    if (!mapLoaded) {
      // Defer processing until the persisted map is loaded to avoid clobbering assignments on remount
      return false;
    }
    console.log(`Processing ${source} data:`, data);
    
    if (!data?.rows?.length) {
      console.log(`No rows in ${source} data`);
      return false;
    }
    
    try {
      // Extract names based on entity type and source
      const names = [];
      
      if (source === 'buca') {
        if (entityType === 'client') {
          data.rows.forEach(row => row.client && names.push(row.client));
        } else {
          data.rows.forEach(row => {
            if (!row.caregiver) return;
            if (Array.isArray(row.caregiver)) {
              row.caregiver.forEach(item => {
                if (!item) return;
                if (typeof item === 'string') names.push(item);
                else if (typeof item === 'object' && item.name) names.push(String(item.name));
              });
            } else if (typeof row.caregiver === 'object' && row.caregiver.name) {
              names.push(String(row.caregiver.name));
            } else {
              String(row.caregiver || '').split(',').map(s => s.trim()).forEach(v => v && names.push(v));
            }
          });
        }
      } else if (source === 'jovie') {
        if (entityType === 'client') {
          data.rows.forEach(row => row.client && names.push(row.client));
        } else {
          data.rows.forEach(row => {
            if (!row.caregiver) return;
            if (Array.isArray(row.caregiver)) {
              row.caregiver.forEach(item => {
                if (!item) return;
                if (typeof item === 'string') names.push(item);
                else if (typeof item === 'object' && item.name) names.push(String(item.name));
              });
            } else if (typeof row.caregiver === 'object' && row.caregiver.name) {
              names.push(String(row.caregiver.name));
            } else {
              String(row.caregiver || '').split(',').map(s => s.trim()).forEach(v => v && names.push(v));
            }
          });
        }
      }

      console.log(`Extracted ${names.length} ${entityType} names from ${source}:`, names);
      
      if (names.length === 0) {
        console.log(`No valid ${entityType} names found in ${source} data`);
        return false;
      }

      const updated = { ...nameMap };
      let changed = false;

      // Build a running set of existing UIDs for this entityType so we issue sequential IDs per batch
      const usedUIDs = new Set(
        Object.entries(updated)
          .filter(([k]) => filterType(k))
          .map(([, v]) => v)
      );

      // Helper flags
      const isMaster = (uid) => typeof uid === 'string' && /-MAST$/.test(uid);
      const otherSource = source === 'buca' ? 'jovie' : source === 'jovie' ? 'buca' : null;
      // Build set of names present in the other source for this entityType (if available)
      const otherData = otherSource ? useExchangeStore.getState().channels?.[otherSource] : null;
      const otherNames = new Set(
        (otherData?.rows || [])
          .flatMap(row => {
            if (entityType === 'client') return row.client ? [row.client] : [];
            if (row.caregiver) return Array.isArray(row.caregiver) ? row.caregiver : String(row.caregiver || '').split(',').map(s => s.trim());
            return [];
          })
          .map(n => normalizeName(n))
      );

      const srcCode = source === 'buca' ? 'BUCA' : source === 'jovie' ? 'JOVIE' : 'MAST';
      const hasAnyMasterForType = Array.from(usedUIDs).some(u => isMaster(u));

      names.forEach(name => {
        const normName = normalizeName(name);
        const key = `${entityType}:${normName}`;
        const exists = updated[key];
        // Check for any alias-based UID (prefer MAST) regardless of current exists value
        const aliasUid = aliasUIDFromMap(updated, name);

        // If already assigned to a MAST, do nothing
        if (exists && isMaster(exists)) {
          return;
        }

        // If alias exists and points to a UID (preferably MAST), adopt it
        if (aliasUid) {
          if (!exists || (!isMaster(exists) && exists !== aliasUid)) {
            updated[key] = aliasUid;
            changed = true;
            return;
          }
        }

        // Never change entries that already have a MAST UID
        if (exists && isMaster(exists)) {
          return;
        }

        // If it already exists and is temp (BUCA/JOVIE) but counterpart now exists in other source, promote/merge to MAST
        if (exists && !isMaster(exists) && otherNames.has(normName)) {
          const masterUid = getNextUID(usedUIDs, 'MAST');
          // Remap all entries with this UID (and also check if opposite temp exists) to master
          Object.keys(updated).forEach(k => {
            if (filterType(k) && updated[k] === exists) updated[k] = masterUid;
          });
          updated[key] = masterUid;
          usedUIDs.add(masterUid);
          changed = true;
          return;
        }

        // If not yet assigned
        if (!exists) {
          if (otherNames.has(normName)) {
            // Both sources have the same name: assign MAST immediately
            const masterUid = getNextUID(usedUIDs, 'MAST');
            updated[key] = masterUid;
            usedUIDs.add(masterUid);
            changed = true;
            console.log('Assigned MAST UID (both sources present):', { name, key, uid: masterUid });
          } else {
            // Only present in this source: assign a temporary source UID so it appears in the live pane
            const tempUid = getNextUID(usedUIDs, srcCode);
            updated[key] = tempUid;
            usedUIDs.add(tempUid);
            changed = true;
            console.log('Assigned temporary UID:', { name, key, uid: tempUid });
          }
        }
      });

      if (changed) {
        console.log('Updating name map with changes from', source);
        setNameMap(updated);
        onNameMapChange?.(updated);
        window.saveNameIdMap?.(updated);
        return true;
      } else {
        console.log('No changes to name map from', source);
        return false;
      }
    } catch (error) {
      console.error(`Error processing ${source} data:`, error);
      return false;
    }
  };

  // Subscribe to BUCA and JOVIE data from exchange store (Zustand subscribe API)
  useEffect(() => {
    console.log('Setting up exchange subscriptions for entityType:', entityType);

    // Process any existing data already in the channels on mount/when entityType changes
    try {
      if (mapLoaded) {
        const { channels } = useExchangeStore.getState();
        if (channels?.buca) processDataSource(channels.buca, 'buca');
        if (channels?.jovie) processDataSource(channels.jovie, 'jovie');
      }
    } catch (e) {
      console.warn('Failed to process initial exchange channels:', e);
    }

    // Subscribe to store changes and react only when the specific channel changes
    const unsubscribe = useExchangeStore.subscribe((state, prevState) => {
      try {
        if (!mapLoaded) return;
        if (state.channels?.buca !== prevState.channels?.buca && state.channels?.buca) {
          processDataSource(state.channels.buca, 'buca');
        }
        if (state.channels?.jovie !== prevState.channels?.jovie && state.channels?.jovie) {
          processDataSource(state.channels.jovie, 'jovie');
        }
      } catch (e) {
        console.warn('Error handling exchange update:', e);
      }
    });
    return () => unsubscribe();
  }, [entityType, mapLoaded]);

  // Also reactively process live channel data when it changes (handles cases where rows update without channel object replacement)
  useEffect(() => {
    try {
      if (channels?.buca) processDataSource(channels.buca, 'buca');
    } catch (e) { /* no-op */ }
  }, [channels?.buca, entityType]);

  useEffect(() => {
    try {
      if (channels?.jovie) processDataSource(channels.jovie, 'jovie');
    } catch (e) { /* no-op */ }
  }, [channels?.jovie, entityType]);

  return (
    <div className="flex justify-center w-full min-h-[80vh] items-start">
      <div className="w-full max-w-3xl bg-white shadow-xl rounded-2xl p-8 mt-8 mb-8 border border-gray-200">
        <h2 className="text-2xl font-bold mb-6 text-center text-blue-800 tracking-tight">UID Registry</h2>
        {/* --- Entity Type Toggle --- */}
        <div className="flex justify-center mb-6">
          <button className={`px-4 py-2 rounded-l ${entityType==='client' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`} onClick={()=>setEntityType('client')}>Clients</button>
          <button className={`px-4 py-2 rounded-r ${entityType==='caregiver' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`} onClick={()=>setEntityType('caregiver')}>Caregivers</button>
        </div>
        {/* --- Main Grid --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-700">BUCA Names</label>
            <input
              className="mb-1 w-full border px-1 text-xs rounded focus:ring-2 focus:ring-blue-200"
              placeholder="Search..."
              value={searchBuca}
              onChange={e => setSearchBuca(e.target.value)}
            />
            <ul id="nameid-buca-list" className="border rounded h-40 overflow-y-auto bg-gray-50 text-sm">
              {bucaTempList.map(({ name, uid }, i) => (
                <li
                  key={name + i}
                  className={`px-2 py-1 cursor-pointer hover:bg-orange-100 ${oldName === name ? "bg-orange-200" : ""}`}
                  onClick={() => setOldName(name)}
                  title={name}
                >
                  <span className="truncate inline-block max-w-[75%] align-middle" title={name}>{name}</span>
                  {uid && <span className="text-gray-400 ml-2 text-xs align-middle">[{uid}]</span>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-700">JOVIE Names</label>
            <input
              className="mb-1 w-full border px-1 text-xs rounded focus:ring-2 focus:ring-blue-200"
              placeholder="Search..."
              value={searchJovie}
              onChange={e => setSearchJovie(e.target.value)}
            />
            <ul id="nameid-jovie-list" className="border rounded h-40 overflow-y-auto bg-gray-50 text-sm">
              {jovieTempList.map(({ name, uid }, i) => (
                <li
                  key={name + i}
                  className={`px-2 py-1 cursor-pointer hover:bg-green-100 ${preferredName === name ? "bg-green-200" : ""}`}
                  onClick={() => setPreferredName(name)}
                  title={name}
                >
                  <span className="truncate inline-block max-w-[75%] align-middle" title={name}>{name}</span>
                  {uid && <span className="text-gray-400 ml-2 text-xs align-middle">[{uid}]</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* --- Assignment Row --- */}
        <div className="flex flex-col md:flex-row gap-2 mb-4 items-center">
          <input
            id="nameid-old-input"
            className="border px-2 py-1 text-xs rounded flex-1 min-w-[120px]"
            placeholder="Old Name (BUCA)"
            value={oldName}
            onChange={e => setOldName(e.target.value)}
          />
          <span className="text-xl mx-2">→</span>
          <input
            id="nameid-preferred-input"
            className="border px-2 py-1 text-xs rounded flex-1 min-w-[120px]"
            placeholder="Preferred Name (JOVIE)"
            value={preferredName}
            onChange={e => setPreferredName(e.target.value)}
          />
          <button
            id="nameid-assign-btn"
            className="ml-2 px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            onClick={handleAssignUID}
            disabled={!oldName || !preferredName}
          >Assign ID</button>
        </div>
        <div id="nameid-preview-label" className="mb-4 text-xs text-gray-700 text-center min-h-[1.5em]">
          {oldName && preferredName ? `${oldName} → ${preferredName}` : "Select or enter names to assign an ID."}
        </div>
        {/* --- Assigned UIDs --- */}
        <div className="mb-6">
          <label className="block text-xs font-semibold mb-2 text-gray-700">Assigned Name IDs</label>
          {/* Search within assigned list */}
          <input
            className="mb-2 w-full border px-1 text-xs rounded focus:ring-2 focus:ring-blue-200"
            placeholder="Search assigned… (name or UID)"
            value={searchAssigned}
            onChange={e => setSearchAssigned(e.target.value)}
          />
          {(() => {
            const q = (searchAssigned || '').toLowerCase();
            const assignedFiltered = q
              ? assignedList.filter(({ names, uid }) => {
                  const text = `${(names || []).join(' ')} ${uid || ''}`.toLowerCase();
                  return text.includes(q);
                })
              : assignedList;
            const list = assignedFiltered;
            return (
              <ul id="nameid-id-list" className="border rounded bg-gray-50 max-h-48 overflow-y-auto divide-y divide-gray-200">
                {list.length === 0 && <li className="text-gray-400 italic px-2 py-1">No assignments yet</li>}
                {list.map(({ uid, names }, idx) => (
                  <li key={uid} className="flex items-center px-2 py-2">
                    <span className="flex-1 text-xs md:text-sm">
                      {names.join(" | ")}
                      {showIDs && <span className="text-gray-400 ml-2">[{uid}]</span>}
                    </span>
                    <button
                      id="nameid-delete-btn"
                      className="ml-2 text-red-500 hover:text-red-700 text-lg"
                      title="Delete all mappings for this ID"
                      onClick={() => handleDeleteMapping(uid)}
                    >🗑️</button>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
        <div className="flex flex-col md:flex-row gap-2 mt-2 items-center">
          <button
            id="nameid-save-btn"
            className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 w-full md:w-auto"
            onClick={handleSave}
          >Save Assignments</button>
          <span
            className={`text-xs px-2 py-1 rounded border w-full md:w-auto text-center ${backendOnline === null ? 'text-gray-500 border-gray-300' : backendOnline ? 'text-green-700 border-green-300 bg-green-50' : 'text-amber-700 border-amber-300 bg-amber-50'}`}
            title={backendOnline ? 'Backend connected: UID map will persist on server.' : 'Backend unavailable: falling back to local storage (map may be lost if cache is cleared).'}
          >
            {backendOnline === null ? 'Checking backend…' : backendOnline ? 'Synced to backend' : 'Local-only (not synced)'}
          </span>
          {allowAdmin && (
            <button
              id="nameid-purge-btn"
              className="px-4 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700 w-full md:w-auto"
              onClick={handlePurge}
            >Purge Registry</button>
          )}
        </div>
        {saveMsg && <div className="mt-2 text-green-700 text-xs text-center">{saveMsg}</div>}
        {allowAdmin && (
          <div className="mt-6 text-xs text-gray-500 text-center">
            <b>Admin:</b> All assignments are local only. You can export/import as JSON.<br/>
            <b>ID format:</b> UID-XXXX-SOURCE (MAST = both, BUCA, JOVIE).<br/>
            <b>Tip:</b> Use the search boxes to quickly find names.
          </div>
        )}
      </div>
    </div>
  );
}

