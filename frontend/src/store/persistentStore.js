import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export default create(
  persist(
    (set) => ({
      // Your persistent state here
      theme: 'light',
      // Global debug logging toggle (controls console diagnostics in modules)
      debugLogs: false,
      setDebugLogs: (value) => set({ debugLogs: !!value }),
      toggleDebugLogs: () => set((state) => ({ debugLogs: !state.debugLogs })),
      // Add other persistent state as needed
    }),
    {
      name: 'app-persistent-storage',
    }
  )
);