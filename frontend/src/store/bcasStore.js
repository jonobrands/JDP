import { create } from 'zustand';

const useBcasStore = create((set, get) => ({
  bcasTableRows: [],
  setBcasTableRows: rows => set({ bcasTableRows: rows }),
  // Session-only edits: index -> parsed case number
  editedResults: {},
  setEditedResult: (index, value) => set(state => ({ editedResults: { ...state.editedResults, [index]: value } })),
  setEditedResults: (map) => set({ editedResults: { ...(map || {}) } }),
  clearEditedResults: () => set({ editedResults: {} }),

  // Confirmations: index -> { parsedCase, matched: boolean, timestamp }
  confirmations: {},
  setConfirmation: (index, payload) => set((state) => ({
    confirmations: { ...state.confirmations, [index]: payload }
  })),
  setConfirmations: (map) => set({ confirmations: { ...(map || {}) } }),
  clearConfirmations: () => set({ confirmations: {} }),
}));

export default useBcasStore;
