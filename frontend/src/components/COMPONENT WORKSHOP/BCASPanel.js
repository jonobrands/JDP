import React, { useState, useRef } from 'react';
import CopyCell from '../CopyCell';
import useBcasStore from '../store/bcasStore';

/**
 * BCASPanel - Displays BCAS (Business Case Analysis System) verification results with reconciliation and reporting options.
 * 
 * @param {Object} props - Component props
 * @param {Array} props.rows - Array of BCAS verification rows to display
 * @param {Function} props.onRecon - Callback function when Recon Now is clicked
 * @param {Function} props.onReport - Callback function when Report is clicked
 * @returns {JSX.Element} The BCASPanel component
 */
function BCASPanel({ rows = [], onRecon, onReport, onClear, onExport }) {
  // Session-only edited results via Zustand: index -> parsed case number
  const editedResults = useBcasStore(s => s.editedResults);
  const setEditedResult = useBcasStore(s => s.setEditedResult);
  const clearEditedResults = useBcasStore(s => s.clearEditedResults);
  const setConfirmation = useBcasStore(s => s.setConfirmation);
  const clearConfirmations = useBcasStore(s => s.clearConfirmations);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const [searchFeedback, setSearchFeedback] = useState(null); // 'nomatch' | null
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
  // Clear handler: prefer onClear, fallback to legacy onRecon
  const handleClear = () => {
    try { clearEditedResults(); } catch {}
    try { clearConfirmations(); } catch {}
    if (typeof onClear === 'function') return onClear();
    if (typeof onRecon === 'function') return onRecon();
    console.warn('BCASPanel: no onClear/onRecon callback provided.');
  };

  // Export handler: prefer onExport, fallback to legacy onReport; then client-side export
  const handleExport = async () => {
    try {
      if (typeof onExport === 'function') {
        await onExport(rows);
        return;
      }
      if (typeof onReport === 'function') {
        await onReport(rows);
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
      // Append remaining keys except date-like
      Object.keys(r || {}).forEach((k) => {
        if (dateKeys.has(k)) return;
        if (k === 'client' || k === 'caregiver' || k === 'caregivers' || k === 'caseNumber' || k === 'result') return;
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
      if (defaultSheet) defaultSheet.name('BCAS');
      const sheet = wb.sheet('BCAS');

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
      a.download = 'CaseConBCAS.xlsx';
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
        XLSX.utils.book_append_sheet(wb, ws, 'BCAS');
        XLSX.writeFile(wb, 'CaseConBCAS.xlsx');
      } catch (e) {
        console.error('BCAS export failed', e);
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
            onClick={handleClear}
          >
            Clear Results
          </button>
          <button 
            className="bg-gray-300 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-400" 
            onClick={handleExport}
          >
            Export
          </button>
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
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text');
                if (!text) return;
                const parsed = extractCaseNumber(text);
                if (!parsed) {
                  // No case number found; give gentle feedback and keep query as-is
                  if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
                  setSearchFeedback('nomatch');
                  feedbackTimerRef.current = setTimeout(() => setSearchFeedback(null), 2000);
                  return;
                }
                setQuery(parsed);
                // Find matching row by displayed Case #
                const targetIdx = (rows || []).findIndex((r, i) => sanitizeCaseNumber(getDisplayedCase(r, i)).toLowerCase() === parsed.toLowerCase());
                if (targetIdx >= 0) {
                  setEditedResult(targetIdx, parsed);
                  // Record confirmation as matched for that row
                  try {
                    const displayed = sanitizeCaseNumber(getDisplayedCase(rows[targetIdx], targetIdx));
                    const matched = displayed && parsed && displayed.toLowerCase() === parsed.toLowerCase();
                    setConfirmation(targetIdx, { parsedCase: parsed, matched, timestamp: new Date().toISOString() });
                  } catch {}
                  // Clear and release focus after successful assignment
                  setTimeout(() => {
                    setQuery('');
                    if (searchFeedback) setSearchFeedback(null);
                    if (searchInputRef.current) searchInputRef.current.blur();
                  }, 0);
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
              <th className="p-2 border font-bold">Line #</th>
              <th className="p-2 border font-bold">Client</th>
              <th className="p-2 border font-bold">Caregiver</th>
              <th className="p-2 border font-bold">Case #</th>
              <th className="p-2 border font-bold">Result</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const originalIndex = (rows || []).indexOf(row);
              return (
              <tr key={idx}>
                <CopyCell>{row.line || originalIndex + 1}</CopyCell>
                <CopyCell>{row.client}</CopyCell>
                <CopyCell>{row.caregiver}</CopyCell>
                <CopyCell>{
                  typeof row.caseNumber === 'string'
                    ? row.caseNumber.replace(/\s*(?:Date:|ESTCaregiver:).*$/i, '').trim()
                    : (row.caseNumber || editedResults[originalIndex] || extractCaseNumber(row.result) || '')
                }</CopyCell>
                <td className="p-2">
                  <div
                    role="textbox"
                    contentEditable
                    suppressContentEditableWarning
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = (e.clipboardData || window.clipboardData).getData('text');
                      if (!text) return;
                      const parsed = extractCaseNumber(text);
                      if (!parsed) return; // nothing to set
                      if (e.currentTarget) e.currentTarget.textContent = parsed;
                      setEditedResult(originalIndex, parsed);
                      try {
                        const displayed = sanitizeCaseNumber(getDisplayedCase(row, originalIndex));
                        const matched = displayed && parsed && displayed.toLowerCase() === parsed.toLowerCase();
                        setConfirmation(originalIndex, { parsedCase: parsed, matched, timestamp: new Date().toISOString() });
                      } catch {}
                    }}
                    onKeyDown={async (e) => {
                      try {
                        const isPaste = (e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V');
                        if (!isPaste) return;
                        e.preventDefault();
                        if (navigator.clipboard && navigator.clipboard.readText) {
                          const text = await navigator.clipboard.readText();
                          if (!text) return;
                          const parsed = extractCaseNumber(text);
                          if (!parsed) return; // nothing to set
                          if (e.currentTarget) e.currentTarget.textContent = parsed;
                          setEditedResult(originalIndex, parsed);
                          try {
                            const displayed = sanitizeCaseNumber(getDisplayedCase(row, originalIndex));
                            const matched = displayed && parsed && parsed.toLowerCase() === displayed.toLowerCase();
                            setConfirmation(originalIndex, { parsedCase: parsed, matched, timestamp: new Date().toISOString() });
                          } catch {}
                        }
                      } catch {}
                    }}
                    onFocus={(e) => selectAllIn(e.currentTarget)}
                    onClick={(e) => selectAllIn(e.currentTarget)}
                    className={`min-w-[160px] px-2 py-1 border rounded focus:outline-none focus:ring-2 ${(() => {
                      const displayedRaw = getDisplayedCase(row, originalIndex);
                      const currentRaw = (editedResults && editedResults[originalIndex]) || extractCaseNumber(row.result) || '';
                      const displayed = displayedRaw.toLowerCase();
                      const current = currentRaw.toLowerCase();
                      const match = current && displayed && current === displayed;
                      const mismatch = current && displayed && current !== displayed;
                      if (match) return 'bg-green-50 border-green-400 focus:ring-green-300';
                      if (mismatch) return 'bg-red-50 border-red-400 focus:ring-red-300';
                      return 'focus:ring-orange-400';
                    })()}`}
                  >
                    {(editedResults && editedResults[originalIndex]) || extractCaseNumber(row.result) || ''}
                  </div>
                  {(() => {
                    const displayedRaw = getDisplayedCase(row, originalIndex);
                    const currentRaw = (editedResults && editedResults[originalIndex]) || extractCaseNumber(row.result) || '';
                    const displayed = displayedRaw.toLowerCase();
                    const current = currentRaw.toLowerCase();
                    const mismatch = current && displayed && current !== displayed;
                    return mismatch ? (
                      <div className="mt-1 text-xs font-semibold text-red-700">Case number mismatch. Please rectify in JOVIE.</div>
                    ) : null;
                  })()}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BCASPanel;
