import React from 'react';
import { deleteCorrection } from './api';

export default function UniversalCorrectionsModal({ open, corrections, onClose, onDelete }) {
  if (!open) return null;

  const handleDelete = async (corr) => {
    await deleteCorrection(corr);
    if (onDelete) onDelete();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-xl">
        <h2 className="text-lg font-bold mb-4">Universal Corrections</h2>
        <table className="min-w-full text-sm mb-4">
          <thead>
            <tr>
              <th className="p-2 border font-bold">#</th>
              <th className="p-2 border font-bold">Field</th>
              <th className="p-2 border font-bold">Wrong Value</th>
              <th className="p-2 border font-bold">Correct Value</th>
              <th className="p-2 border font-bold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {(corrections || []).map((corr, idx) => (
              <tr key={idx}>
                <td className="p-2 border">{idx + 1}</td>
                <td className="p-2 border capitalize">{corr.type}</td>
                <td className="p-2 border">{corr.buca}</td>
                <td className="p-2 border">{corr.jovie}</td>
                <td className="p-2 border text-center">
                  <button
                    className="text-red-600 font-bold"
                    title="Delete"
                    onClick={() => handleDelete(corr)}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <button className="px-4 py-2 bg-gray-300 rounded" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
