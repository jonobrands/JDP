import { create } from 'zustand';

/**
 * BUCA Module Store
 * Handles all BUCA-related state with persistence
 */
export const useBucaStore = create(
  (set, get) => ({
      // State
      bucaText: '',
      bucaRows: [],
      lastUpdated: null,
      
      // Actions
      setBucaText: (text) => set({ bucaText: text }),
      
      setBucaRows: (rows) => set({ 
        bucaRows: rows,
        lastUpdated: new Date().toISOString() 
      }),
      
      clearBucaRows: () => set({ 
        bucaRows: [],
        bucaText: '',
        lastUpdated: null 
      }),
      
      // Get a specific row by index
      getBucaRow: (index) => {
        const rows = get().bucaRows;
        return rows[index] || null;
      },
      
      // Update a specific row
      updateBucaRow: (index, updates) => set((state) => {
        const newRows = [...state.bucaRows];
        newRows[index] = { ...newRows[index], ...updates };
        return { 
          bucaRows: newRows,
          lastUpdated: new Date().toISOString()
        };
      })
    })
);

// Initialize the store with default values if needed
const initializeStore = () => {
  const store = useBucaStore.getState();
  if (!store.lastUpdated) {
    store.setBucaRows([]);
  }
};

// Run initialization (non-persistent)
initializeStore();

// --- RECON EXCHANGE STORE FOR MODULES ---
// Shared pub/sub for BCAS normalized cases and TimeCK times

export const useReconExchangeStore = create((set, get) => ({
  bucaCases: [], // [{ client, caregiver, caseNumber, line }]
  timeByCase: {}, // { [caseNumberLower]: timeChecked }

  setBucaCases: (cases) => set({ bucaCases: Array.isArray(cases) ? cases : [] }),
  setTimeByCase: (mapObj) => set({ timeByCase: mapObj || {} }),

  // Helper to sanitize a case number consistently
  _sanitizeCase: (val) => {
    if (typeof val === 'string') return val.replace(/\s*(?:Date:|ESTCaregiver:).*$/i, '').trim();
    return val || '';
  },

  // Compute merged RECON rows from bucaCases and timeByCase with client|caregiver fallback
  getReconRows: () => {
    const { bucaCases, timeByCase, _sanitizeCase } = get();
    // Build pair-based index from available times (if rows carry client/caregiver, else only case-based)
    const timeByPair = new Map();
    // timeByCase is case->time; no pairs available from here by default

    return (bucaCases || []).map((b, idx) => {
      const client = b.client || '';
      const caregiver = b.caregiver || '';
      const caseNumber = _sanitizeCase(b.caseNumber);
      let timeChecked = '';
      if (caseNumber) timeChecked = timeByCase[caseNumber.toLowerCase()] || '';
      if (!timeChecked) {
        const key = `${client.toString().toLowerCase()}|${caregiver.toString().toLowerCase()}`;
        timeChecked = timeByPair.get(key) || '';
      }
      return {
        line: b.line ?? b.row ?? (idx + 1),
        client,
        caregiver,
        caseNumber,
        timeChecked,
        status: 'checked',
      };
    });
  },
}));
