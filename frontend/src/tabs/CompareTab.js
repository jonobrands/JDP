import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

import CorrectionsModal from '../CorrectionsModal';
import UniversalCorrectionsModal from '../UniversalCorrectionsModal';

export default function CompareTab({
  onCompare, onClearResults, onExport, rows = [], showCorrectionsModal, setShowCorrectionsModal, correctionsRows, setCorrectionsRows, onTempCorrection, handleSaveCorrections, universalCorrectionsOpen, setUniversalCorrectionsOpen, corrections, fetchCorrections
}) {
  // Always sort rows alphabetically by client name for display
  const sortedRows = [...rows].sort((a, b) => (a.client || '').localeCompare(b.client || ''));

  // Modal state for temporary mismatch correction
  const [showTempModal, setShowTempModal] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]); // Both rows for the mismatch
  const [selectedVersion, setSelectedVersion] = useState('');
  const [mismatchField, setMismatchField] = useState('caregiver'); // or 'client'

  // Helper to normalize names for robust comparison
  function normalize(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const handleCorrectionClick = (row) => {
  // Try to find a pair by normalized client first
  let tempRows = [
    rows.find(r => (r.tag === 'temp_mismatch' || r.match_type === 'Temporary Mismatch') && normalize(r.client) === normalize(row.client) && r.source === 'BUCA'),
    rows.find(r => (r.tag === 'temp_mismatch' || r.match_type === 'Temporary Mismatch') && normalize(r.client) === normalize(row.client) && r.source === 'JOVIE')
  ].filter(Boolean);

  // If not found, try to pair by (caregiver, caseNumber)
  if (tempRows.length !== 2 && row.caseNumber) {
    tempRows = [
      rows.find(r => (r.tag === 'temp_mismatch' || r.match_type === 'Temporary Mismatch') && r.caregiver === row.caregiver && r.caseNumber === row.caseNumber && r.source === 'BUCA'),
      rows.find(r => (r.tag === 'temp_mismatch' || r.match_type === 'Temporary Mismatch') && r.caregiver === row.caregiver && r.caseNumber === row.caseNumber && r.source === 'JOVIE')
    ].filter(Boolean);
  }
  // If not found, try to pair by (caregiver) only
  if (tempRows.length !== 2) {
    tempRows = [
      rows.find(r => (r.tag === 'temp_mismatch' || r.match_type === 'Temporary Mismatch') && r.caregiver === row.caregiver && r.source === 'BUCA'),
      rows.find(r => (r.tag === 'temp_mismatch' || r.match_type === 'Temporary Mismatch') && r.caregiver === row.caregiver && r.source === 'JOVIE')
    ].filter(Boolean);
  }
  if (tempRows.length !== 2) {
    // If not both BUCA and JOVIE found, do not open modal
    return;
  }
  // Decide which field is mismatched
  let field = 'caregiver';
  if (tempRows[0].caregiver !== tempRows[1].caregiver) field = 'caregiver';
  else if (tempRows[0].client !== tempRows[1].client) field = 'client';
  setMismatchField(field);
  setSelectedRows(tempRows);
  setShowTempModal(true);
  setSelectedVersion('');
};

  const handleTempConfirm = () => {
    if (selectedRows.length === 2 && selectedVersion) {
      const bucaRow = selectedRows.find(r => r.source === 'BUCA');
      const jovieRow = selectedRows.find(r => r.source === 'JOVIE');
      let correctionObj;
      if (mismatchField === 'client') {
        // Client mismatch: push a client mapping
        correctionObj = {
          buca: bucaRow.client,
          jovie: jovieRow.client,
          type: 'client'
        };
      } else {
        // Caregiver mismatch: push a caregiver mapping (global, no client field)
        correctionObj = {
          buca: bucaRow.caregiver,
          jovie: jovieRow.caregiver,
          type: 'caregiver'
        };
      }
      onTempCorrection(correctionObj, selectedVersion);
      setShowTempModal(false);
      setSelectedRows([]);
      setSelectedVersion('');
    }
  };

  const handleTempCancel = () => {
    setShowTempModal(false);
    setSelectedRows([]);
    setSelectedVersion('');
  };


  return (
    <div>
      {/* Legend and Controls */}
      <div className="flex gap-6 mt-2 mb-4 text-sm items-center">
        <button
          className="ml-auto px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs border border-gray-400"
          onClick={() => setUniversalCorrectionsOpen && setUniversalCorrectionsOpen(true)}
        >
          Manage Corrections
        </button>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-green-100 border border-green-400 rounded"></span> Exact Match</div>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-blue-100 border border-blue-400 rounded"></span> Verify Which CG</div>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-purple-100 border border-purple-400 rounded"></span> Possible Fuzzy Match</div>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-yellow-100 border border-yellow-400 rounded"></span> Temporary Mismatch</div>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-red-100 border border-red-400 rounded"></span> Complete Mismatch</div>
      </div>
      <div className="flex gap-4 mb-4">
        <button className="bg-orange-500 text-white px-6 py-2 rounded font-semibold hover:bg-orange-600" onClick={onCompare}>Compare BUCA & JOVIE</button>
        <button className="bg-gray-300 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-400" onClick={onClearResults}>Clear Results</button>
      </div>
      <div className="overflow-x-auto border rounded bg-white mb-2">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 font-bold">#</th>
              <th className="p-2 font-bold">Source</th>
              <th className="p-2 font-bold">Client</th>
              <th className="p-2 font-bold">Caregiver</th>
              <th className="p-2 font-bold">Match Type</th>
              <th className="p-2 font-bold">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              let bg = '';
              if (row.tag === 'exact_match' || row.match_type === 'Exact Match') bg = 'bg-green-100';
              else if (row.tag === 'verify_cg' || row.match_type === 'Verify Which CG') bg = 'bg-blue-100';
              else if (row.tag === 'fuzzy_match' || row.match_type === 'Possible Fuzzy Match') bg = 'bg-purple-100';
              else if (row.tag === 'temp_mismatch' || row.match_type === 'Temporary Mismatch') bg = 'bg-yellow-100';
              else if (row.tag === 'complete_mismatch' || row.match_type === 'Complete Mismatch') bg = 'bg-red-100';
              const isTempMismatch = row.tag === 'temp_mismatch' || row.match_type === 'Temporary Mismatch';
              return (
                <tr key={idx} className={bg + ' border-b'}
                  onClick={isTempMismatch ? () => handleCorrectionClick(row) : undefined}
                  style={isTempMismatch ? { cursor: 'pointer' } : {}}
                >
                  <td className="p-2">{idx + 1}</td>
                  <td className="p-2">{row.source}</td>
                  <td className="p-2">{row.client}</td>
                  <td className="p-2">{row.caregiver}</td>
                  <td className="p-2">{row.match_type}</td>
                  <td className="p-2">{typeof row.confidence === 'number' ? `${Math.round(row.confidence * 100)}%` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* --- Per-row Corrections Modal for BUCA Identify CG --- */}
      <CorrectionsModal
        open={showCorrectionsModal}
        rows={correctionsRows}
        onClose={() => setShowCorrectionsModal && setShowCorrectionsModal(false)}
        onSave={handleSaveCorrections}
      />
      {/* --- Universal Corrections Modal for Manage Corrections --- */}
      <UniversalCorrectionsModal
        open={universalCorrectionsOpen}
        corrections={corrections}
        onClose={() => setUniversalCorrectionsOpen && setUniversalCorrectionsOpen(false)}
        onDelete={fetchCorrections}
      />
      {/* --- Temporary Mismatch Correction Modal --- */}
      {showTempModal && selectedRows.length === 2 && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Resolve Temporary Mismatch</h2>
            <div className="mb-2">Client: <b>{selectedRows[0].client}</b></div>
            <div className="mb-4">{mismatchField.charAt(0).toUpperCase() + mismatchField.slice(1)} Options:</div>
            <div className="flex flex-col gap-2 mb-4">
              <button
                className={`px-4 py-2 rounded border ${selectedVersion === 'BUCA' ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}
                onClick={() => setSelectedVersion('BUCA')}
              >
                BUCA: {mismatchField === 'caregiver' ? selectedRows.find(r => r.source === 'BUCA')?.caregiver : selectedRows.find(r => r.source === 'BUCA')?.client}
              </button>
              <button
                className={`px-4 py-2 rounded border ${selectedVersion === 'JOVIE' ? 'bg-orange-500 text-white' : 'bg-gray-100'}`}
                onClick={() => setSelectedVersion('JOVIE')}
              >
                JOVIE: {mismatchField === 'caregiver' ? selectedRows.find(r => r.source === 'JOVIE')?.caregiver : selectedRows.find(r => r.source === 'JOVIE')?.client}
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button className="bg-gray-300 px-4 py-2 rounded" onClick={handleTempCancel}>Cancel</button>
              <button className="bg-orange-600 text-white px-4 py-2 rounded" disabled={!selectedVersion} onClick={handleTempConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}