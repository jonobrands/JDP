import { create } from 'zustand';

// Session-only store for ReconPanel edited results
const useReconStore = create((set) => ({
  editedResults: {}, // index -> parsed case number
  setEditedResult: (index, value) => set((state) => ({
    editedResults: { ...state.editedResults, [index]: value },
  })),
  setEditedResults: (map) => set({ editedResults: { ...(map || {}) } }),
  clearEditedResults: () => set({ editedResults: {} }),
}));

export default useReconStore;
