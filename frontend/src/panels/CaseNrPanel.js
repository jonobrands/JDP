import React, { useState, useRef, useEffect } from 'react';

// Expects: bucaRows = [{ client, caregiver, caseNumber }]
export default function BcasTab({ bucaRows = [] }) {
  // Sticky bar state
  const [pasteInput, setPasteInput] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(null);
  // Table state: [{ client, caregiver, bcase, jcase }]

  // Table state: [{ client, caregiver, bcase, jcase }]
  const [tableRows, setTableRows] = useState(
    bucaRows.map(row => ({
      client: row.client,
      caregiver: row.caregiver,
      bcase: row.caseNumber || '',
      jcase: '',
    }))
  );
  const [editRowIdx, setEditRowIdx] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (modalOpen && textareaRef.current) textareaRef.current.focus();
  }, [modalOpen]);

  function extractCaseNumber(input) {
    // Try to extract after label first
    const labelMatch = input.match(/BUC Case Number:\s*([A-Z0-9\-]+)/i);
    if (labelMatch) return labelMatch[1].trim();
    // Fallback: find first code-like pattern (e.g., 00G-05T5-KSR6D)
    const codeMatch = input.match(/[A-Z0-9]{2,}-[A-Z0-9]{4,}-[A-Z0-9]{4,}/i);
    if (codeMatch) return codeMatch[0].trim();
    // Fallback: find any 4+ digit/letter code
    const generic = input.match(/[A-Z0-9\-]{6,}/i);
    return generic ? generic[0].trim() : '';
  }

  function handleSaveJCase() {
    const extracted = extractCaseNumber(rawInput.trim());
    setTableRows(rows => rows.map((row, idx) =>
      idx === editRowIdx ? { ...row, jcase: extracted } : row
    ));
    setModalOpen(false);
    setEditRowIdx(null);
    setRawInput('');
  }

  function getResult(bcase, jcase) {
    if (!bcase && !jcase) return '-';
    if (bcase === jcase && bcase) return 'MATCH';
    if (bcase && jcase && bcase !== jcase) return 'INCORRECT';
    return '-';
  }

  function getResultColor(bcase, jcase) {
    if (bcase === jcase && bcase) return '#d1fae5'; // green-100
    if (bcase && jcase && bcase !== jcase) return '#fee2e2'; // red-100
    return '#fff';
  }

  // Parse reservation block for client/case number
  function parseReservationBlock(text) {
    const clientMatch = text.match(/Client:\s*(.+)/i);
    const caseMatch = text.match(/BUC Case Number:\s*([A-Z0-9\-]+)/i);
    return {
      client: clientMatch ? clientMatch[1].trim() : '',
      jcase: caseMatch ? caseMatch[1].trim() : '',
    };
  }

  // Handle sticky bar paste
  function handlePasteReservation(e) {
    e.preventDefault();
    const text = pasteInput.trim();
    if (!text) return;
    setPasteError("");
    const { client, jcase } = parseReservationBlock(text);
    if (!client || !jcase) {
      setPasteError("Could not parse Client or BUC Case Number.");
      return;
    }
    // Find matching row(s)
    const matchIdx = tableRows.findIndex(row => row.client && row.client.trim().toLowerCase() === client.toLowerCase());
    if (matchIdx === -1) {
      setPasteError(`No matching client found: ${client}`);
      return;
    }
    // Check for duplicate JCase in table
    const duplicate = tableRows.some((row, idx) => idx !== matchIdx && row.jcase && row.jcase === jcase);
    if (duplicate) {
      setPasteError("Duplicate case number detected. Not allowed.");
      return;
    }
    // Update row
    setTableRows(rows => rows.map((row, idx) =>
      idx === matchIdx ? { ...row, jcase } : row
    ));
    setHighlightIdx(matchIdx);
    setTimeout(() => setHighlightIdx(null), 1200);
    setPasteInput("");
  }

  return (
    <div className="p-4">
      {/* Sticky Paste Bar */}
      <div className="sticky top-0 z-10 bg-white pb-2 mb-4 border-b flex flex-col md:flex-row md:items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm font-semibold mb-1">Paste Reservation Block</label>
          <textarea
            className="w-full border rounded p-2 text-sm"
            rows={2}
            value={pasteInput}
            onChange={e => setPasteInput(e.target.value)}
            placeholder={"Paste reservation data (Client: ...\nBUC Case Number: ...)"}
            onPaste={e => {
              setTimeout(() => handlePasteReservation(e), 0);
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handlePasteReservation(e);
              }
            }}
          />
        </div>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 mt-2 md:mt-0 md:ml-2"
          onClick={handlePasteReservation}
          disabled={!pasteInput.trim()}
        >Apply</button>
      </div>
      {pasteError && (
        <div className="text-red-600 font-semibold mb-2">{pasteError}</div>
      )}

      <h2 className="text-lg font-bold mb-4">BCAS Verification</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1">#</th>
              <th className="border px-2 py-1">Client</th>
              <th className="border px-2 py-1">Caregiver</th>
              <th className="border px-2 py-1">BCase</th>
              <th className="border px-2 py-1">JCase</th>
              <th className="border px-2 py-1">Result</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, idx) => (
              <tr key={idx}>
                <td className="border px-2 py-1 text-center">{idx + 1}</td>
                <td className="border px-2 py-1">{row.client}</td>
                <td className="border px-2 py-1">{row.caregiver}</td>
                <td className="border px-2 py-1">{row.bcase}</td>
                <td className="border px-2 py-1">
                  <button
                    className="underline text-blue-600 hover:text-blue-800"
                    onClick={() => { setEditRowIdx(idx); setModalOpen(true); setRawInput(''); }}
                  >
                    {row.jcase ? row.jcase : <span className="text-gray-400">Paste</span>}
                  </button>
                </td>
                <td
                  className="border px-2 py-1 text-center font-semibold"
                  style={{ background: getResultColor(row.bcase, row.jcase) }}
                >
                  {getResult(row.bcase, row.jcase)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Modal for JCase editing */}
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
          <div className="bg-white rounded shadow-lg p-6 w-80">
            <h2 className="text-lg font-semibold mb-2">Paste Raw Data for JCase</h2>
            <textarea
              ref={textareaRef}
              className="border rounded w-full p-2 mb-4"
              rows={2}
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              placeholder="Paste or type raw data here..."
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (rawInput.trim()) handleSaveJCase();
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                onClick={() => { setModalOpen(false); setEditRowIdx(null); setRawInput(''); }}
              >Cancel</button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={handleSaveJCase}
                disabled={!rawInput.trim()}
              >Extract & Save</button>
            </div>
          </div>
        </div>
      )}
      <div className="mt-4 text-xs text-gray-500 border-t pt-2">
        Status: Paste JCase for each row. Green = MATCH, Red = INCORRECT.
      </div>
    </div>
  );
}
