import React, { useState, useRef } from 'react';
import CopyCell from '../CopyCell';
import useReconStore from '../store/reconStore';
import { useTimeckStore } from '../store/timeckStore';
import useBcasStore from '../store/bcasStore';

/**
 * ReconPanel - Displays reconciliation results with export and archive actions.
 * 
 * @param {Object} props - Component props
 * @param {Array} props.rows - Array of rows to display
 * @param {Function} props.onArchive - Callback when Archive is clicked
 * @param {Function} props.onExport - Callback when Export is clicked
 * @returns {JSX.Element} The ReconPanel component
 */
function ReconPanel({ rows = [], onArchive, onExport }) {
  // Session-only edited results map via Zustand: index -> parsed case number
  const editedResults = useReconStore(s => s.editedResults);
  const setEditedResult = useReconStore(s => s.setEditedResult);
  const clearEditedResults = useReconStore(s => s.clearEditedResults);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const [searchFeedback, setSearchFeedback] = useState(null); // 'nomatch' | null
  const rowRefs = useRef({});
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  // Read TimeCK's session-edited values so Recon can display the final calculated time
  const timeckEditedValues = useTimeckStore(s => s.editedValues);
  const timeckDeviationMessages = useTimeckStore(s => s.deviationMessages);
  // Read BCAS confirmations map
  const bcasConfirmations = useBcasStore(s => s.confirmations);

  // Diagnostics: log incoming rows and a small sample
  try {
    if (process.env.NODE_ENV !== 'production') {
      const len = Array.isArray(rows) ? rows.length : 0;
      if (len >= 0) {
        const peek = (rows || []).slice(0, Math.min(3, len)).map((r, i) => ({
          i,
          caseNumber: r && r.caseNumber,
          timeChecked: r && r.timeChecked,
          result: r && r.result,
        }));
        console.log('[Recon][mount] rows length:', len, 'peek:', peek);
      }
      if (timeckDeviationMessages) {
        const keys = Object.keys(timeckDeviationMessages);
        console.log('[Recon][mount] timeckDeviationMessages keys:', keys.slice(0, 10));
      }
    }
  } catch {}

  // --- Minimal helpers to compute deviation like TimeCK ---
  const toMinutes12h = (h, m, ampm) => {
    let hh = parseInt(h, 10);
    const mm = parseInt(m, 10) || 0;
    const ap = (ampm || '').toLowerCase();
    if (ap === 'pm' && hh !== 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    return hh * 60 + mm;
  };
  const parseTimeRangeFlexible = (str) => {
    if (!str || typeof str !== 'string') return null;
    const s = String(str).trim();
    let m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b\s*[-–]\s*\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/i);
    if (m) {
      const start = toMinutes12h(m[1], m[2] ?? '00', m[3]);
      let end = toMinutes12h(m[4], m[5] ?? '00', m[6]);
      if (end <= start) end += 24 * 60; // overnight
      return { start, end };
    }
    m = s.match(/\b(\d{1,2}):(\d{2})\b\s*[-–]\s*\b(\d{1,2}):(\d{2})\b/);
    if (m) {
      const toMin24 = (h, mm) => (Math.min(23, Math.max(0, parseInt(h, 10))) * 60) + (Math.min(59, Math.max(0, parseInt(mm, 10))));
      const start = toMin24(m[1], m[2]);
      let end = toMin24(m[3], m[4]);
      if (end <= start) end += 24 * 60; // overnight
      return { start, end };
    }
    return null;
  };
  const minutesToHhMm = (mins) => {
    const a = Math.abs(mins);
    const h = Math.floor(a / 60);
    const m = a % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };
  const analyzeDeviation = (refStr, valStr) => {
    const ref = parseTimeRangeFlexible(refStr);
    const val = parseTimeRangeFlexible(valStr);
    if (!ref || !val) return { badge: '' };
    const ds = val.start - ref.start; // + late, - early
    const de = val.end - ref.end;     // + late, - early
    if (ds === 0 && de === 0) return { badge: 'YES' };
    const parts = [];
    if (ds < 0) parts.push(`Arrived early ${minutesToHhMm(ds)}`);
    if (ds > 0) parts.push(`Arrived late ${minutesToHhMm(ds)}`);
    if (de < 0) parts.push(`Left early ${minutesToHhMm(de)}`);
    if (de > 0) parts.push(`Left late ${minutesToHhMm(de)}`);
    const overHour = Math.abs(ds) > 60 || Math.abs(de) > 60;
    return { badge: overHour ? `More than hour deviation: ${parts.join(', ')}` : parts.join(', ') };
  };

  // Actual (from Jovie/row) vs Pasted (from TimeCK Result)
  const pickField = (obj, keys) => {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== '') return obj[k];
    }
    return undefined;
  };
  const getActualTimeStr = (row) => {
    if (!row) return '';
    const single = pickField(row, ['JOVIE_Time','jovie_time','timeRange','timerange','TIME_RANGE','TIME','time','Time']);
    if (single) return single;
    const s = pickField(row, ['start_time','startTime','START_TIME','Start_Time']);
    const e = pickField(row, ['end_time','endTime','END_TIME','End_Time']);
    if (s && e) return `${s} - ${e}`;
    return '';
  };
  const getPastedTimeStr = (idx, row) => {
    const edited = (timeckEditedValues && timeckEditedValues[idx]) || '';
    if (edited) return edited;
    return row.result || row.timeChecked || '';
  };
  // Read the exact badge message published by TimeCK
  const getBadge = (idx, _row) => {
    const badge = (timeckDeviationMessages && timeckDeviationMessages[idx]) || '';
    try {
      if (process.env.NODE_ENV !== 'production') {
        if (idx < 5) console.log('[Recon][getBadge]', { idx, badge });
      }
    } catch {}
    return badge;
  };

  const showToast = (message) => {
    try {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(message);
      toastTimerRef.current = setTimeout(() => setToast(null), 1800);
    } catch {}
  };

  const scrollToRow = (index) => {
    try {
      const el = rowRefs.current && rowRefs.current[index];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch {}
  };
  const selectAllIn = (el) => {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
  };
  // Helper: extract a case number from free-form Result text
  const extractCaseNumber = (text) => {
    if (typeof text !== 'string') return '';
    // Look for explicit label first
    const labeled = text.match(/BUC\s*Case\s*Number\s*:\s*([A-Z0-9-]+)/i);
    if (labeled) return labeled[1].trim();
    // Otherwise, find any token that looks like our case number pattern
    const generic = text.match(/(?:^|\s)((?:00[a-zA-Z0-9]|CAS)[-A-Z0-9]+)(?=\b)/);
    return generic ? generic[1].trim() : '';
  };

  const sanitizeCaseNumber = (val) => {
    if (!val) return '';
    if (typeof val !== 'string') return String(val);
    return val.replace(/\s*(?:Date:|ESTCaregiver:).*$/i, '').trim();
  };

  const getDisplayedCase = (row, idx) => {
    const direct = sanitizeCaseNumber(row.caseNumber);
    if (direct) return direct;
    const edited = editedResults[idx];
    if (edited) return edited;
    return extractCaseNumber(row.result) || '';
  };
  // Archive handler: prefer parent onArchive, else placeholder
  const handleArchive = async () => {
    try {
      if (typeof onArchive === 'function') return await onArchive(rows);
      alert('Archive feature coming soon!');
    } catch {}
  };

  // Export handler: prefer onExport; then client-side export
  const handleExport = async () => {
    try {
      if (typeof onExport === 'function') {
        await onExport(rows);
        return;
      }
    } catch (err) {
      console.error('Parent export callback failed, falling back to client export:', err);
    }

    // Build dynamic data: exclude date-like fields, normalize caregiver(s)
    const dateKeys = new Set(['date','Date','service_date','SERVICE_DATE']);
    const base = (rows || []).map((r, idx) => {
      const out = {};
      // Start with Client/Caregiver/Case_Number/Result if present (ordering first)
      if (r.client != null) out.Client = r.client;
      const cg = Array.isArray(r.caregivers) ? r.caregivers.join(', ') : r.caregiver;
      if (cg != null) out.Caregiver = cg;
      if (r.caseNumber != null) {
        const sanitized = typeof r.caseNumber === 'string'
          ? r.caseNumber.replace(/\s*(?:Date:|ESTCaregiver:).*$/i, '').trim()
          : r.caseNumber;
        out.Case_Number = sanitized;
      }
      if (r.result != null) {
        const parsed = (editedResults && editedResults[idx]) || extractCaseNumber(r.result);
        // Prefer parsed case number in Result
        out.Result = parsed || '';
        // If Case_Number missing, fill from parsed
        if (!out.Case_Number && parsed) out.Case_Number = parsed;
      }
      // Inject canonical answer (YES / deviation) in Time column
      out.Time = getBadge(idx, r);
      // Inject Status derived from BCAS confirmations (default Pending if none)
      const conf = bcasConfirmations && bcasConfirmations[idx];
      out.Status = conf && conf.matched ? 'Checked' : 'Pending';
      // Append remaining keys except date-like
      Object.keys(r || {}).forEach((k) => {
        if (dateKeys.has(k)) return;
        if (k === 'client' || k === 'caregiver' || k === 'caregivers' || k === 'caseNumber' || k === 'result' || k === 'time' || k === 'timeChecked' || k === 'timeRange') return;
        const v = r[k];
        out[k] = Array.isArray(v) ? v.join(', ') : v;
      });
      return out;
    });
    const allKeys = Array.from(base.reduce((s, row) => {
      Object.keys(row).forEach(k => s.add(k));
      return s;
    }, new Set()));
    const data = base;

    // Try styled export with xlsx-populate
    try {
      const xpMod = await import('xlsx-populate/browser/xlsx-populate');
      const XlsxPopulate = xpMod && xpMod.default ? xpMod.default : xpMod;
      const wb = await XlsxPopulate.fromBlankAsync();
      const defaultSheet = wb.sheet('Sheet1');
      if (defaultSheet) defaultSheet.name('RECON');
      const sheet = wb.sheet('RECON');

      const headers = allKeys.length ? allKeys : ['Client','Caregiver','Case_Number','Result'];
      sheet.cell(1,1).value([headers]);
      sheet.range(1,1,1,headers.length).style({ bold: true, fill: 'DDDDDD', horizontalAlignment: 'center' });
      data.forEach((row, idx) => {
        const r = idx + 2;
        headers.forEach((h, c) => sheet.cell(r, c + 1).value(row[h] == null ? '' : row[h]));
      });
      const lastRow = (data.length || 0) + 1;
      const lastCol = headers.length;
      sheet.range(1,1,lastRow,lastCol).style('border','thin');
      try { sheet.freezePanes(1,0); } catch {}
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        let maxLen = String(h).length;
        data.forEach(row => { const s = String(row[h] == null ? '' : row[h]); maxLen = Math.max(maxLen, s.length); });
        sheet.column(i+1).width(Math.min(60, maxLen + 2));
      }

      const blob = await wb.outputAsync();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CaseConRECON.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    } catch (err) {
      // Fallback to SheetJS basic export
      try {
        const mod = await import('xlsx');
        const XLSX = mod && mod.default ? mod.default : mod;
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        const keys = allKeys;
        ws['!cols'] = keys.map(k => {
          const headerLen = String(k).length;
          const maxCellLen = data.reduce((m, r) => Math.max(m, String(r[k] == null ? '' : r[k]).length), 0);
          return { wch: Math.min(60, Math.max(headerLen, maxCellLen) + 2) };
        });
        XLSX.utils.book_append_sheet(wb, ws, 'RECON');
        XLSX.writeFile(wb, 'CaseConRECON.xlsx');
      } catch (e) {
        console.error('RECON export failed', e);
      }
    }
  };

  // Compute filtered rows for display only
  const displayRows = (rows || []).filter((row) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const client = String(row.client || '').toLowerCase();
    const caregiver = String(row.caregiver || '').toLowerCase();
    const sanitizedCase = typeof row.caseNumber === 'string'
      ? row.caseNumber.replace(/\s*(?:Date:|ESTCaregiver:).*$/i, '').trim()
      : (row.caseNumber || '');
    const caseLower = String(sanitizedCase).toLowerCase();
    const orig = (rows || []).indexOf(row);
    const parsed = (editedResults && editedResults[orig]) || extractCaseNumber(row.result) || '';
    const parsedLower = parsed.toLowerCase();
    return client.includes(q) || caregiver.includes(q) || caseLower.includes(q) || parsedLower.includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex gap-3">
          <button
            className="bg-gray-300 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-400"
            onClick={handleExport}
          >
            Export
          </button>
          <button
            className="bg-gray-300 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-400"
            onClick={handleArchive}
          >
            Archive
          </button>
        </div>
        <div className="flex-1 text-center">
          {toast ? (
            <span className="inline-block px-3 py-1 rounded bg-green-100 text-green-800 font-semibold text-sm shadow-sm">
              {toast}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (searchFeedback) setSearchFeedback(null); }}
            placeholder="Search client, caregiver, case #..."
            className={`border rounded px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 ${searchFeedback === 'nomatch' ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'focus:ring-blue-400'}`}
            onPaste={(e) => {
              try {
                const text = (e.clipboardData || window.clipboardData).getData('text');
                if (!text) return;
                e.preventDefault();
                const parsed = extractCaseNumber(text);
                if (!parsed) return;
                setQuery(parsed);
                // Find matching row by displayed Case #
                const targetIdx = (rows || []).findIndex((r, i) => sanitizeCaseNumber(getDisplayedCase(r, i)).toLowerCase() === parsed.toLowerCase());
                if (targetIdx >= 0) {
                  setEditedResult(targetIdx, parsed);
                  // Clear and release focus after successful assignment
                  setTimeout(() => {
                    setQuery('');
                    if (searchFeedback) setSearchFeedback(null);
                    if (searchInputRef.current) searchInputRef.current.blur();
                  }, 0);
                  showToast(`Assigned to row ${targetIdx + 1}`);
                } else {
                  // No match feedback
                  if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
                  setSearchFeedback('nomatch');
                  feedbackTimerRef.current = setTimeout(() => setSearchFeedback(null), 2000);
                }
              } catch {}
            }}
          />
          {searchFeedback === 'nomatch' ? (
            <span className="text-xs text-red-600">No matching case found</span>
          ) : null}
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
              title="Clear search"
            >Clear</button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto border rounded bg-white mb-2 output-scroll">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 border font-bold">#</th>
              <th className="p-2 border font-bold">Client</th>
              <th className="p-2 border font-bold">Caregiver</th>
              <th className="p-2 border font-bold">Case Number</th>
              <th className="p-2 border font-bold w-64">Time</th>
              <th className="p-2 border font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const originalIndex = (rows || []).indexOf(row);
              const sanitizedCase = typeof row.caseNumber === 'string'
                ? row.caseNumber.replace(/\s*(?:Date:|ESTCaregiver:).*$/i, '').trim()
                : ((row.caseNumber != null && row.caseNumber !== '')
                    ? row.caseNumber
                    : ((editedResults && editedResults[originalIndex]) || extractCaseNumber(row.result) || ''));
              // Prefer TimeCK deviation message; if not available (e.g., TimeCK not mounted),
              // fall back to the merged time value provided on the row (timeChecked)
              const badge = getBadge(originalIndex, row);
              const timeVal = badge || row.timeChecked || '';
              try {
                if (process.env.NODE_ENV !== 'production' && idx < 5) {
                  console.log('[Recon][render]', {
                    idx,
                    originalIndex,
                    caseNumber: sanitizedCase,
                    badge,
                    timeChecked: row && row.timeChecked,
                    result: row && row.result,
                  });
                }
              } catch {}
              const conf = bcasConfirmations && bcasConfirmations[originalIndex];
              const statusLabel = conf && conf.matched ? 'Checked' : 'Pending';
              const statusClass = conf && conf.matched
                ? 'bg-green-100 text-green-800'
                : 'bg-orange-100 text-orange-800';
              const formattedTimeVal = (typeof timeVal === 'string' && timeVal.startsWith('More than hour deviation:'))
                ? (
                  <>
                    <span className="font-medium">More than hour deviation:</span>
                    <br />
                    <span>{timeVal.replace(/^More than hour deviation:\s*/, '')}</span>
                  </>
                )
                : timeVal;
              const timeClass = (() => {
                const s = String(timeVal || '').trim().toUpperCase();
                if (s === 'YES') return 'bg-green-100 text-green-800';
                if (s.startsWith('MORE THAN HOUR DEVIATION')) return 'bg-red-100 text-red-800';
                if (s) return 'bg-orange-100 text-orange-800';
                return '';
              })();
              return (
                <tr key={idx} ref={(el) => { if (el) rowRefs.current[originalIndex] = el; }}>
                  <CopyCell>{row.line || originalIndex + 1}</CopyCell>
                  <CopyCell>{row.client}</CopyCell>
                  <CopyCell>{row.caregiver}</CopyCell>
                  <CopyCell>{sanitizedCase}</CopyCell>
                  <CopyCell className={timeClass}>
                    <div className="whitespace-normal break-words max-w-[16rem] text-[13px] leading-snug">
                      {formattedTimeVal}
                    </div>
                  </CopyCell>
                  <CopyCell
                    className={statusClass}
                    title={conf ? `Parsed: ${conf.parsedCase || ''}\n${conf.matched ? 'Matched' : 'Not matched'}\n${conf.timestamp ? new Date(conf.timestamp).toLocaleString() : ''}` : ''}
                  >
                    {statusLabel}
                  </CopyCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ReconPanel;
