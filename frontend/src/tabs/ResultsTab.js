import React from 'react';

import useJovieStore from '../store/jovieStore';
import { formatTime12hRange } from '../utils/formatting';

import { useState } from 'react';

import * as XLSX from 'xlsx';

export default function ResultsTab({ rows = [], onExport, onClearResults }) {
  // Always sort results by client name
  const [editRowId, setEditRowId] = useState(null); // {client, caregiver} of row being edited
  const [modalOpen, setModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const [tableRows, setTableRows] = useState([...rows]); // local copy for editing

  // Modal autofocus and Enter-to-save support
  const textareaRef = React.useRef(null);
  React.useEffect(() => {
    if (modalOpen && textareaRef.current) textareaRef.current.focus();
  }, [modalOpen]);

  // Extract/save handler for modal
  function handleExtractSave() {
    let newTime = '';
    // Only allow valid time ranges (start and end with dash)
    const validRange = /^(\d{1,2}:\d{2}(?:\s?(?:AM|PM|am|pm))?)\s*[-–]\s*(\d{1,2}:\d{2}(?:\s?(?:AM|PM|am|pm))?)$/;
    const trimmed = rawInput.trim();
    if (validRange.test(trimmed)) {
      newTime = trimmed;
    } else {
      // Try to extract a valid range from the input
      const rangeRegex = /(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?\s*[-–]\s*\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?)/;
      const match = rawInput.match(rangeRegex);
      if (match && validRange.test(match[1])) {
        newTime = match[1];
      } else {
        // Try fallback range without AM/PM
        const fallback = rawInput.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
        if (fallback) {
          const candidate = `${fallback[1]}-${fallback[2]}`;
          if (validRange.test(candidate)) {
            newTime = candidate;
          } else {
            newTime = '';
          }
        } else {
          newTime = '';
        }
      }
    }
    // If not a valid range, mark as Invalid
    if (!newTime || !validRange.test(newTime)) {
      newTime = 'Invalid time';
    }
    setTableRows(prev => prev.map(r =>
      r.client === (editRowId?.client) && r.caregiver === (editRowId?.caregiver)
        ? { ...r, bTime: newTime }
        : r
    ));
    setModalOpen(false); setEditRowId(null); setRawInput('');
  }

  const sortedRows = [...tableRows].sort((a, b) => (a.client || '').localeCompare(b.client || ''));

  // Excel export handler
  function handleExport() {
    const data = sortedRows.map((row, idx) => {
      const j = row.jTime || getJovieTime(row.client, row.caregiver);
      const b = row.bTime;
      const cmp = compareTimes(j, b);
      let status = '';
      if (typeof cmp === 'string' && cmp.includes('Alarm')) status = 'alarm';
      else if (typeof cmp === 'string' && cmp.startsWith('Match:')) status = 'match';
      else status = 'other';
      let scheduleText = '';
      if (status === 'alarm') {
        let problem = '';
        if (cmp.startsWith('Alarm:')) problem = 'Both times discrepancy';
        else if (cmp.startsWith('Alarm start')) problem = 'Start time discrepancy';
        else if (cmp.startsWith('Alarm end')) problem = 'End time discrepancy';
        else if (cmp.includes('Alarm start') && cmp.includes('Alarm end')) problem = 'Both times discrepancy';
        else if (cmp.includes('Alarm start')) problem = 'Start time discrepancy';
        else if (cmp.includes('Alarm end')) problem = 'End time discrepancy';
        else problem = 'Schedule discrepancy';
        scheduleText = `Alarm - ${problem}`;
      } else if (status === 'match') {
        scheduleText = cmp;
      } else if (typeof cmp === 'string' && (cmp.startsWith('Early') || cmp.startsWith('Later'))) {
        scheduleText = `B: ${formatTime12hRange(b)} | J: ${formatTime12hRange(j)}`;
      } else {
        scheduleText = cmp;
      }
      return {
        '#': idx + 1,
        'Client': row.client || '',
        'Caregiver': row.caregiver || '',
        'J-Time': formatTime12hRange(j) || '',
        'B-Time': formatTime12hRange(b) || '',
        'Schedule Integrity': scheduleText,
        '_status': status
      };
    });
    // Remove _status from sheet but keep for coloring
    const ws = XLSX.utils.json_to_sheet(data.map(({_status, ...rest}) => rest));
    // Auto-size columns robustly
    const colNames = Object.keys(data[0] || {});
    ws['!cols'] = colNames.map((key, i) => {
      let maxLen = key.length;
      for (let row of data) {
        const val = row[key] !== undefined && row[key] !== null ? String(row[key]) : '';
        if (val.length > maxLen) maxLen = val.length;
      }
      // Add extra padding (e.g. +6) for readability
      return { wch: maxLen + 6 };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, 'CaseConResults.xlsx');
  }

  // Helper to parse time (handles 7:00am, 07:00 am, 7:00, etc.)
  function parse(t) {
    if (!t) return [null, null];
    if (t === 'Invalid time') return [null, null];
    // If range, use first (start) and last (end); split on dash with optional spaces
    const parts = t.split(/\s*[-–]\s*/).map(s => s.trim());
    // Normalize AM/PM
    const times = parts.map(p => {
      let m = p.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
      if (!m) return null;
      let h = parseInt(m[1], 10);
      let min = m[2] !== undefined ? parseInt(m[2], 10) : 0;
      let ap = m[3] ? m[3].toUpperCase() : null;
      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      // Out of bounds check
      if (h < 0 || h > 23 || min < 0 || min > 59) return null;
      return h * 60 + min;
    });
    console.log('[parse] input:', t, '| parts:', parts, '| times:', times);
    return times;
  }

  // Compare J-Time and B-Time and return schedule output
  // Helper to format a time in minutes to 12-hour string
  function formatMins12h(mins) {
    if (mins == null) return '';
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    let ampm = h >= 12 ? 'PM' : 'AM';
    let displayH = h % 12;
    if (displayH === 0) displayH = 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  }
  // Helper to format a range string (e.g. '12:00 pm - 05:00 pm') to '12:00 PM to 05:00 PM'
  function formatTime12hRange(t) {
    const [start, end] = parse(t);
    if (start == null) return '';
    if (end != null) return `${formatMins12h(start)} to ${formatMins12h(end)}`;
    return formatMins12h(start);
  }

  function compareTimes(jTime, bTime) {
    const [jStart, jEnd] = parse(jTime);
    const [bStart, bEnd] = parse(bTime);
    console.log('[compareTimes] jTime:', jTime, 'bTime:', bTime, '| jStart:', jStart, 'jEnd:', jEnd, 'bStart:', bStart, 'bEnd:', bEnd);
    // If either J-Time or B-Time is missing or cannot be parsed, show '-'
    if (!jTime || !bTime || (jStart == null && jEnd == null) || (bStart == null && bEnd == null)) {
      return '-';
    }
    let startLabel = '', endLabel = '';
    // Start time compare
    if (jStart != null && bStart != null) {
      const diff = bStart - jStart;
      if (Math.abs(diff) >= 60) startLabel = 'Alarm';
      else if (diff < 0) startLabel = 'Early';
      else if (diff > 0) startLabel = 'Later';
      else startLabel = 'Match';
    }
    // End time compare
    if (jEnd != null && bEnd != null) {
      const diff = bEnd - jEnd;
      if (Math.abs(diff) >= 60) endLabel = 'Alarm';
      else if (diff < 0) endLabel = 'Early';
      else if (diff > 0) endLabel = 'Later';
      else endLabel = 'Match';
    }
    // If both match (by normalized minutes), output clean 'Match: [start] to [end]'
    if (
      jStart != null && bStart != null && jEnd != null && bEnd != null &&
      jStart === bStart && jEnd === bEnd
    ) {
      // Use normalized 12h output for clarity
      return `Match: ${formatMins12h(jStart)} to ${formatMins12h(jEnd)}`;
    }
    // If both are the same and not empty (Alarm, Early, Later)
    if (startLabel && startLabel === endLabel) {
      return `${startLabel}: ${formatTime12hRange(bTime)}`;
    }
    // Otherwise, show both start/end if both exist
    if (startLabel && endLabel) {
      return `${startLabel} start, ${endLabel} end: ${formatTime12hRange(bTime)}`;
    } else if (startLabel) {
      return `${startLabel} start: ${formatTime12hRange(bTime)}`;
    } else if (endLabel) {
      return `${endLabel} end: ${formatTime12hRange(bTime)}`;
    } else {
      return formatTime12hRange(bTime);
    }
  }

  // Helper to format time (12h or 24h as needed)
  function formatTime(time) {
    if (!time) return '';
    // If already formatted, return as is
    if (typeof time === 'string') return time;
    // If object with start/end
    if (typeof time === 'object' && time.start && time.end) {
      return `${time.start} - ${time.end}`;
    }
    return String(time);
  }

  // Zustand: get all JOVIE rows
  const jovieRows = useJovieStore(state => state.jovieRows);

  // Helper to get Jovie time for a client
  function getJovieTime(client, caregiver) {
    // Try to match both client and caregiver for best accuracy
    const found = jovieRows.find(r => r.client === client && r.caregiver === caregiver);
    if (found) return found.time;
    // Fallback: match by client only
    const foundByClient = jovieRows.find(r => r.client === client);
    return foundByClient ? foundByClient.time : '';
  }

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-4">
        <button
          className="bg-gray-300 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-400"
          onClick={onClearResults}
        >
          Clear Results
        </button>
        <button
          className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700"
          onClick={handleExport}
        >
          Export to Excel
        </button>
      </div>
      <div className="overflow-x-auto border rounded bg-white mb-2">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 border">#</th>
              <th className="p-2 border">Client</th>
              <th className="p-2 border">Caregiver</th>
              <th className="p-2 border">J-Time</th>
              <th className="p-2 border">B-Time</th>
              <th className="p-2 border">Schedule Integrity</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx}>
                <td className="p-2 border text-center">{idx + 1}</td>
                <td className="p-2 border">{row.client || '-'}</td>
                <td className="p-2 border">{row.caregiver || '-'}</td>
                <td className="p-2 border">{formatTime12hRange(row.jTime || getJovieTime(row.client, row.caregiver)) || '-'}</td>
                <td className="p-2 border cursor-pointer text-blue-700 hover:underline" onClick={() => {
                  setEditRowId({ client: row.client, caregiver: row.caregiver });
                  setModalOpen(true);
                  setRawInput('');
                }}>
                  {formatTime12hRange(row.bTime) || 'Click to add'}
                </td>
                <td
                  className="p-2 border"
                  style={{
                    background: (() => {
                      const j = row.jTime || getJovieTime(row.client, row.caregiver);
                      const b = row.bTime;
                      const cmp = compareTimes(j, b);
                      if (typeof cmp === 'string' && cmp.includes('Alarm')) return '#fee2e2'; // red-100 for any Alarm
                      if (typeof cmp === 'string' && cmp.startsWith('Match:')) return '#d1fae5'; // green-100
                      return '#fffbe6'; // default
                    })()
                  }}
                >{
                  (() => {
                    const j = row.jTime || getJovieTime(row.client, row.caregiver);
                    const b = row.bTime;
                    const cmp = compareTimes(j, b);
                    if (typeof cmp === 'string' && cmp.includes('Alarm')) {
                      // Only show Alarm and the problem, do NOT show B-Time or J-Time
                      let problem = '';
                      if (cmp.startsWith('Alarm:')) problem = 'Both times discrepancy';
                      else if (cmp.startsWith('Alarm start')) problem = 'Start time discrepancy';
                      else if (cmp.startsWith('Alarm end')) problem = 'End time discrepancy';
                      else if (cmp.includes('Alarm start') && cmp.includes('Alarm end')) problem = 'Both times discrepancy';
                      else if (cmp.includes('Alarm start')) problem = 'Start time discrepancy';
                      else if (cmp.includes('Alarm end')) problem = 'End time discrepancy';
                      else problem = 'Schedule discrepancy';
                      return (
                        <div>
                          <div className="font-bold text-base mb-1">Alarm</div>
                          <div className="text-xs text-gray-700">{problem}</div>
                        </div>
                      );
                    }
                    if (typeof cmp === 'string' && cmp.startsWith('Match:')) {
                      return cmp;
                    }
                    if (typeof cmp === 'string' && (cmp.startsWith('Early') || cmp.startsWith('Later'))) {
                      return (
                        <div>
                          <div className="font-bold text-base mb-1">{formatTime12hRange(b)}</div>
                          <div className="text-xs text-gray-500">{formatTime12hRange(j)}</div>
                        </div>
                      );
                    }
                    return cmp;
                  })()
                }</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Modal for B-Time editing */}
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
          <div className="bg-white rounded shadow-lg p-6 w-80">
            <h2 className="text-lg font-semibold mb-2">Paste Raw Data for B-Time</h2>
            <textarea
              ref={textareaRef}
              className="border rounded w-full p-2 mb-4"
              rows={4}
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              placeholder="Paste or type raw data here..."
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (rawInput.trim()) handleExtractSave();
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                onClick={() => { setModalOpen(false); setEditRowId(null); setRawInput(''); }}
              >Cancel</button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={handleExtractSave}
                disabled={!rawInput.trim()}
              >Extract & Save</button>
            </div>
          </div>
        </div>
      )}


      <div className="mt-4 text-xs text-gray-500 border-t pt-2">
        Status: Results loaded. Sorted by client name.
      </div>
    </div>
  );
}
