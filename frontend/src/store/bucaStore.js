import { create } from 'zustand';

const useBucaStore = create(set => ({
  bucaRows: [],
  setBucaRows: (rows) => set({ bucaRows: rows }),
  clearBucaRows: () => set({ bucaRows: [] }),
}));

export default useBucaStore;
