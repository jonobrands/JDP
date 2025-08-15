import React, { useState, useRef } from 'react';


export default function ComparePanel({
  onCompare, onClearResults, onExport, rows = []
}) {
  const [showUIDs, setShowUIDs] = useState(false);

  const pick = (obj, keys) => {
    for (const k of keys) {
      if (obj && obj[k]) return obj[k];
    }
    return '';
  };
  const getClientUID = (row) => pick(row, ['clientUID','client_uid','clientId','client_id','clientUid']);
  const getCaregiverUID = (row) => pick(row, ['caregiverUID','caregiver_uid','caregiverId','caregiver_id','caregiverUid']);

  // Normalize strings for robust equality checks
  const normalize = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  // Field alias lists for extracting BUCA/JOVIE caregivers on consolidated BOTH rows
  const BUCA_CG_KEYS = [
    'bucaCaregiver','BUCA_caregiver','buca_caregiver','bucaCG','buca_cg','bucaCaregiverName','bucaCaregiver1','caregiver_buca','BUCA_CG'
  ];
  const JOVIE_CG_KEYS = [
    'jovieCaregiver','JOVIE_caregiver','jovie_caregiver','jovieCG','jovie_cg','jovieCaregiverName','jovieCaregiver1','caregiver_jovie','JOVIE_CG'
  ];
  // UID alias lists per portal on BOTH rows (MAST-based only)
  const BUCA_CG_UID_KEYS = [
    'bucaCaregiverUID','buca_caregiver_uid','BUCA_caregiver_uid','bucaCaregiverId','buca_caregiver_id','BUCA_CG_UID','caregiver_uid_buca','caregiverUidBuca'
  ];
  const JOVIE_CG_UID_KEYS = [
    'jovieCaregiverUID','jovie_caregiver_uid','JOVIE_caregiver_uid','jovieCaregiverId','jovie_caregiver_id','JOVIE_CG_UID','caregiver_uid_jovie','caregiverUidJovie'
  ];
  const normUid = (u) => (u || '').toString().trim().toUpperCase();
  const normalizeName = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
  // Canonicalize names to reduce false mismatches on common nicknames when UIDs are missing
  const firstNameAlias = {
    'SAM': 'SAMANTHA',
    'MIKE': 'MICHAEL',
    'DAVE': 'DAVID',
    'KATE': 'KATHERINE',
    'KATIE': 'KATHERINE',
    'LIZ': 'ELIZABETH',
    'BETH': 'ELIZABETH',
    'JEN': 'JENNIFER',
    'JESS': 'JESSICA',
    'ALEX': 'ALEXANDER',
    'ABBY': 'ABIGAIL',
    'TOM': 'THOMAS'
  };
  const canonicalizeFullName = (full) => {
    const n = normalizeName(full);
    if (!n) return n;
    const parts = n.split(' ');
    if (parts.length === 0) return n;
    const first = parts[0];
    const rest = parts.slice(1).join(' ');
    const mappedFirst = firstNameAlias[first] || first;
    return [mappedFirst, rest].filter(Boolean).join(' ').trim();
  };
  // Safer comparison: only alias first name when the remainder (last name and beyond) matches exactly
  const namesEqualByFallback = (a, b) => {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return na === nb;
    if (na === nb) return true;
    const pa = na.split(' ');
    const pb = nb.split(' ');
    const firstA = pa[0] || '';
    const firstB = pb[0] || '';
    const restA = pa.slice(1).join(' ');
    const restB = pb.slice(1).join(' ');
    if (restA !== restB) return false;
    const mapA = firstNameAlias[firstA] || firstA;
    const mapB = firstNameAlias[firstB] || firstB;
    return mapA === mapB;
  };

  // Session-only temporary UID assignment (tracking only, not displayed, not used for matching)
  const sessionIdRef = useRef(() => {
    // Lightweight session id: yyyymmdd + random 4 chars
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    return `${ymd}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  });
  const sessionId = typeof sessionIdRef.current === 'function' ? (sessionIdRef.current = sessionIdRef.current()) : sessionIdRef.current;
  const tempUidMapRef = useRef(new Map());
  const stableKey = (side, client, caregiver) => `${side}|${normalizeName(client)}|${normalizeName(caregiver)}`;
  const shortHash = (s) => {
    let h = 0; for (let i=0;i<s.length;i++){ h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(36).toUpperCase().slice(0,6);
  };
  const getTempUid = (side, client, caregiver) => {
    const key = stableKey(side, client || '', caregiver || '');
    if (!tempUidMapRef.current.has(key)) {
      tempUidMapRef.current.set(key, `TMP-${sessionId}-${shortHash(key)}`);
    }
    return tempUidMapRef.current.get(key);
  };

  const uidReadyNotice = (() => {
    // If rows carry meta, we can inspect first item for flags; otherwise, hide notice.
    const meta = rows && rows._meta ? rows._meta : null;
    if (!meta) return null;
    if (meta.bucaUidSynced === false || meta.jovieUidSynced === false) {
      return (
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 mb-2">
          Waiting for UID enrichment to complete...
        </div>
      );
    }
    return null;
  })();

  return (
    <div>
      {/* Legend and Controls */}
      <div className="flex gap-6 mt-2 mb-4 text-sm items-center">
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-green-100 border border-green-400 rounded"></span> Exact Match</div>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-orange-100 border border-orange-400 rounded"></span> Verify Which CG</div>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-red-100 border border-red-400 rounded"></span> Complete Mismatch</div>
      </div>
      <div className="flex gap-4 mb-4 items-center">
        <button className="bg-orange-500 text-white px-6 py-2 rounded font-semibold hover:bg-orange-600" onClick={onCompare}>Compare BUCA & JOVIE</button>
        <button className="bg-gray-300 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-400" onClick={onClearResults}>Clear Results</button>
        <label className="flex items-center gap-2 ml-2 text-sm">
          <input type="checkbox" checked={showUIDs} onChange={e=>setShowUIDs(e.target.checked)} />
          <span>Show UIDs</span>
        </label>
      </div>
      {uidReadyNotice}
      <div className="overflow-x-auto border rounded bg-white mb-2 output-scroll">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 font-bold">#</th>
              <th className="p-2 font-bold">Source</th>
              <th className="p-2 font-bold">Client</th>
              <th className="p-2 font-bold">Caregiver</th>
              <th className="p-2 font-bold">Match Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              // Extract BUCA/JOVIE caregivers for BOTH rows (names for display only)
              let bucaCG = '';
              let jovieCG = '';
              // Extract BUCA/JOVIE caregiver UIDs for MAST-based comparison
              let bucaCGUID = '';
              let jovieCGUID = '';
              if (row && row.source === 'BOTH') {
                bucaCG = pick(row, BUCA_CG_KEYS) || '';
                jovieCG = pick(row, JOVIE_CG_KEYS) || '';
                bucaCGUID = pick(row, BUCA_CG_UID_KEYS) || '';
                jovieCGUID = pick(row, JOVIE_CG_UID_KEYS) || '';
                // Fallbacks if not explicitly provided
                if (!bucaCG && (row.tag === 'verify_cg' || row.match_type === 'Verify Which CG')) bucaCG = row.caregiver || '';
                // Assign session-only temp UIDs for tracking when missing (do not use these for equality checks)
                if (!bucaCGUID) {
                  // Assign but keep real comparison based on real UIDs only
                  getTempUid('BUCA', row.client, bucaCG || row.caregiver || '');
                }
                if (!jovieCGUID) {
                  getTempUid('JOVIE', row.client, jovieCG || '');
                }
              }

              // MAST UID values
              const uidA = normUid(bucaCGUID);
              const uidB = normUid(jovieCGUID);
              const bothRow = row && row.source === 'BOTH';
              const uidBothPresent = bothRow && !!uidA && !!uidB;
              const uidEqual = uidBothPresent && uidA === uidB;
              // Fallback name-based comparison when UIDs not available on at least one side
              const nameMismatch = bothRow && bucaCG && jovieCG && !namesEqualByFallback(bucaCG, jovieCG);
              // Hybrid rule:
              // - If both UIDs present: mismatch when different
              // - If either UID missing: use name comparison to decide mismatch
              const portalMismatch = bothRow && ( (uidBothPresent && !uidEqual) || (!uidBothPresent && nameMismatch) );

              // Row background: red (backend complete mismatch) > orange (hybrid caregiver mismatch) > green (UID-equal or backend exact)
              let bg = '';
              if (row.tag === 'complete_mismatch' || row.match_type === 'Complete Mismatch') bg = 'bg-red-100';
              else if (portalMismatch) bg = 'bg-orange-100';
              else if (uidEqual || row.tag === 'exact_match' || row.match_type === 'Exact Match') bg = 'bg-green-100';

              return (
                <tr key={idx} className={bg + ' border-b'}>
                  <td className="p-2">{idx + 1}</td>
                  <td className="p-2">{row.source}</td>
                  <td className="p-2">
                    {row.client}
                    {showUIDs && (
                      <span className="text-gray-500 text-xs ml-2">
                        [{getClientUID(row) || 'MAST NF'}]
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {/* Caregiver cell: show JOVIE caregiver when hybrid mismatch; otherwise fallback to row.caregiver */}
                    {portalMismatch && jovieCG ? (
                      <span>{jovieCG}</span>
                    ) : (
                      <span>{row.caregiver}</span>
                    )}
                    {showUIDs && (
                      <span className="text-gray-500 text-xs ml-2">
                        [{getCaregiverUID(row) || 'MAST NF'}]
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {/* Align label with hybrid result: mismatch (with BUCA hint) when UIDs differ or, if UIDs missing, names differ; exact when both UIDs equal; else original label. */}
                    {portalMismatch ? (
                      <span>
                        <span className="font-semibold">Caregiver Mismatch</span>
                        {bucaCG ? (
                          <span className="ml-2 text-gray-800">BUCA -&gt; {bucaCG}</span>
                        ) : null}
                      </span>
                    ) : uidEqual ? (
                      <span className="font-semibold">Exact Match</span>
                    ) : (
                      row.match_type
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Note: Temporary mismatch modal removed for rebuild. */}
    </div>
  );
}