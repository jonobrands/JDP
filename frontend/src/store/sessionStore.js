import { create } from 'zustand';

export default create((set) => ({
  // Session state
  activeModule: 'buca',
  statusBar: {
    message: 'Ready',
    date: null,
  },
  
  // Actions
  actions: {
    setActiveModule: (module) => set({ activeModule: module }),
    setStatus: (message, date = new Date()) => 
      set({ statusBar: { message, date } }),
  },
  
  // Modules state
  modules: {
    // Module-specific state can be added here
  },
}));