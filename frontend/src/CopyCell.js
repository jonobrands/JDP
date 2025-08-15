import React, { useState } from 'react';

export default function CopyCell({ children }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(children?.toString() || '')
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 900);
        });
    }
  };

  return (
    <td
      className="p-2 border cursor-pointer hover:bg-orange-100 relative"
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
