import React, { useState } from 'react';

// Per-row CorrectionsModal for BUCA Identify CG
export default function CorrectionsModal({ open, rows, onClose, onSave }) {
  const [corrections, setCorrections] = useState([]);

  React.useEffect(() => {
    // Initialize corrections state from rows
    if (open && rows) {
      setCorrections(rows.map(row => ({ row: row.row, caregivers: [''] }))); // Start with no caregiver selected
    }
  }, [open, rows]);

  const handleCaregiverSelect = (rowIdx, caregiver) => {
    setCorrections(prev => prev.map((c, idx) => idx === rowIdx ? { ...c, caregivers: [caregiver] } : c));
  };

  const handleSave = () => {
    onSave && onSave(corrections);
    onClose && onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-xl">
        <h2 className="text-lg font-bold mb-4">Resolve Multiple Caregivers</h2>
        <table className="min-w-full text-sm mb-4">
          <thead>
            <tr>
              <th className="p-2 border font-bold">Client</th>
              <th className="p-2 border font-bold">Caregivers</th>
              <th className="p-2 border font-bold">Select Correct</th>
            </tr>
          </thead>
          <tbody>
            {rows && rows.map((row, idx) => (
              <tr key={idx}>
                <td className="p-2 border">{row.client}</td>
                <td className="p-2 border">{row.caregivers.join(', ')}</td>
                <td className="p-2 border">
                  <select
                    value={corrections[idx]?.caregivers[0] === undefined ? '' : corrections[idx]?.caregivers[0]}
                    onChange={e => handleCaregiverSelect(idx, e.target.value)}
                  >
                    <option value="">Select</option>
                    {row.caregivers.map(cg => (
                      <option key={cg} value={cg}>{cg}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end space-x-2">
          <button className="px-4 py-2 bg-gray-300 rounded" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
