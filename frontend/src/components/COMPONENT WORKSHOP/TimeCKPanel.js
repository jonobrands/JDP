import React from 'react';
import { formatTime12hRange } from '../utils/formatting';
import { useExchangeStore } from '../store/exchangeStore';
import { normalizeName } from '../utils/normalizeName';
import { useTimeckStore } from '../store/timeckStore';

/**
 * TimeCK - Displays a table of exact match results with the ability to clear/export.
 * 
 * @param {Object} props - Component props
 * @param {Array} props.rows - Array of result rows to display
 * @param {Function} props.onClearResults - Callback function when Clear Results is clicked
 * @param {Function} props.onExport - Callback function when Export is clicked
 * @param {Function} [props.onResultEdit] - Optional callback (index, value) to persist Result edits
 * @returns {JSX.Element} The TimeCK component
 */
function TimeCK({ rows = [], onClearResults, onExport, onResultEdit }) {
  const exchange = useExchangeStore();
  const [displayMode, setDisplayMode] = React.useState('12h'); // '12h' | '24h'
  const editedValues = useTimeckStore(s => s.editedValues); // { [originalIndex]: saved12hString }
  const setEditedValue = useTimeckStore(s => s.setEditedValue);
  const clearEditedValues = useTimeckStore(s => s.clearEditedValues);
  const clearDeviationMessages = useTimeckStore(s => s.clearDeviationMessages);
  const setDeviationMessages = useTimeckStore(s => s.setDeviationMessages);
  const DISPLAY_MODE_STORAGE_KEY = 'timeck_display_mode';

  // Helper: select all text in a contentEditable element
  const selectAllIn = React.useCallback((el) => {
    try {
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
  }, []);

  // Load persisted display mode on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
      if (saved === '12h' || saved === '24h') {
        setDisplayMode(saved);
      }
    } catch {}
  }, []);

  // Persist display mode on change
  React.useEffect(() => {
    try {
      localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
    } catch {}
  }, [displayMode]);

  // (moved export helpers below once exactRows/missingRows are defined)
  // Pull latest JOVIE publish from the exchange store
  const jovieData = exchange.getChannelData ? exchange.getChannelData('jovie') : null;
  const jovieRows = Array.isArray(jovieData?.rows) ? jovieData.rows : [];
  // Build multiple lookup maps for robust matching
  const { nameMap, uidMap, mastMap, mastDateMap } = React.useMemo(() => {
    const nameMap = new Map(); // key: norm(client)|norm(caregiver)
    const uidMap = new Map();  // key: clientUID|caregiverUID
    const mastMap = new Map(); // key: mast/pair uid token
    const mastDateMap = new Map(); // key: mast|date
    const hasTime = (x) => Boolean(x && (x.timeRange || x.time || (x.start_time && x.end_time)));
    const extractDate = (x) => x?.date || x?.service_date || x?.SERVICE_DATE || x?.Date;
    for (const r of jovieRows) {
      const nameKey = `${normalizeName(r.client || '')}|${normalizeName(r.caregiver || '')}`;
      const prevName = nameMap.get(nameKey);
      if (!prevName || (!hasTime(prevName) && hasTime(r))) nameMap.set(nameKey, r);

      const cUID = r.clientUID || r.client_uid || r.CLIENT_UID;
      const gUID = r.caregiverUID || r.caregiver_uid || r.CAREGIVER_UID;
      if (cUID && gUID) {
        const uidKey = `${cUID}|${gUID}`;
        const prevUid = uidMap.get(uidKey);
        if (!prevUid || (!hasTime(prevUid) && hasTime(r))) uidMap.set(uidKey, r);
      }

      const mast = r.mast_uid || r.MAST_UID || r.master_uid || r.MASTER_UID || r.pair_uid || r.pairUID;
      if (mast) {
        const mastKey = String(mast);
        const prevMast = mastMap.get(mastKey);
        if (!prevMast || (!hasTime(prevMast) && hasTime(r))) mastMap.set(mastKey, r);
        const date = extractDate(r);
        if (date) {
          const mdKey = `${mastKey}|${date}`;
          const prevMd = mastDateMap.get(mdKey);
          if (!prevMd || (!hasTime(prevMd) && hasTime(r))) mastDateMap.set(mdKey, r);
        }
      }
    }
    return { nameMap, uidMap, mastMap, mastDateMap };
  }, [jovieRows]);

  const extractMast = (row) => row?.mast_uid || row?.MAST_UID || row?.master_uid || row?.MASTER_UID || row?.pair_uid || row?.pairUID;
  const extractClientUID = (row) => (
    row?.clientUID || row?.clientUid || row?.client_id || row?.clientId ||
    row?.client_uid || row?.CLIENT_UID || row?.uid_client || row?.CLIENTID || row?.CLIENT
  );
  const extractCaregiverUID = (row) => (
    row?.caregiverUID || row?.caregiverUid || row?.caregiver_id || row?.caregiverId ||
    row?.caregiver_uid || row?.CAREGIVER_UID || row?.uid_caregiver || row?.CAREGIVERID || row?.CAREGIVER
  );
  const expandCaregivers = (cg) => {
    if (Array.isArray(cg)) return cg;
    if (typeof cg === 'string') return cg.split(',').map(s => s.trim()).filter(Boolean);
    return [cg].filter(Boolean);
  };

  // --- Time parsing and deviation analysis helpers ---
  const toMinutes12h = (h, m, ampm) => {
    let hh = parseInt(h, 10);
    const mm = parseInt(m, 10) || 0;
    const ap = (ampm || '').toLowerCase();
    if (ap === 'pm' && hh !== 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    return hh * 60 + mm;
  };
  const parseTimeRange12h = (str) => {
    if (!str || typeof str !== 'string') return null;
    const re = /\b(\d{1,2}):(\d{2})\s*([ap]m)\b\s*[-–]\s*\b(\d{1,2}):(\d{2})\s*([ap]m)\b/i;
    const m = str.match(re);
    if (!m) return null;
    const start = toMinutes12h(m[1], m[2], m[3]);
    let end = toMinutes12h(m[4], m[5], m[6]);
    // Overnight handling: if end is not after start, assume next day
    if (end <= start) end += 24 * 60;
    return { start, end };
  };
  const minutesToHhMm = (mins) => {
    const a = Math.abs(mins);
    const h = Math.floor(a / 60);
    const m = a % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };
  // Flexible parser: supports 12h (with/without minutes) and 24h ranges
  const parseTimeRangeFlexible = (str) => {
    if (!str || typeof str !== 'string') return null;
    const s = String(str).trim();
    // 12h with optional minutes and optional spaces, e.g. "10AM-4PM", "7 pm - 4 pm"
    let m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b\s*[-–]\s*\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/i);
    if (m) {
      const start = toMinutes12h(m[1], m[2] ?? '00', m[3]);
      let end = toMinutes12h(m[4], m[5] ?? '00', m[6]);
      if (end <= start) end += 24 * 60; // overnight
      return { start, end };
    }
    // 24h HH:MM - HH:MM
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

  const analyzeDeviation = (refStr, valStr) => {
    const ref = parseTimeRangeFlexible(refStr);
    const val = parseTimeRangeFlexible(valStr);
    if (!ref || !val) return { badge: '', color: '', severity: 'none' };
    const ds = val.start - ref.start; // + late, - early
    const de = val.end - ref.end;     // + late, - early
    if (ds === 0 && de === 0) {
      return { badge: 'YES', color: 'green', severity: 'ok', details: [] };
    }
    const parts = [];
    if (ds < 0) parts.push(`Arrived early ${minutesToHhMm(ds)}`);
    if (ds > 0) parts.push(`Arrived late ${minutesToHhMm(ds)}`);
    if (de < 0) parts.push(`Left early ${minutesToHhMm(de)}`);
    if (de > 0) parts.push(`Left late ${minutesToHhMm(de)}`);
    const overHour = Math.abs(ds) > 60 || Math.abs(de) > 60;
    if (overHour) {
      return { badge: `More than hour deviation: ${parts.join(', ')}`, color: 'red', severity: 'bad', details: parts };
    }
    return { badge: parts.join(', '), color: 'orange', severity: 'warn', details: parts };
  };

  // --- Display formatting helpers (12h/24h) ---
  const minutesTo24h = (mins) => {
    const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(hh)}:${pad(mm)}`;
  };
  const minutesTo12hClock = (mins) => {
    const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
    let hh = Math.floor(m / 60);
    const mm = m % 60;
    const ap = hh >= 12 ? 'pm' : 'am';
    hh = hh % 12;
    if (hh === 0) hh = 12;
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `${hh}:${pad(mm)} ${ap}`;
  };
  const formatDisplayRange = (srcStr, mode) => {
    const parsed = parseTimeRangeFlexible(srcStr);
    if (!parsed) {
      return mode === '24h' ? srcStr : formatTime12hRange(srcStr);
    }
    const { start, end } = parsed;
    if (mode === '24h') {
      return `${minutesTo24h(start)} - ${minutesTo24h(end)}`;
    }
    return `${minutesTo12hClock(start)} - ${minutesTo12hClock(end)}`;
  };

  const extractDate = (x) => x?.date || x?.service_date || x?.SERVICE_DATE || x?.Date;
  const extractTimeRange = (x) => x?.timeRange || x?.time || (x?.start_time && x?.end_time ? `${x.start_time}-${x.end_time}` : undefined);
  const getTimeFromJovie = (row) => {
    const fallback = row.timeRange || row.time;
    // 1) Try client+caregiver UIDs
    const cUID = extractClientUID(row);
    const gUID = extractCaregiverUID(row);
    if (cUID && gUID) {
      const u = uidMap.get(`${cUID}|${gUID}`);
      const t = extractTimeRange(u);
      if (t) return t;
    }
    // 2) Try MAST/pair UID
    const mast = extractMast(row);
    if (mast) {
      const mastKey = String(mast);
      // Prefer date-specific match when available
      const date = extractDate(row);
      if (date) {
        const md = mastDateMap.get(`${mastKey}|${date}`);
        const t = extractTimeRange(md);
        if (t) return t;
      }
      const m = mastMap.get(mastKey);
      const t = extractTimeRange(m);
      if (t) return t;
    }
    // 3) Try by name (including multi-caregiver variants)
    const clients = [row.client];
    const caregivers = expandCaregivers(row.caregivers ?? row.caregiver);
    for (const c of clients) {
      for (const g of caregivers) {
        const k = `${normalizeName(c || '')}|${normalizeName(g || '')}`;
        const jr = nameMap.get(k);
        const t = extractTimeRange(jr);
        if (t) return t;
      }
    }
    if (!fallback) {
      // Surface helpful diagnostics once per row-key
      const mast = extractMast(row);
      // eslint-disable-next-line no-console
      console.warn('[TimeCK] No JOVIE time found', {
        client: row.client, caregiver: row.caregiver, date: extractDate(row), mast,
      });
    }
    return fallback;
  };

  // Debug explainMatch previously used by the UID Debug panel has been removed.
  // Only show exact matches (100% confidence or tag === 'exact_match')
  const exactRows = rows.filter(row => (
    row.tag === 'exact_match' || 
    row.match_type === 'Exact Match' || 
    row.confidence === 1 || 
    row.confidence === 1.0
  ));
  // Heuristic for missing/mismatch items
  const missingRows = rows.filter(row => (
    row.tag === 'mismatch' ||
    row.match_type === 'Mismatch' ||
    row.match_type === 'Missing' ||
    row.source === 'BUCA only' ||
    row.source === 'JOVIE only'
  ));
  const [showMissing, setShowMissing] = React.useState(false);

  // Prepare export datasets for Exact and Missing (now that exactRows/missingRows exist)
  const buildExportRows = React.useCallback(() => {
    const getSavedValue = (row) => {
      const originalIndex = rows.indexOf(row);
      return (originalIndex in editedValues ? editedValues[originalIndex] : undefined) || row.result || row.timeChecked || '';
    };
    const exact = exactRows.map((row) => {
      const jovie = formatTime12hRange(getTimeFromJovie(row)) || '';
      const result = getSavedValue(row);
      const originalIndex = rows.indexOf(row);
      const a = analyzeDeviation(jovie, result);
      return {
        Pair: row.pair || row.uid || row.UID || '',
        Client: row.client || '',
        Caregiver: row.caregiver || '',
        Date: row.date || '',
        JOVIE_Time: jovie,
        Result_Time: result,
        Deviation: (deviationMessageMap && deviationMessageMap[originalIndex]) || a.badge || a.message || '',
      };
    });
    const missing = missingRows.map((row) => ({
      Pair: row.pair || row.uid || row.UID || '',
      Client: row.client || '',
      Caregiver: row.caregiver || '',
      Date: row.date || '',
      JOVIE_Time: formatTime12hRange(getTimeFromJovie(row)) || '',
    }));
    return { exact, missing };
  }, [editedValues, rows, exactRows, missingRows]);

  // Publish deviation messages for Recon to consume (after exactRows is defined)
  const deviationMessageMap = React.useMemo(() => {
    try {
      const map = {};
      if (!Array.isArray(exactRows)) return map;
      for (const row of exactRows) {
        const originalIndex = rows.indexOf(row);
        if (originalIndex < 0) continue;
        const currentValue = (originalIndex in editedValues ? editedValues[originalIndex] : undefined) || row.result || row.timeChecked || '';
        const refTimeStr = formatTime12hRange(getTimeFromJovie(row)) || '';
        const a = analyzeDeviation(refTimeStr, currentValue) || {};
        map[originalIndex] = a.badge || '';
      }
      return map;
    } catch {
      return {};
    }
  }, [exactRows, rows, editedValues]);

  React.useEffect(() => {
    try { setDeviationMessages(deviationMessageMap); } catch {}
  }, [deviationMessageMap, setDeviationMessages]);

  const downloadCSV = (filename, rowsArr) => {
    if (!rowsArr.length) return;
    const headers = Object.keys(rowsArr[0]);
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const csv = [headers.join(','), ...rowsArr.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    const { exact, missing } = buildExportRows();
    // Try colored Excel using xlsx-populate (supports styling)
    try {
      const xpMod = await import('xlsx-populate/browser/xlsx-populate');
      const XlsxPopulate = xpMod && xpMod.default ? xpMod.default : xpMod;
      const wb = await XlsxPopulate.fromBlankAsync();

      // Ensure sheets
      let sheetExact = wb.sheet('Exact') || wb.addSheet('Exact');
      let sheetMissing = wb.sheet('Missing') || wb.addSheet('Missing');
      // Remove default Sheet1 if present and unused
      const defaultSheet = wb.sheet('Sheet1');
      if (defaultSheet && defaultSheet.name() !== 'Exact' && defaultSheet.name() !== 'Missing') {
        wb.deleteSheet(defaultSheet);
      }

      const exactHeaders = ['Pair','Client','Caregiver','Date','JOVIE_Time','Result_Time','Deviation'];
      const missingHeaders = ['Pair','Client','Caregiver','Date','JOVIE_Time'];

      const writeSheet = (sheet, headers, data) => {
        // Headers
        sheet.cell(1,1).value([headers]);
        sheet.range(1,1,1,headers.length).style({ bold: true, fill: 'DDDDDD', horizontalAlignment: 'center' });
        // Rows
        data.forEach((row, idx) => {
          const r = idx + 2;
          headers.forEach((h, cidx) => {
            const c = cidx + 1;
            sheet.cell(r, c).value(row[h] == null ? '' : row[h]);
          });
        });
        // Determine used range
        const lastRow = (data.length || 0) + 1;
        const lastCol = headers.length;
        // Color Deviation column if present
        const devColIdx = headers.indexOf('Deviation');
        if (devColIdx !== -1) {
          data.forEach((row, idx) => {
            const r = idx + 2;
            const jovie = row['JOVIE_Time'] || '';
            const result = row['Result_Time'] || '';
            const a = analyzeDeviation(jovie, result) || {};
            const color = (a.color || '').toLowerCase();
            let fill, extra = {};
            if (color === 'green') fill = 'C6EFCE';
            else if (color === 'orange') fill = 'FCE4D6';
            else if (color === 'red') { fill = 'FFC7CE'; extra = { fontColor: '9C0006', bold: true }; }
            if (fill) sheet.cell(r, devColIdx + 1).style({ fill, ...extra });
          });
        }
        // Date number format if a Date column exists
        const dateColIdx = headers.indexOf('Date');
        if (dateColIdx !== -1 && data.length > 0) {
          try { sheet.range(2, dateColIdx + 1, lastRow, dateColIdx + 1).style('numberFormat', 'yyyy-mm-dd'); } catch {}
        }
        // Borders around used range
        try { sheet.range(1,1,lastRow,lastCol).style('border', 'thin'); } catch {}
        // Freeze header row
        try { sheet.freezePanes(1, 0); } catch {}
        // Autosize columns
        for (let i = 0; i < headers.length; i++) {
          const header = headers[i];
          const headerLen = String(header).length;
          let maxLen = headerLen;
          data.forEach(row => { const s = String(row[header] == null ? '' : row[header]); maxLen = Math.max(maxLen, s.length); });
          const width = Math.min(60, maxLen + 2);
          sheet.column(i + 1).width(width);
        }
      };

      writeSheet(sheetExact, exactHeaders, exact);
      writeSheet(sheetMissing, missingHeaders, missing);

      const blob = await wb.outputAsync();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CaseConTimeCK.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[TimeCK] xlsx-populate not available, falling back to SheetJS (no colors)', err);
    }
    // Always do a client-side Excel export with SheetJS; no backend dependency
    try {
      const mod = await import('xlsx');
      const XLSXLib = mod && mod.default ? mod.default : mod;
      const wb = XLSXLib.utils.book_new();
      const wsExact = XLSXLib.utils.json_to_sheet(exact);
      const wsMissing = XLSXLib.utils.json_to_sheet(missing);
      // Auto-size columns based on content (headers + rows)
      const calcCols = (rows) => {
        const keys = rows && rows.length ? Object.keys(rows[0]) : [];
        return keys.map((k) => {
          const headerLen = String(k).length;
          const maxCellLen = (rows || []).reduce((m, r) => {
            const v = r && Object.prototype.hasOwnProperty.call(r, k) ? r[k] : '';
            const s = v == null ? '' : String(v);
            return Math.max(m, s.length);
          }, 0);
          // Add padding, clamp to a sane max
          const wch = Math.min(60, Math.max(headerLen, maxCellLen) + 2);
          return { wch };
        });
      };
      wsExact['!cols'] = calcCols(exact);
      wsMissing['!cols'] = calcCols(missing);
      XLSXLib.utils.book_append_sheet(wb, wsExact, 'Exact');
      XLSXLib.utils.book_append_sheet(wb, wsMissing, 'Missing');
      XLSXLib.writeFile(wb, 'CaseConTimeCK.xlsx');
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[TimeCK] XLSX export failed, exporting CSV instead', err);
    }
    // Last resort: export combined CSV
    try {
      const combined = [
        ...exact.map(r => ({ Table: 'Exact', ...r })),
        ...missing.map(r => ({ Table: 'Missing', ...r })),
      ];
      downloadCSV('CaseConTimeCK.csv', combined);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TimeCK] CSV export failed', err);
    }
  };

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
            className="bg-orange-500 text-white px-6 py-2 rounded font-semibold hover:bg-orange-600" 
            onClick={() => { try { clearEditedValues(); clearDeviationMessages(); } catch {} if (typeof onClearResults === 'function') onClearResults(); }}
          >
            Clear Results
          </button>
        </div>
      
        <div className="text-sm text-gray-700">
          <span className="font-semibold">Exact Matches:</span>{' '}
          <span className="inline-block px-2 py-0.5 rounded bg-green-100 text-green-700 font-semibold mr-2">{exactRows.length}</span>
          <span className="font-semibold">Missing:</span>{' '}
          <button
            type="button"
            className={`inline-block px-2 py-0.5 rounded font-semibold mr-2 ${showMissing ? 'bg-yellow-200 text-yellow-900' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            onClick={() => setShowMissing(v => !v)}
            title="Click to view missing lines"
          >
            {missingRows.length}
          </button>
          <span className="ml-2 mr-1 font-semibold">Display:</span>
          <div className="inline-flex border rounded overflow-hidden align-middle">
            <button
              className={`px-2 py-0.5 text-xs font-semibold ${displayMode === '12h' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
              onClick={() => setDisplayMode('12h')}
            >12h</button>
            <button
              className={`px-2 py-0.5 text-xs font-semibold ${displayMode === '24h' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
              onClick={() => setDisplayMode('24h')}
            >24h</button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto border rounded bg-white mb-2 output-scroll">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 font-bold">Line #</th>
              <th className="p-2 font-bold">Client</th>
              <th className="p-2 font-bold">Caregiver</th>
              <th className="p-2 font-bold">Time</th>
              <th className="p-2 font-bold">Result</th>
            </tr>
          </thead>
          <tbody>
            {exactRows.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-gray-500" colSpan={5}>No exact matches yet. Run Compare to generate results.</td>
              </tr>
            ) : (
              exactRows.map((row, idx) => {
                const originalIndex = rows.indexOf(row);
                const currentValue = (originalIndex in editedValues ? editedValues[originalIndex] : undefined) || row.result || row.timeChecked || '';
                const refTimeStr = formatTime12hRange(getTimeFromJovie(row)) || '';
                const analysis = analyzeDeviation(refTimeStr, currentValue);
                const tdColor = analysis.color === 'green' ? 'bg-green-50' : analysis.color === 'red' ? 'bg-red-200' : analysis.color === 'orange' ? 'bg-orange-50' : '';
                const badgeColor = analysis.color === 'green' ? 'text-green-700' : analysis.color === 'red' ? 'text-red-800' : analysis.color === 'orange' ? 'text-orange-700' : 'text-gray-600';
                const handlePaste = (e) => {
                  try {
                    const text = (e.clipboardData || window.clipboardData).getData('text');
                    if (!text) return;
                    e.preventDefault();
                    // Try 12h with optional minutes and am/pm
                    let m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b\s*[-–]\s*\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/i);
                    if (m) {
                      const start = toMinutes12h(m[1], m[2] ?? '00', m[3]);
                      let end = toMinutes12h(m[4], m[5] ?? '00', m[6]);
                      if (end <= start) end += 24 * 60;
                      const saved = `${minutesTo12hClock(start)} - ${minutesTo12hClock(end)}`;
                      const shown = displayMode === '24h'
                        ? `${minutesTo24h(start)} - ${minutesTo24h(end)}`
                        : saved;
                      if (e.currentTarget) e.currentTarget.textContent = shown;
                      if (originalIndex >= 0) setEditedValue(originalIndex, saved);
                      if (typeof onResultEdit === 'function' && originalIndex >= 0) onResultEdit(originalIndex, saved);
                      return;
                    }
                    // Try 24h HH:MM - HH:MM
                    m = text.match(/\b(\d{1,2}):(\d{2})\b\s*[-–]\s*\b(\d{1,2}):(\d{2})\b/);
                    if (m) {
                      const toMin24 = (h, mm) => (Math.min(23, Math.max(0, parseInt(h, 10))) * 60) + (Math.min(59, Math.max(0, parseInt(mm, 10))));
                      const start = toMin24(m[1], m[2]);
                      let end = toMin24(m[3], m[4]);
                      if (end <= start) end += 24 * 60;
                      const saved = `${minutesTo12hClock(start)} - ${minutesTo12hClock(end)}`;
                      const shown = displayMode === '24h'
                        ? `${minutesTo24h(start)} - ${minutesTo24h(end)}`
                        : saved;
                      if (e.currentTarget) e.currentTarget.textContent = shown;
                      if (originalIndex >= 0) setEditedValue(originalIndex, saved);
                      if (typeof onResultEdit === 'function' && originalIndex >= 0) onResultEdit(originalIndex, saved);
                      return;
                    }
                    // Fallback: do nothing
                  } catch {}
                };
                const handleKeyDown = async (e) => {
                  try {
                    const isPasteShortcut = (e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V');
                    if (!isPasteShortcut) return;
                    // Prefer Clipboard API if available
                    if (navigator.clipboard && navigator.clipboard.readText) {
                      const text = await navigator.clipboard.readText();
                      if (!text) return;
                      e.preventDefault();
                      // Try 12h with optional minutes and am/pm
                      let m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b\s*[-–]\s*\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/i);
                      if (m) {
                        const start = toMinutes12h(m[1], m[2] ?? '00', m[3]);
                        let end = toMinutes12h(m[4], m[5] ?? '00', m[6]);
                        if (end <= start) end += 24 * 60;
                        const saved = `${minutesTo12hClock(start)} - ${minutesTo12hClock(end)}`;
                        const shown = displayMode === '24h'
                          ? `${minutesTo24h(start)} - ${minutesTo24h(end)}`
                          : saved;
                        if (e.currentTarget) e.currentTarget.textContent = shown;
                        if (originalIndex >= 0) setEditedValue(originalIndex, saved);
                        if (typeof onResultEdit === 'function' && originalIndex >= 0) onResultEdit(originalIndex, saved);
                        return;
                      }
                      // Try 24h HH:MM - HH:MM
                      m = text.match(/\b(\d{1,2}):(\d{2})\b\s*[-–]\s*\b(\d{1,2}):(\d{2})\b/);
                      if (m) {
                        const toMin24 = (h, mm) => (Math.min(23, Math.max(0, parseInt(h, 10))) * 60) + (Math.min(59, Math.max(0, parseInt(mm, 10))));
                        const start = toMin24(m[1], m[2]);
                        let end = toMin24(m[3], m[4]);
                        if (end <= start) end += 24 * 60;
                        const saved = `${minutesTo12hClock(start)} - ${minutesTo12hClock(end)}`;
                        const shown = displayMode === '24h'
                          ? `${minutesTo24h(start)} - ${minutesTo24h(end)}`
                          : saved;
                        if (e.currentTarget) e.currentTarget.textContent = shown;
                        if (originalIndex >= 0) setEditedValue(originalIndex, saved);
                        if (typeof onResultEdit === 'function' && originalIndex >= 0) onResultEdit(originalIndex, saved);
                        return;
                      }
                    }
                  } catch {}
                };
                return (
                <tr key={idx}>
                  <td className="p-2">{row.line || idx + 1}</td>
                  <td className="p-2">{row.client}</td>
                  <td className="p-2">{row.caregiver}</td>
                  <td className="p-2">{formatDisplayRange(getTimeFromJovie(row), displayMode)}</td>
                  <td className={`p-2 ${tdColor}`}>
                    <div
                      role="textbox"
                      contentEditable
                      suppressContentEditableWarning
                      onPaste={handlePaste}
                      onKeyDown={handleKeyDown}
                      onFocus={(e) => selectAllIn(e.currentTarget)}
                      onClick={(e) => selectAllIn(e.currentTarget)}
                      className="min-w-[180px] px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-orange-400"
                    >
                      {currentValue ? formatDisplayRange(currentValue, displayMode) : ''}
                    </div>
                    {analysis.badge ? (
                      <div className={`mt-1 text-xs font-semibold ${badgeColor}`}>{analysis.badge}</div>
                    ) : null}
                  </td>
                </tr>
              );})
            )}
          </tbody>
        </table>
      </div>
      {showMissing && (
        <div className="mt-4">
          <div className="text-sm text-gray-700 font-semibold mb-2">Missing items</div>
          <div className="overflow-x-auto border rounded bg-white output-scroll">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-200">
                <tr>
                  <th className="p-2 font-bold">Line #</th>
                  <th className="p-2 font-bold">Client</th>
                  <th className="p-2 font-bold">Caregiver</th>
                  <th className="p-2 font-bold">Date</th>
                  <th className="p-2 font-bold">Time</th>
                  <th className="p-2 font-bold">Source</th>
                  <th className="p-2 font-bold">Type</th>
                </tr>
              </thead>
              <tbody>
                {missingRows.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-gray-500" colSpan={7}>No missing items.</td>
                  </tr>
                ) : (
                  missingRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="p-2">{row.line || idx + 1}</td>
                      <td className="p-2">{row.client}</td>
                      <td className="p-2">{row.caregiver}</td>
                      <td className="p-2">{row.date || ''}</td>
                      <td className="p-2">{formatDisplayRange(getTimeFromJovie(row), displayMode)}</td>
                      <td className="p-2">{row.source || ''}</td>
                      <td className="p-2">{row.match_type || row.tag || ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimeCK;
// Backward-compatible named export if imported elsewhere
export const ResultsPanel = TimeCK;