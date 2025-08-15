import { create } from 'zustand';

export const useJovieStore = create((set) => ({
  // Raw text (non-persistent across refresh)
  jovieText: '',
  setJovieText: (text) => set({ jovieText: text }),

  // Parsed rows and date
  jovieRows: [],
  setJovieRows: (rows) => set({ jovieRows: rows }),
  clearJovieRows: () => set({ jovieRows: [] }),
}));
