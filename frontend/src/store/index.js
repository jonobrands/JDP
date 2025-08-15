// Import the stores
import usePersistentStore from './persistentStore';
import useSessionStore from './sessionStore';

// Create typed hooks for better IDE support
const useSessionActions = () => useSessionStore(state => state.actions);
const useStatusBar = () => useSessionStore(state => state.statusBar);
const useModuleState = (module) => useSessionStore(state => state.modules[module] || {});

// Export everything
export {
  // Stores
  usePersistentStore,
  useSessionStore,
  
  // Session hooks
  useSessionActions,
  useStatusBar,
  useModuleState,
  
  // Default export for backward compatibility
  usePersistentStore as default
};

// TypeScript-like type hints for better IDE support
/** @typedef {import('./sessionStore').SessionState} SessionState */
/** @typedef {import('./persistentStore').PersistentState} PersistentState */