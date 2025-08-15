import React, { useState, useEffect } from 'react';
import { useBucaStore } from '../store/bucaStore';
import { useExchangeStore } from '../store/exchangeStore';
import CopyCell from '../CopyCell';
import * as api from '../api';
import { normalizeName } from '../utils/normalizeName';
import { getMultipleCaregiverRows, resolveMultipleCaregiverRow } from '../utils/multipleCaregiver';

/**
 * Standalone BUCA Panel Component
 * Handles BUCA input, parsing, UID registry mapping, and table display.
 * All logic and state are encapsulated. Plug-and-play in any React app.
 */
function BucaPanel({ onStatusUpdate }) {
  // Get all necessary state and actions from the store
  const {
    bucaText,
    bucaRows,
    setBucaText,
    setBucaRows,
    clearBucaRows,
    updateBucaRow,
    lastUpdated
  } = useBucaStore();
  
  // Local UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUIDs, setShowUIDs] = useState(false);
  
  // Multi-CG Modal State
  const [multiCGRows, setMultiCGRows] = useState([]);
  const [showMultiCGModal, setShowMultiCGModal] = useState(false);
  const [selectedMultiCGRow, setSelectedMultiCGRow] = useState(null);
  
  // Load saved state on mount
  useEffect(() => {
    if (bucaRows?.length > 0 && onStatusUpdate) {
      onStatusUpdate(`Loaded ${bucaRows.length} BUCA records`);
    }
  }, [bucaRows, onStatusUpdate]);

  // Get exchange store
  const exchange = useExchangeStore();
  
  // Process BUCA input and attach UIDs
  const handleProcessBuca = async () => {
    if (!bucaText.trim()) {
      setError('Please enter BUCA data');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Process the BUCA text
      const result = await api.processBuca(bucaText);
      if (!result?.rows?.length) {
        throw new Error('No valid data found in BUCA input');
      }
      
      const sortedRows = [...result.rows].sort((a, b) => (a.client || '').localeCompare(b.client || ''));

      // Enrich with UIDs from backend (exact names, no aliasing)
      let uidMaps = { clients: {}, caregivers: {} };
      try {
        uidMaps = await api.ensureUidsForRows(sortedRows);
      } catch (e) {
        console.warn('BUCA UID ensure failed, proceeding without enrichment', e);
      }
      const rowsWithUIDs = sortedRows.map(r => ({
        ...r,
        clientUID: uidMaps.clients?.[String(r.client || '').trim()] || r.clientUID || '',
        caregiverUID: (() => {
          const primary = Array.isArray(r.caregivers) && r.caregivers.length > 0 ? r.caregivers[0] : (r.caregiver || '');
          return uidMaps.caregivers?.[String(primary).trim()] || r.caregiverUID || '';
        })()
      }));
      
      // Update local state
      setBucaRows(rowsWithUIDs);
      
      console.log('Publishing to exchange store:', { 
        rows: rowsWithUIDs,
        timestamp: new Date().toISOString()
      });
      
      // Publish to exchange store
      exchange.publish('buca', { 
        rows: rowsWithUIDs,
        uidSynced: true,
        timestamp: new Date().toISOString()
      });
      
      if (onStatusUpdate) {
        onStatusUpdate(`Processed ${rowsWithUIDs.length} BUCA records`);
      }
      
      // Note: avoid duplicate re-publish; we already published enriched rows above.
      
    } catch (error) {
      console.error('Error processing BUCA data:', error);
      setError(error.message || 'Failed to process BUCA data');
      
      if (onStatusUpdate) {
        onStatusUpdate('Error processing BUCA data');
      }
    } finally {
      setLoading(false);
    }
  };

  const clearBuca = () => {
    // Clear everything in the store
    clearBucaRows();
    // Clear local state
    setError('');
    setMultiCGRows([]);
    setShowMultiCGModal(false);
    setSelectedMultiCGRow(null);
    
    if (onStatusUpdate) onStatusUpdate('BUCA data cleared');
  };

  // Identify CG logic – find rows with multiple caregivers and open modal
  const handleIdentify = () => {
    const flaggedRows = getMultipleCaregiverRows(bucaRows);

    if (!Array.isArray(flaggedRows) || flaggedRows.length === 0) {
      setError('No rows with multiple caregivers found.');
      setShowMultiCGModal(false);
      setSelectedMultiCGRow(null);
      setMultiCGRows([]);
      return;
    }

    const flaggedRowsWithIndex = flaggedRows
      .map(row => {
        const rowIndex = bucaRows.findIndex(r => r.client === row.client && r.caseNumber === row.caseNumber);
        return { ...row, rowIndex };
      })
      .filter(r => r.rowIndex !== -1);

    if (flaggedRowsWithIndex.length === 0) {
      setError('Could not locate rows in the current data.');
      setShowMultiCGModal(false);
      setSelectedMultiCGRow(null);
      setMultiCGRows([]);
      return;
    }

    setMultiCGRows(flaggedRowsWithIndex);
    setSelectedMultiCGRow(flaggedRowsWithIndex[0]);
    setShowMultiCGModal(true);
    setError('');
  };

  const handleResolveMultiCG = (rowIndex, selectedCaregiver) => {
    // 1. Update the row in bucaRows
    const updatedRows = bucaRows.map((row, idx) => {
      if (idx === rowIndex) {
        return {
          ...row,
          caregiver: selectedCaregiver,
          caregivers: [selectedCaregiver] // Ensure single caregiver in array
        };
      }
      return row;
    });
  
    // 2. Update the raw text (only if bucaText exists)
    let updatedText = bucaText;
    if (typeof bucaText === 'string' && bucaText.length > 0) {
      const separator = bucaText.includes('\r\n') ? '\r\n' : '\n';
      const lines = bucaText.split(/\r?\n/);
      const cgRegex = /(ESTCaregiver:\s*)([^\n\r]*)/i;
      const targetCase = updatedRows[rowIndex] && updatedRows[rowIndex].caseNumber;

      let lineIdx = -1;
      if (targetCase) {
        lineIdx = lines.findIndex(l => l.includes(targetCase));
      }

      if (lineIdx !== -1) {
        lines[lineIdx] = lines[lineIdx].replace(cgRegex, `$1${selectedCaregiver}`);
        updatedText = lines.join(separator);
      } else if (lines[rowIndex] != null) {
        // Fallback to index-based replacement
        lines[rowIndex] = lines[rowIndex].replace(cgRegex, `$1${selectedCaregiver}`);
        updatedText = lines.join(separator);
      }
    }
  
    // 3. Update all states
    setBucaRows(updatedRows);
    useBucaStore.getState().setBucaRows(updatedRows);
    if (typeof updatedText === 'string') {
      setBucaText(updatedText);
      useBucaStore.getState().setBucaText(updatedText);
    }
    // 3b. Publish to exchange so other modules (e.g., UID Registry) get fresh data
    try {
      exchange.publish('buca', {
        rows: updatedRows,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Exchange publish failed:', e);
    }
  
    // 4. Find the next row with multiple caregivers from our tracked multiCGRows
    const currentRowInMultiCGRows = multiCGRows.findIndex(row => row.rowIndex === rowIndex);
    const nextMultiCGIndex = currentRowInMultiCGRows + 1;
    
    if (nextMultiCGIndex < multiCGRows.length) {
      // Move to next row in our tracked multiCGRows
      const nextRow = multiCGRows[nextMultiCGIndex];
      setSelectedMultiCGRow({
        ...nextRow,
        rowIndex: nextRow.rowIndex
      });
    } else {
      // No more rows, close modal
      setShowMultiCGModal(false);
      setSelectedMultiCGRow(null);
      setMultiCGRows([]); // Reset the multiCGRows when done
    }
  };

  const handleResolveMultiCG_OLD = (rowIndex, selectedCaregiver) => {
    // 1. Update the row in bucaRows
    const updatedRows = bucaRows.map((row, idx) => {
      if (idx === rowIndex) {
        return {
          ...row,
          caregiver: selectedCaregiver,
          caregivers: [selectedCaregiver] // Ensure single caregiver in array
        };
      }
      return row;
    });
  
    // 2. Update the raw text
    const updatedText = bucaText.split('\n').map((line, idx) => {
      if (idx === rowIndex) {
        return line.replace(/(ESTCaregiver:\s*)([^\n]*)/i, `$1${selectedCaregiver}`);
      }
      return line;
    }).join('\n');
  
    // 3. Update all states
    setBucaRows(updatedRows);
    setBucaText(updatedText);
    useBucaStore.getState().setBucaRows(updatedRows);
    useBucaStore.getState().setBucaText(updatedText);
  
    // 4. Find the next row with multiple caregivers
    const nextRow = updatedRows.findIndex((row, idx) => 
      Array.isArray(row.caregivers) && 
      row.caregivers.length > 1
    );
  
    if (nextRow !== -1) {
      // Move to next row with multiple caregivers
      setSelectedMultiCGRow({
        ...updatedRows[nextRow],
        rowIndex: nextRow
      });
    } else {
      // No more rows, close modal
      setShowMultiCGModal(false);
      setSelectedMultiCGRow(null);
    }
  };

  const handleExport = () => {};

  return (
    <div>
      <div className="bg-gray-50 border rounded p-4 mb-4">
        <label className="block font-semibold mb-2">Paste BUCA data here (One entry per line)</label>
        <textarea
          className="w-full h-64 p-2 border rounded font-mono text-sm"
          placeholder="Paste BUCA data here..."
          value={bucaText}
          onChange={(e) => {
            const newText = e.target.value;
            // Update both local state and store
            setBucaText(newText);
            useBucaStore.getState().setBucaText(newText);
          }}
          disabled={loading}
        />
      </div>
      <div className="flex gap-4 mb-4 items-center">
        <button className="bg-orange-500 text-white px-6 py-2 rounded font-semibold hover:bg-orange-600" onClick={handleProcessBuca} disabled={loading}>Process</button>
        <button className="bg-gray-300 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-400" onClick={clearBuca}>Clear</button>
        <button className="bg-orange-400 text-white px-6 py-2 rounded font-semibold hover:bg-orange-500" onClick={handleIdentify} disabled={getMultipleCaregiverRows(bucaRows).length === 0}>IDENTIFY CG</button>
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
              <th className="p-2 border font-bold">Case Number</th>
            </tr>
          </thead>
          <tbody>
            {[...bucaRows].sort((a, b) => (a.client || '').localeCompare(b.client || '')).map((row, idx) => (
              <tr key={idx}>
                <CopyCell>{idx + 1}</CopyCell>
                <CopyCell>
                  {row.client}
                  {showUIDs && (
                    <span className="text-gray-500 text-xs ml-2">[{row.clientUID || row.client_uid || row.clientId || row.client_id || ''}]</span>
                  )}
                </CopyCell>
                <CopyCell>
                  {Array.isArray(row.caregivers) ? row.caregivers.join(', ') : (row.caregiver || '')}
                  {showUIDs && (
                    <span className="text-gray-500 text-xs ml-2">[{row.caregiverUID || row.caregiver_uid || row.caregiverId || row.caregiver_id || ''}]</span>
                  )}
                </CopyCell>
                <CopyCell>{
                  typeof row.caseNumber === 'string'
                    ? row.caseNumber.replace(/\s*Date:.*$/i, '').trim()
                    : row.caseNumber
                }</CopyCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Multi-Caregiver Modal (BUCA only) */}
      {showMultiCGModal && selectedMultiCGRow && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 min-w-[340px] max-w-[90vw]">
            <h2 className="text-lg font-bold mb-2">Resolve Multiple Caregivers</h2>
            <div className="mb-2">
              <div><span className="font-semibold">Client:</span> {selectedMultiCGRow.client}</div>
              <div><span className="font-semibold">Case #:</span> {selectedMultiCGRow.caseNumber}</div>
              <div><span className="font-semibold">Date:</span> {selectedMultiCGRow.date}</div>
            </div>
            <div className="mb-4">
              <div className="font-semibold mb-1">Select the correct caregiver:</div>
              <div className="flex flex-col gap-2">
                {(Array.isArray(selectedMultiCGRow.caregivers) 
                  ? selectedMultiCGRow.caregivers 
                  : typeof selectedMultiCGRow.caregiver === 'string' 
                    ? selectedMultiCGRow.caregiver.split(',').map(cg => cg.trim()).filter(Boolean)
                    : []
                ).map((cg, idx) => (
                  <button
                    key={idx}
                    className="bg-blue-500 hover:bg-blue-600 text-white rounded px-4 py-2 text-left"
                    onClick={() => {
                      console.log('Selected caregiver:', cg, 'for row index:', selectedMultiCGRow.rowIndex);
                      handleResolveMultiCG(selectedMultiCGRow.rowIndex, cg);
                    }}
                  >
                    {cg}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 rounded px-4 py-2"
                onClick={() => {
                  setShowMultiCGModal(false);
                  setSelectedMultiCGRow(null);
                }}
              >Cancel</button>
              <button
                className="bg-orange-400 hover:bg-orange-500 text-white rounded px-4 py-2"
                onClick={() => {
                  // Auto-select first caregiver if user skips
                  if (selectedMultiCGRow.caregivers && selectedMultiCGRow.caregivers.length > 0) {
                    handleResolveMultiCG(selectedMultiCGRow.rowIndex, selectedMultiCGRow.caregivers[0]);
                  } else {
                    setShowMultiCGModal(false);
                    setSelectedMultiCGRow(null);
                  }
                }}
              >Skip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BucaPanel;
