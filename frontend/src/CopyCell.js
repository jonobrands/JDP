import React, { useState } from 'react';

export default function CopyCell({ children, className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    try {
      const text = (e?.currentTarget?.innerText || '').trim();
      if (!text) return;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 900);
        });
      }
    } catch {}
  };

  return (
    <td
      className={`p-2 border cursor-pointer hover:bg-orange-100 relative ${className}`}
      onClick={handleCopy}
      title="Click to copy"
    >
      {children}
      {copied && (
        <span className="absolute right-1 top-1 text-xs text-orange-600 bg-white px-1 rounded shadow">Copied!</span>
      )}
    </td>
  );
}
