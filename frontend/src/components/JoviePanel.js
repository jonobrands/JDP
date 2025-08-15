import React, { useState, useEffect } from 'react';
import { useJovieStore } from '../store/jovieStore';
import { useExchangeStore } from '../store/exchangeStore';
import CopyCell from '../CopyCell';
import * as api from '../api';
import { normalizeName } from '../utils/normalizeName';
import { formatTime12hRange } from '../utils/formatting';

/**
 * Standalone JOVIE Panel Component
 * Handles JOVIE input, parsing, UID registry mapping, and table display.
 * All logic and state are encapsulated. Plug-and-play in any React app.
 */
function JoviePanel({ onStatusUpdate }) {
  const jovieText = useJovieStore(state => state.jovieText);
  const setJovieText = useJovieStore(state => state.setJovieText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUIDs, setShowUIDs] = useState(false);
  const jovieRows = useJovieStore(state => state.jovieRows);
  const setJovieRows = useJovieStore(state => state.setJovieRows);
  const [jovieDate, setJovieDate] = useState(null);
  const exchange = useExchangeStore();

  // Process JOVIE input and attach UIDs
  const handleProcessJovie = async () => {
    setLoading(true); setError('');
    try {
      const result = await api.processJovie(jovieText);
      let sortedRows = (result.rows || []).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
      // Enrich with UIDs from backend (exact names, no aliasing)
      let uidMaps = { clients: {}, caregivers: {} };
      try {
        uidMaps = await api.ensureUidsForRows(sortedRows);
      } catch (e) {
        console.warn('JOVIE UID ensure failed, proceeding without enrichment', e);
      }
      const rowsWithUIDs = sortedRows.map(r => ({
        ...r,
        clientUID: uidMaps.clients?.[String(r.client || '').trim()] || r.clientUID || '',
        caregiverUID: uidMaps.caregivers?.[String(r.caregiver || '').trim()] || r.caregiverUID || ''
      }));
      // Update local state
      setJovieRows(rowsWithUIDs);
      setJovieDate(result.date || null);
      
      // Publish to exchange store
      exchange.publish('jovie', { 
        rows: rowsWithUIDs,
        date: result.date,
        uidSynced: true,
        timestamp: new Date().toISOString()
      });
      
      console.log('Published JOVIE data to exchange store');
      if (onStatusUpdate) {
        const d = result.date || null;
        onStatusUpdate({
          message: `Processed ${rowsWithUIDs.length} JOVIE records`,
          count: rowsWithUIDs.length,
          date: d
        });
      }
    } catch (e) {
      console.error('Error processing JOVIE data:', e);
      setError('Failed to process JOVIE data');
      setJovieDate(null);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setJovieText('');
    setJovieRows([]);
    setJovieDate(null);
    setError('');
    if (onStatusUpdate) onStatusUpdate({ message: 'JOVIE cleared', count: 0, date: null });
  };

  // Placeholder for Export logic (can be further modularized)
  const handleExport = () => {};


  return (
    <div>
      <div className="bg-gray-50 border rounded p-4 mb-4">
        <label className="block font-semibold mb-2">Paste JOVIE data here (In Blocks)</label>
        <textarea
          className="w-full h-24 border rounded p-2 mb-4"
          value={jovieText}
          onChange={e => setJovieText(e.target.value)}
        />
      </div>
      <div className="flex gap-4 mb-4 items-center">
        <button className="bg-orange-500 text-white px-6 py-2 rounded font-semibold hover:bg-orange-600" onClick={handleProcessJovie} disabled={loading}>Process</button>
        <button className="bg-gray-300 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-400" onClick={handleClear}>Clear</button>
        <label className="flex items-center gap-2 ml-2 text-sm">
          <input type="checkbox" checked={showUIDs} onChange={e=>setShowUIDs(e.target.checked)} />
          <span>Show UIDs</span>
        </label>
      </div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <div className="overflow-x-auto border rounded bg-white mb-4 max-h-[350px] overflow-y-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 border font-bold">#</th>
              <th className="p-2 border font-bold">Client</th>
              <th className="p-2 border font-bold">Caregiver</th>
              <th className="p-2 border font-bold">Time</th>
            </tr>
          </thead>
          <tbody>
            {[...jovieRows].sort((a, b) => (a.client || '').localeCompare(b.client || '')).map((row, idx) => (
              <tr key={idx}>
                <CopyCell>{idx + 1}</CopyCell>
                <CopyCell>
                  {row.client}
                  {showUIDs && (
                    <span className="text-gray-500 text-xs ml-2">[{row.clientUID || row.client_uid || row.clientId || row.client_id || ''}]</span>
                  )}
                </CopyCell>
                <CopyCell>
                  {row.caregiver}
                  {showUIDs && (
                    <span className="text-gray-500 text-xs ml-2">[{row.caregiverUID || row.caregiver_uid || row.caregiverId || row.caregiver_id || ''}]</span>
                  )}
                </CopyCell>
                <CopyCell>{formatTime12hRange(row.timeRange || row.time)}</CopyCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default JoviePanel;
