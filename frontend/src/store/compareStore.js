import { create } from 'zustand';

const useCompareStore = create(set => ({
  compareResults: [],
  setCompareResults: rows => set({ compareResults: rows }),
  // Extend with more compare state as needed (corrections, user selections, etc.)
}));

export default useCompareStore;
