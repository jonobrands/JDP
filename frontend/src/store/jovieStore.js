import { create } from 'zustand';

const useJovieStore = create(set => ({
  jovieRows: [],
  setJovieRows: (rows) => set({ jovieRows: rows }),
  clearJovieRows: () => set({ jovieRows: [] }),
}));

export default useJovieStore;
