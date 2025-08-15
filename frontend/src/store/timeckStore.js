import { create } from 'zustand';

// Session-only store for TimeCK edited values.
// - Persist across tab switches (in-memory)
// - Reset on reload/refresh (no localStorage)
export const useTimeckStore = create((set, get) => ({
  editedValues: {}, // { [rowIndex:number]: string }
  deviationMessages: {}, // { [rowIndex:number]: string }

  // Set or update a single edited value by original row index
  setEditedValue: (index, value) =>
    set((state) => ({ editedValues: { ...state.editedValues, [index]: value } })),

  // Bulk replace edited values (optional utility)
  setEditedValues: (map) => set({ editedValues: { ...map } }),

  // Clear all edited values (e.g., when clearing results)
  clearEditedValues: () => set({ editedValues: {} }),

  // Set or update a deviation message by original row index
  setDeviationMessage: (index, message) =>
    set((state) => ({ deviationMessages: { ...state.deviationMessages, [index]: message || '' } })),

  // Bulk replace deviation messages
  setDeviationMessages: (map) => set({ deviationMessages: { ...map } }),

  // Clear all deviation messages (e.g., when clearing results)
  clearDeviationMessages: () => set({ deviationMessages: {} }),
}));
