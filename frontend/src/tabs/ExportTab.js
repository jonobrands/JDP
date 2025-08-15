import React, { useState } from 'react';

export default function ExportTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const resp = await fetch('http://localhost:5000/export');
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      // Download file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CaseConResults.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Export Results</h2>
      <button
        className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
        onClick={handleExport}
        disabled={loading}
      >
        {loading ? 'Exporting...' : 'Download Excel'}
      </button>
      {error && <div className="text-red-600 font-semibold mt-2">{error}</div>}
      {success && <div className="text-green-600 font-semibold mt-2">Export successful! Check your downloads.</div>}
    </div>
  );
}
