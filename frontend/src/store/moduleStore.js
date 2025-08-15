import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Create a store for module data sharing
export const useModuleStore = create(
  persist(
    (set, get) => ({
      // Store module data by module name
      moduleData: {},
      
      // Get data for a specific module
      getModuleData: (moduleName) => {
        return get().moduleData[moduleName] || {};
      },
      
      // Set data for a specific module
      setModuleData: (moduleName, data) => {
        set((state) => ({
          moduleData: {
            ...state.moduleData,
            [moduleName]: {
              ...(state.moduleData[moduleName] || {}),
              ...data
            }
          }
        }));
      },
      
      // Clear data for a specific module
      clearModuleData: (moduleName) => {
        set((state) => {
          const newData = { ...state.moduleData };
          delete newData[moduleName];
          return { moduleData: newData };
        });
      },
      
      // Clear all module data
      clearAllModuleData: () => {
        set({ moduleData: {} });
      }
    }),
    {
      name: 'module-storage', // name of the item in the storage (must be unique)
      getStorage: () => localStorage, // use localStorage for persistence
    }
  )
);

// Example usage in a module:
/*
import { useModuleStore } from '../store/moduleStore';

function MyModule() {
  // Get module data
  const moduleData = useModuleStore(state => state.getModuleData('myModule'));
  
  // Set module data
  const setModuleData = useModuleStore(state => state.setModuleData);
  
  // Example usage
  const handleSave = (data) => {
    setModuleData('myModule', {
      ...moduleData,
      ...data
    });
  };
  
  // Rest of your component...
}
*/
