import { create } from 'zustand';

const useResultsStore = create(set => ({
  resultsTableRows: [],
  setResultsTableRows: rows => set({ resultsTableRows: rows }),
}));

export default useResultsStore;
